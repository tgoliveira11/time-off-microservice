import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  getBetterSqlite3LoadCountForTests,
  resetBetterSqlite3LoadCountForTests,
} from '../../src/database/sqlite/load-better-sqlite3';
import { createMemoryTestApp, authHeaders } from '../helpers/test-app.helper';

describe('Memory mode without better-sqlite3', () => {
  let app: INestApplication;

  beforeAll(async () => {
    resetBetterSqlite3LoadCountForTests();
    ({ app } = await createMemoryTestApp(true));
  });

  afterAll(async () => {
    await app.close();
  });

  it('bootstraps without loading better-sqlite3', () => {
    expect(getBetterSqlite3LoadCountForTests()).toBe(0);
  });

  it('exposes health, metrics, and correlation id in memory mode', async () => {
    const health = await request(app.getHttpServer())
      .get('/health')
      .set('X-Correlation-Id', 'offline-corr-1');

    expect(health.status).toBe(200);
    expect(health.body.persistenceMode).toBe('memory');
    expect(health.headers['x-correlation-id']).toBe('offline-corr-1');

    const metrics = await request(app.getHttpServer()).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.body.requestsCreatedTotal).toBeDefined();
  });

  it('runs create and approve flow using seeded memory + mock HCM data', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      });

    expect(createResponse.status).toBe(200);

    const approveResponse = await request(app.getHttpServer())
      .post(`/time-off-requests/${createResponse.body.requestId}/approve`)
      .set(authHeaders('mgr_001', 'MANAGER'));

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.status).toBe('APPROVED');
    expect(getBetterSqlite3LoadCountForTests()).toBe(0);
  });
});
