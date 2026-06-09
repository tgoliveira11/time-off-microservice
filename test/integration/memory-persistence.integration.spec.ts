import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { authHeaders, createMemoryTestApp } from '../helpers/test-app.helper';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { MemoryStore } from '../../src/database/memory/memory-store';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
} from '../../src/database/ports/repository.ports';
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
} from '../../src/database/ports/transaction-manager.port';
import { BalanceUpdateConflictError } from '../../src/database/repositories/balance.repository';

describe('Memory persistence mode', () => {
  let app: INestApplication;
  let mockHcm: MockHcmService;

  beforeAll(async () => {
    ({ app, mockHcm } = await createMemoryTestApp(true));
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots in memory mode with seeded demo data', async () => {
    const health = await request(app.getHttpServer()).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.persistenceMode).toBe('memory');
    expect(health.body.database).toBe('memory');

    const balances = await request(app.getHttpServer())
      .get('/employees/emp_123/balances')
      .set(authHeaders('emp_123', 'EMPLOYEE'));

    expect(balances.status).toBe(200);
    expect(balances.body.balances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 'loc_001',
          availableBalance: 10,
        }),
      ]),
    );
  });

  it('supports create, reserve, and manager approval through HCM mock', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
      });

    expect(createResponse.status).toBe(200);
    const requestId = createResponse.body.requestId;

    const approveResponse = await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders('mgr_001', 'MANAGER'));

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.status).toBe('APPROVED');
  });

  it('supports batch import and reconciliation in memory mode', async () => {
    mockHcm.seed({
      balances: [
        {
          employeeId: 'emp_123',
          locationId: 'loc_001',
          balance: 12,
          unit: 'DAYS',
          version: 'v11',
        },
      ],
    });

    const batchResponse = await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'));

    expect(batchResponse.status).toBe(200);

    const reconciliationResponse = await request(app.getHttpServer())
      .post('/system/reconciliation/run')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'));

    expect(reconciliationResponse.status).toBe(200);
    expect(reconciliationResponse.body.status).toBe('COMPLETED');
  });

  it('handles idempotency replay and mismatch in memory mode', async () => {
    const payload = {
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 1,
      unit: 'DAYS',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    };

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'memory-idem-1')
      .send(payload)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'memory-idem-1')
      .send(payload);

    expect(replay.status).toBe(200);

    const mismatch = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'memory-idem-1')
      .send({ ...payload, amount: 3 });

    expect(mismatch.status).toBe(409);
  });

  it('rolls back memory state when a transaction callback fails', () => {
    const store = app.get(MemoryStore);
    const tx = app.get<TransactionManagerPort>(TRANSACTION_MANAGER);
    const balances = app.get<BalanceRepositoryPort>(BALANCE_REPOSITORY);
    const before = balances.findByEmployeeAndLocation('emp_123', 'loc_001')!;

    expect(() =>
      tx.runInTransaction(() => {
        balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 4);
        throw new Error('forced failure');
      }),
    ).toThrow('forced failure');

    const balance = balances.findByEmployeeAndLocation('emp_123', 'loc_001');
    expect(balance?.availableBalance).toBe(before.availableBalance);
    expect(balance?.reservedBalance).toBe(before.reservedBalance);
    expect(store.balances.size).toBeGreaterThan(0);
  });

  it('rejects balance reservation when reconciliation is required', () => {
    const balances = app.get<BalanceRepositoryPort>(BALANCE_REPOSITORY);
    balances.updateProjection('emp_123', 'loc_001', {
      reconciliationRequired: true,
    });

    expect(() =>
      balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 1),
    ).toThrow(BalanceUpdateConflictError);
  });
});
