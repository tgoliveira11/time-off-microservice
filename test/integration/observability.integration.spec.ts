import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { MetricsService } from '../../src/common/observability/metrics.service';
import { CORRELATION_HEADER } from '../../src/common/observability/correlation.middleware';

describe('Observability', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;
  let metrics: MetricsService;

  beforeAll(async () => {
    ({ app, database, mockHcm } = await createTestApp());
    metrics = app.get(MetricsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    metrics.resetForTests();
    seedScenario(database, mockHcm);
  });

  it('returns provided X-Correlation-Id on success', async () => {
    const correlationId = 'corr-success-123';
    const response = await request(app.getHttpServer())
      .get('/health')
      .set(CORRELATION_HEADER, correlationId);

    expect(response.status).toBe(200);
    expect(response.headers[CORRELATION_HEADER.toLowerCase()]).toBe(
      correlationId,
    );
  });

  it('generates X-Correlation-Id when header is missing', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers[CORRELATION_HEADER.toLowerCase()]).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it('returns correlation id on failing endpoint', async () => {
    const correlationId = 'corr-failure-456';
    const response = await request(app.getHttpServer())
      .get('/time-off-requests/missing')
      .set(CORRELATION_HEADER, correlationId)
      .set(authHeaders('emp_123', 'EMPLOYEE'));

    expect(response.status).toBe(404);
    expect(response.headers[CORRELATION_HEADER.toLowerCase()]).toBe(
      correlationId,
    );
  });

  it('GET /metrics returns expected metric keys', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      requestsCreatedTotal: expect.any(Number),
      requestsApprovedTotal: expect.any(Number),
      hcmTimeoutTotal: expect.any(Number),
      idempotencyReplayTotal: expect.any(Number),
    });
  });

  it('increments requestsCreatedTotal when creating a request', async () => {
    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      })
      .expect(200);

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.requestsCreatedTotal).toBe(1);
  });

  it('increments requestsApprovedTotal when approving a request', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${createResponse.body.requestId}/approve`)
      .set(authHeaders('mgr_001', 'MANAGER'))
      .expect(200);

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.requestsApprovedTotal).toBe(1);
  });

  it('increments hcmTimeoutTotal on timeout-after-accept approval retry path', async () => {
    mockHcm.setScenario('emp_123:loc_001', 'timeout_after_accept');

    const createResponse = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-07-01',
        endDate: '2026-07-01',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${createResponse.body.requestId}/approve`)
      .set(authHeaders('mgr_001', 'MANAGER'));

    await request(app.getHttpServer())
      .post(`/time-off-requests/${createResponse.body.requestId}/approve`)
      .set(authHeaders('mgr_001', 'MANAGER'));

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.hcmTimeoutTotal).toBeGreaterThanOrEqual(1);
  });

  it('increments idempotency replay and mismatch counters', async () => {
    const payload = {
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 1,
      unit: 'DAYS',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    };

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'idem-replay-1')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'idem-replay-1')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'idem-replay-1')
      .send({ ...payload, amount: 2 })
      .expect(409);

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.idempotencyReplayTotal).toBeGreaterThanOrEqual(1);
    expect(metricsResponse.body.idempotencyMismatchTotal).toBe(1);
  });

  it('increments batch import and reconciliation metrics', async () => {
    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    await request(app.getHttpServer())
      .post('/system/reconciliation/run')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(200);

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.batchImportSuccessTotal).toBe(1);
    expect(metricsResponse.body.reconciliationRunsTotal).toBe(1);
  });

  it('increments batchImportFailureTotal on validation failure', async () => {
    mockHcm.setScenario('batch', 'malformed');

    await request(app.getHttpServer())
      .post('/system/hcm/balances/batch-import')
      .set(authHeaders('system', 'SYSTEM_INTEGRATION'))
      .expect(422);

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.body.batchImportFailureTotal).toBe(1);
  });
});
