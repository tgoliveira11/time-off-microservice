import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('TimeOffRequest Integration', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates request and reserves balance', async () => {
    const seed = seedScenario(database, mockHcm);

    const response = await request(app.getHttpServer())
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

    expect(response.body.status).toBe(RequestStatus.PENDING_MANAGER_APPROVAL);
    expect(response.body.availableBalanceAfterReservation).toBe(8);
  });

  it('returns same request for duplicate idempotency key', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = {
      employeeId: seed.employeeId,
      locationId: seed.locationId,
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-11',
    };

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'key-1')
      .send(payload)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'key-1')
      .send(payload)
      .expect(200);

    expect(second.body.requestId).toBe(first.body.requestId);
  });

  it('returns same request when idempotency key is sent only in the body', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = {
      employeeId: seed.employeeId,
      locationId: seed.locationId,
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-07-10',
      endDate: '2026-07-11',
      idempotencyKey: 'swagger-body-key',
    };

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send(payload)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send(payload)
      .expect(200);

    expect(second.body.requestId).toBe(first.body.requestId);
    expect(second.body.availableBalanceAfterReservation).toBe(8);
  });

  it('rejects request when insufficient balance', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 1 });

    await request(app.getHttpServer())
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
      .expect(409);
  });

  it('approves request through HCM and updates status', async () => {
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

    const approved = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    expect(approved.body.status).toBe(RequestStatus.APPROVED);
    expect(approved.body.hcmTransactionId).toBeDefined();
  });

  it('blocks unauthorized manager approval', async () => {
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
      .set(authHeaders('other_mgr', 'MANAGER'))
      .expect(403);
  });

  it('releases balance on reject', async () => {
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
      .post(`/time-off-requests/${created.body.requestId}/reject`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .send({ reason: 'Coverage conflict' })
      .expect(200);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].availableBalance).toBe(10);
  });

  it('batch import preserves reservations', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    await request(app.getHttpServer())
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
      balance: 12,
      unit: 'DAYS',
      version: 'v11',
    });

    const importResult = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    expect(importResult.body.importedBalances).toBeGreaterThan(0);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].hcmBalance).toBe(12);
    expect(balances.body.balances[0].reservedBalance).toBe(2);
    expect(balances.body.balances[0].availableBalance).toBe(10);
  });
});
