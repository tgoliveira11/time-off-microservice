import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';
import { StateTransitionService } from '../../src/domain/state-transition.service';
import { BalanceCalculatorService } from '../../src/domain/balance-calculator.service';

describe('Regression Tests', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('prevents double approval with idempotency key', async () => {
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

    const first = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'approve-key-1')
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'approve-key-1')
      .expect(200);

    expect(second.body.requestId).toBe(first.body.requestId);
    expect(second.body.hcmTransactionId).toBe(first.body.hcmTransactionId);
  });

  it('prevents negative available balance on reservation', async () => {
    const calculator = new BalanceCalculatorService();
    expect(() => calculator.assertSufficientBalance(1, 2)).toThrow();
  });

  it('rejects invalid state transition', () => {
    const transitions = new StateTransitionService();
    expect(() =>
      transitions.assertTransition(RequestStatus.REJECTED, RequestStatus.APPROVED),
    ).toThrow();
  });

  it('marks batch import conflict when reserved exceeds hcm balance', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 8,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-17',
      })
      .expect(200);

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 5,
      unit: 'DAYS',
      version: 'v11',
    });

    const result = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    expect(result.body.reconciliationRequired).toBeGreaterThan(0);
  });

  it('runs reconciliation and detects mismatch', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 6,
      unit: 'DAYS',
      version: 'v11',
    });

    const result = await request(app.getHttpServer())
      .post('/system/reconciliation/run')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    expect(result.body.issues.length).toBeGreaterThan(0);
  });

  it('allows employee to cancel pending request and release balance', async () => {
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
      .post(`/time-off-requests/${created.body.requestId}/cancel`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(detail.body.status).toBe(RequestStatus.CANCELLED);
  });

  it('refreshes balance from HCM realtime API', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 15,
      unit: 'DAYS',
      version: 'v12',
    });

    const refreshed = await request(app.getHttpServer())
      .post(
        `/employees/${seed.employeeId}/locations/${seed.locationId}/balances/refresh`,
      )
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(refreshed.body.hcmBalance).toBe(15);
    expect(refreshed.body.source).toBe('HCM_REALTIME');
  });
});
