import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';
import { AuditLogRepository } from '../../src/database/repositories/audit-log.repository';

describe('HCM timeout after accept', () => {
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

  it('retries with same externalRequestId and completes without double consumption', async () => {
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

    const pending = await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    expect(pending.body.status).toBe(RequestStatus.FAILED_HCM_SUBMISSION);
    expect(pending.body.pendingHcmRetry).toBe(true);

    const afterTimeout = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(afterTimeout.body.balances[0].reservedBalance).toBe(2);
    expect(afterTimeout.body.balances[0].hcmBalance).toBe(10);

    expect(mockHcm.getSubmission(requestId)).toBeDefined();

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
    expect(balances.body.balances[0].availableBalance).toBe(8);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    const statuses = detail.body.statusHistory.map(
      (entry: { toStatus: string }) => entry.toStatus,
    );
    expect(statuses).toContain(RequestStatus.APPROVED_PENDING_HCM);
    expect(statuses).toContain(RequestStatus.FAILED_HCM_SUBMISSION);
    expect(statuses).toContain(RequestStatus.APPROVED);

    const auditRepo = new AuditLogRepository(database);
    const auditEntries = auditRepo.findByEntity('TIME_OFF_REQUEST', requestId);
    expect(auditEntries.some((e) => e.action === 'HCM_SUBMISSION_FAILED')).toBe(
      true,
    );
    expect(auditEntries.some((e) => e.action === 'REQUEST_APPROVED')).toBe(true);
  });
});
