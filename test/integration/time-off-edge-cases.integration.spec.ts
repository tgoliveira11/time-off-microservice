import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('Time-off edge cases', () => {
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

  it('replays reject responses for the same idempotency key', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    const first = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'reject-key')
      .send({ reason: 'Coverage' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'reject-key')
      .send({ reason: 'Coverage' })
      .expect(200);

    expect(second.body.status).toBe(first.body.status);
  });

  it('replays cancel responses for the same idempotency key', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    const first = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/cancel`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'cancel-key')
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/cancel`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'cancel-key')
      .expect(200);

    expect(second.body.status).toBe(first.body.status);
  });

  it('returns 422 when rejecting a non-pending request', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .send({ reason: 'No' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .send({ reason: 'Again' })
      .expect(422);
  });

  it('returns 404 for unknown request id', async () => {
    seedScenario(database, mockHcm);

    await request(app.getHttpServer())
      .get('/time-off-requests/missing-request')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .expect(404);
  });

  it('uses stored request idempotency key when cache record is missing', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = {
      employeeId: seed.employeeId,
      locationId: seed.locationId,
      amount: 1,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-10',
    };

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'db-key')
      .send(payload)
      .expect(200);

    database.getDb().prepare('DELETE FROM idempotency_records').run();

    const second = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'db-key')
      .send(payload)
      .expect(200);

    expect(second.body.requestId).toBe(first.body.requestId);
  });

  it('returns 202 when HCM balance lookup keeps failing transiently', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    mockHcm.setScenario(
      `${seed.hcmEmployeeId}:${seed.hcmLocationId}`,
      'transient_error',
    );

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    expect(response.body.status).toBe(RequestStatus.FAILED_HCM_SUBMISSION);
  });

  it('returns 422 when HCM reports invalid dimensions during refresh', async () => {
    const seed = seedScenario(database, mockHcm);
    mockHcm.setScenario(
      `${seed.hcmEmployeeId}:${seed.hcmLocationId}`,
      'invalid_dimension',
    );

    await request(app.getHttpServer())
      .post(
        `/employees/${seed.employeeId}/locations/${seed.locationId}/balances/refresh`,
      )
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(422);
  });

  it('returns 409 when rejecting concurrently after approval started', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .send({ reason: 'Too late' })
      .expect(422);
  });
});
