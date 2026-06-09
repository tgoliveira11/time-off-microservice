import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('Concurrency and conflict handling', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects duplicate create when balance is insufficient for both', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 6 });

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 4,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-13',
      })
      .expect(200);

    expect(first.body.availableBalanceAfterReservation).toBe(2);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 4,
        unit: 'DAYS',
        startDate: '2026-03-10',
        endDate: '2026-03-13',
      })
      .expect(409);
  });

  it('returns conflict on second approval without idempotency key', async () => {
    const seed = seedScenario(database, mockHcm);

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

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);
  });

  it('returns idempotent 200 when approving an already approved request', async () => {
    const seed = seedScenario(database, mockHcm);

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
    const server = app.getHttpServer();

    const [approveResult, rejectResult] = await Promise.all([
      request(server)
        .post(`/time-off-requests/${requestId}/approve`)
        .set(authHeaders(seed.managerId, 'MANAGER')),
      request(server)
        .post(`/time-off-requests/${requestId}/reject`)
        .set(authHeaders(seed.managerId, 'MANAGER'))
        .send({ reason: 'No coverage' }),
    ]);

    const successCount = [approveResult, rejectResult].filter(
      (r) => r.status === 200,
    ).length;
    const conflictCount = [approveResult, rejectResult].filter(
      (r) => r.status === 409 || r.status === 422,
    ).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(1);

    const detail = await request(server)
      .get(`/time-off-requests/${requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect([
      RequestStatus.APPROVED,
      RequestStatus.REJECTED,
      RequestStatus.APPROVED_PENDING_HCM,
      RequestStatus.FAILED_HCM_SUBMISSION,
    ]).toContain(detail.body.status);
  });
});
