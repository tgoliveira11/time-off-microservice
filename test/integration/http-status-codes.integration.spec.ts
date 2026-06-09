import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('HTTP status codes for write operations', () => {
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

  it('returns 200 for successful create and approve', async () => {
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
  });

  it('returns 409 for insufficient balance on create', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 1 });

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 5,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-14',
      })
      .expect(409);
  });

  it('returns 422 for invalid employee or location', async () => {
    const seed = seedScenario(database, mockHcm);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: 'missing_location',
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      })
      .expect(422);
  });

  it('returns 202 when HCM submission is pending after timeout', async () => {
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

    mockHcm.setScenario(`submit:${created.body.requestId}`, 'timeout_after_accept');

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    expect(response.body.status).toBe(RequestStatus.FAILED_HCM_SUBMISSION);
  });

  it('returns 503 when HCM is unavailable for batch import', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'timeout');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(503);
  });

  it('returns 409 when duplicate HCM submission cannot be matched', async () => {
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
    mockHcm.setScenario(`submit:${requestId}`, 'timeout_after_accept');

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    mockHcm.setScenario(`submit:${requestId}`, 'duplicate_foreign');

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(409);
  });
});
