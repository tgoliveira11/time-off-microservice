import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';
import { AuditLogRepository } from '../../src/database/repositories/audit-log.repository';

describe('Duplicate HCM submission handling', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  jest.setTimeout(15000);

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('finalizes as APPROVED when duplicate submission and balance lookup succeed', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      })
      .expect(200);

    const requestId = created.body.requestId;
    mockHcm.setScenario(`submit:${requestId}`, 'timeout_after_accept');

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    const approved = await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    expect(approved.body.status).toBe(RequestStatus.APPROVED);
    expect(approved.body.hcmTransactionId).toBe(`hcm_tx_${requestId}`);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].hcmBalance).toBe(8);
    expect(balances.body.balances[0].reservedBalance).toBe(0);
  });

  it('marks RECONCILIATION_REQUIRED when duplicate submission balance lookup fails', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      })
      .expect(200);

    const requestId = created.body.requestId;
    mockHcm.setScenario(`submit:${requestId}`, 'timeout_after_accept');

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    mockHcm.setScenario(
      `${seed.hcmEmployeeId}:${seed.hcmLocationId}`,
      'transient_error',
    );

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(409);

    expect(response.body.status).toBe(RequestStatus.RECONCILIATION_REQUIRED);
    expect(response.body.failureReason).toContain('balance lookup failed');

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].hcmBalance).toBe(10);
    expect(balances.body.balances[0].reservedBalance).toBe(2);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    const transitions = detail.body.statusHistory.map(
      (entry: { fromStatus: string | null; toStatus: string }) => ({
        from: entry.fromStatus,
        to: entry.toStatus,
      }),
    );
    expect(transitions).toContainEqual({
      from: RequestStatus.FAILED_HCM_SUBMISSION,
      to: RequestStatus.RECONCILIATION_REQUIRED,
    });

    const auditRepo = new AuditLogRepository(database);
    const auditEntries = auditRepo.findByEntity('TIME_OFF_REQUEST', requestId);
    expect(
      auditEntries.some((entry) => entry.action === 'RECONCILIATION_REQUIRED'),
    ).toBe(true);
  });
});
