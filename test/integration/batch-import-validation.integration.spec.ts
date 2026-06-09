import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';

describe('Batch import validation', () => {
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

  it('rejects malformed batch rows with 422', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'malformed');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(422);
  });

  it('rejects duplicate employee/location rows with 422', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'duplicate_rows');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(422);
  });

  it('rejects negative balances with 422', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'negative');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(422);
  });

  it('rejects missing employeeId with 422', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'missing_employee');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(422);
  });

  it('returns 503 when HCM batch endpoint times out', async () => {
    seedScenario(database, mockHcm);
    mockHcm.setScenario('batch', 'timeout');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(503);
  });

  it('marks local balances missing from HCM corpus as reconciliation required', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    mockHcm.reset();
    mockHcm.seed({
      balances: [
        {
          employeeId: 'other_hcm_employee',
          locationId: seed.hcmLocationId,
          balance: 5,
          unit: 'DAYS',
          version: 'v1',
        },
      ],
    });

    const result = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    expect(result.body.reconciliationRequired).toBeGreaterThan(0);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].reconciliationRequired).toBe(true);
  });

  it('applies work anniversary bonus without dropping reservations', async () => {
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

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    const balances = await request(app.getHttpServer())
      .get(`/employees/${seed.employeeId}/balances`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(balances.body.balances[0].hcmBalance).toBe(12);
    expect(balances.body.balances[0].reservedBalance).toBe(2);
    expect(balances.body.balances[0].availableBalance).toBe(10);
  });

  it('caches batch import by system actor idempotency scope', async () => {
    seedScenario(database, mockHcm);

    const first = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .set('Idempotency-Key', 'batch-key-1')
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .set('Idempotency-Key', 'batch-key-1')
      .expect(200);

    expect(second.body.jobId).toBe(first.body.jobId);
  });
});
