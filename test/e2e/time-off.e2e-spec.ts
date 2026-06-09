import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('TimeOff E2E', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeAll(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('health check returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('ok');
    expect(response.body.hcmMock).toBe('ok');
  });

  it('happy path: create, approve, submit to HCM', async () => {
    const seed = seedScenario(database, mockHcm);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);
    expect(balances.body.balances[0].availableBalance).toBe(10);

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

    const approved = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    expect(approved.body.status).toBe(RequestStatus.APPROVED);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(detail.body.statusHistory.length).toBeGreaterThan(0);
  });

  it('insufficient balance at approval when HCM balance drops', async () => {
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

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 1,
      unit: 'DAYS',
      version: 'v11',
    });

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(409);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(detail.body.status).toBe(RequestStatus.FAILED_HCM_VALIDATION);
  });

  it('work anniversary bonus via batch import', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 12,
      unit: 'DAYS',
      version: 'v11',
    });

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].hcmBalance).toBe(12);
    expect(balances.body.balances[0].availableBalance).toBe(12);
  });

  it('employee cannot access another employee request', async () => {
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
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders('other_emp', 'EMPLOYEE'))
      .expect(403);
  });
});
