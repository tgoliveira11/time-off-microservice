import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('Extended time-off flows', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists pending requests for manager', async () => {
    const seed = seedScenario(database, mockHcm);

    await request(app.getHttpServer())
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

    const pending = await request(app.getHttpServer())
      .get(`/managers/${seed.managerId}/time-off-requests`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    expect(pending.body.length).toBe(1);
    expect(pending.body[0].status).toBe(RequestStatus.PENDING_MANAGER_APPROVAL);
  });

  it('allows manager to view direct report request', async () => {
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
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);
  });

  it('returns 503 when HCM realtime refresh times out', async () => {
    const seed = seedScenario(database, mockHcm);
    mockHcm.setScenario(`${seed.hcmEmployeeId}:${seed.hcmLocationId}`, 'timeout');

    await request(app.getHttpServer())
      .post(
        `/employees/${seed.employeeId}/locations/${seed.locationId}/balances/refresh`,
      )
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(503);
  });

  it('returns 404 when refreshing unknown employee balance', async () => {
    seedScenario(database, mockHcm);

    await request(app.getHttpServer())
      .post('/employees/missing/locations/loc_001/balances/refresh')
      .set(authHeaders('missing', 'EMPLOYEE'))
      .expect(404);
  });

  it('returns 403 when manager views another manager queue', async () => {
    const seed = seedScenario(database, mockHcm);

    await request(app.getHttpServer())
      .get('/managers/other_mgr/time-off-requests')
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(403);
  });

  it('rejects create for another employee when role is employee', async () => {
    const seed = seedScenario(database, mockHcm);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: 'other_emp',
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(403);
  });

  it('allows system admin to view any request', async () => {
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
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders('admin', 'SYSTEM_ADMIN'))
      .expect(200);
  });

  it('allows system integration actor to view any request', async () => {
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
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);
  });

  it('allows system admin to cancel pending requests', async () => {
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
      .post(`/time-off-requests/${created.body.requestId}/cancel`)
      .set(authHeaders('admin', 'SYSTEM_ADMIN'))
      .expect(200);
  });
});
