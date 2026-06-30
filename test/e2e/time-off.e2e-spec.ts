import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import * as request from 'supertest';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';
import {
  assertSwaggerHasSecurity,
  assertSwaggerOperation,
  assertSwaggerResponseSchema,
  DocumentedApiCall,
  executeDocumentedCall,
  formatCallDocumentation,
} from '../helpers/documented-api.helper';

describe('TimeOff E2E (Swagger-documented flow)', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;
  let swaggerDocument: OpenAPIObject;

  beforeAll(async () => {
    ({ app, database, mockHcm, swaggerDocument } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes a complete OpenAPI document at /api-json', async () => {
    const response = await request(app.getHttpServer()).get('/api-json').expect(200);

    expect(response.body.openapi).toBe('3.0.0');
    expect(response.body.info.title).toBe('Time-Off Microservice');
    expect(response.body.components.securitySchemes).toMatchObject({
      'X-User-Id': expect.objectContaining({ type: 'apiKey', in: 'header' }),
      'X-User-Role': expect.objectContaining({ type: 'apiKey', in: 'header' }),
    });

    assertSwaggerOperation(
      swaggerDocument,
      'HealthController_check',
      'get',
      '/health',
    );
    assertSwaggerOperation(
      swaggerDocument,
      'EmployeesController_getBalances',
      'get',
      '/employees/{employeeId}/balances',
    );
    assertSwaggerOperation(
      swaggerDocument,
      'TimeOffRequestsController_create',
      'post',
      '/time-off-requests',
    );
    assertSwaggerOperation(
      swaggerDocument,
      'TimeOffRequestsController_approve',
      'post',
      '/time-off-requests/{requestId}/approve',
    );
    assertSwaggerOperation(
      swaggerDocument,
      'SystemController_batchImport',
      'post',
      '/system/hcm/balances/batch-import',
    );

    assertSwaggerHasSecurity(
      swaggerDocument,
      '/employees/{employeeId}/balances',
      'get',
    );
    assertSwaggerResponseSchema(
      swaggerDocument,
      '/health',
      'get',
      200,
      'HealthResponseDto',
    );
    assertSwaggerResponseSchema(
      swaggerDocument,
      '/time-off-requests',
      'post',
      200,
      'CreateTimeOffRequestResponseDto',
    );
  });

  it('health check returns ok', async () => {
    const call: DocumentedApiCall = {
      operationId: 'HealthController_check',
      summary: 'Health check for API, persistence, and mock HCM',
      method: 'get',
      path: '/health',
      expectedStatus: 200,
    };

    const response = await executeDocumentedCall(app, call);

    expect(formatCallDocumentation(call)).toContain('GET /health');
    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'ok',
      hcmMock: 'ok',
    });
  });

  it('happy path: create, approve, submit to HCM', async () => {
    const seed = seedScenario(database, mockHcm);

    const getBalancesCall: DocumentedApiCall = {
      operationId: 'EmployeesController_getBalances',
      summary: 'Get employee balances across locations',
      method: 'get',
      path: '/employees/:employeeId/balances',
      pathParams: { employeeId: seed.employeeId },
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      expectedStatus: 200,
    };

    const balances = await executeDocumentedCall(app, getBalancesCall);
    expect(balances.body.balances[0].availableBalance).toBe(10);
    expect(formatCallDocumentation(getBalancesCall)).toContain(
      `X-User-Id: ${seed.employeeId}`,
    );

    const createCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_create',
      summary: 'Create a time-off request and reserve local balance',
      method: 'post',
      path: '/time-off-requests',
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      body: {
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      },
      expectedStatus: 200,
    };

    const created = await executeDocumentedCall(app, createCall);
    expect(created.body).toMatchObject({
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
      availableBalanceAfterReservation: 8,
    });
    expect(formatCallDocumentation(createCall)).toContain('"amount": 2');

    const approveCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_approve',
      summary: 'Approve request, validate HCM balance, and submit to HCM',
      method: 'post',
      path: '/time-off-requests/:requestId/approve',
      pathParams: { requestId: created.body.requestId },
      headers: authHeaders(seed.managerId, 'MANAGER'),
      expectedStatus: 200,
    };

    const approved = await executeDocumentedCall(app, approveCall);
    expect(approved.body.status).toBe(RequestStatus.APPROVED);
    expect(formatCallDocumentation(approveCall)).toContain(
      `X-User-Role: MANAGER`,
    );

    const detailCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_get',
      summary: 'Get time-off request details and status history',
      method: 'get',
      path: '/time-off-requests/:requestId',
      pathParams: { requestId: created.body.requestId },
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      expectedStatus: 200,
    };

    const detail = await executeDocumentedCall(app, detailCall);
    expect(detail.body.statusHistory.length).toBeGreaterThan(0);
    expect(formatCallDocumentation(detailCall)).toContain(
      created.body.requestId,
    );
  });

  it('replays create idempotently with the same Idempotency-Key', async () => {
    const seed = seedScenario(database, mockHcm);

    const payload = {
      employeeId: seed.employeeId,
      locationId: seed.locationId,
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-07-10',
      endDate: '2026-07-11',
      idempotencyKey: 'sqlite-create-001',
    };

    const createCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_create',
      summary: 'Create a time-off request and reserve local balance',
      method: 'post',
      path: '/time-off-requests',
      headers: {
        ...authHeaders(seed.employeeId, 'EMPLOYEE'),
        'Idempotency-Key': 'sqlite-create-001',
      },
      body: payload,
      expectedStatus: 200,
    };

    const created = await executeDocumentedCall(app, createCall);
    expect(created.body.availableBalanceAfterReservation).toBe(8);

    const replay = await executeDocumentedCall(app, createCall);
    expect(replay.body.requestId).toBe(created.body.requestId);
    expect(replay.body.availableBalanceAfterReservation).toBe(8);

    const balances = await executeDocumentedCall(app, {
      operationId: 'EmployeesController_getBalances',
      summary: 'Get employee balances across locations',
      method: 'get',
      path: '/employees/:employeeId/balances',
      pathParams: { employeeId: seed.employeeId },
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      expectedStatus: 200,
    });

    expect(balances.body.balances[0].reservedBalance).toBe(2);
    expect(balances.body.balances[0].availableBalance).toBe(8);
  });

  it('insufficient balance at approval when HCM balance drops', async () => {
    const seed = seedScenario(database, mockHcm, { balance: 10 });

    const createCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_create',
      summary: 'Create a time-off request and reserve local balance',
      method: 'post',
      path: '/time-off-requests',
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      body: {
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      },
      expectedStatus: 200,
    };

    const created = await executeDocumentedCall(app, createCall);

    mockHcm.setBalance({
      employeeId: seed.hcmEmployeeId,
      locationId: seed.hcmLocationId,
      balance: 1,
      unit: 'DAYS',
      version: 'v11',
    });

    const approveCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_approve',
      summary: 'Approve request, validate HCM balance, and submit to HCM',
      method: 'post',
      path: '/time-off-requests/:requestId/approve',
      pathParams: { requestId: created.body.requestId },
      headers: authHeaders(seed.managerId, 'MANAGER'),
      expectedStatus: 409,
    };

    await executeDocumentedCall(app, approveCall);

    const detailCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_get',
      summary: 'Get time-off request details and status history',
      method: 'get',
      path: '/time-off-requests/:requestId',
      pathParams: { requestId: created.body.requestId },
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      expectedStatus: 200,
    };

    const detail = await executeDocumentedCall(app, detailCall);
    expect(detail.body.status).toBe(RequestStatus.FAILED_HCM_VALIDATION);
    expect(formatCallDocumentation(approveCall)).toContain('Expected status: 409');
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

    const batchImportCall: DocumentedApiCall = {
      operationId: 'SystemController_batchImport',
      summary: 'Import HCM batch balance corpus and reconcile local balances',
      method: 'post',
      path: '/system/hcm/balances/batch-import',
      headers: authHeaders('system', 'SYSTEM_INTEGRATION'),
      expectedStatus: 200,
    };

    const imported = await executeDocumentedCall(app, batchImportCall);
    expect(imported.body).toMatchObject({
      status: 'COMPLETED',
      importedBalances: expect.any(Number),
    });
    expect(formatCallDocumentation(batchImportCall)).toContain(
      'X-User-Role: SYSTEM_INTEGRATION',
    );

    const getBalancesCall: DocumentedApiCall = {
      operationId: 'EmployeesController_getBalances',
      summary: 'Get employee balances across locations',
      method: 'get',
      path: '/employees/:employeeId/balances',
      pathParams: { employeeId: seed.employeeId },
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      expectedStatus: 200,
    };

    const balances = await executeDocumentedCall(app, getBalancesCall);
    expect(balances.body.balances[0].hcmBalance).toBe(12);
    expect(balances.body.balances[0].availableBalance).toBe(12);
  });

  it('employee cannot access another employee request', async () => {
    const seed = seedScenario(database, mockHcm);

    const createCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_create',
      summary: 'Create a time-off request and reserve local balance',
      method: 'post',
      path: '/time-off-requests',
      headers: authHeaders(seed.employeeId, 'EMPLOYEE'),
      body: {
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      },
      expectedStatus: 200,
    };

    const created = await executeDocumentedCall(app, createCall);

    const forbiddenDetailCall: DocumentedApiCall = {
      operationId: 'TimeOffRequestsController_get',
      summary: 'Get time-off request details and status history',
      method: 'get',
      path: '/time-off-requests/:requestId',
      pathParams: { requestId: created.body.requestId },
      headers: authHeaders('other_emp', 'EMPLOYEE'),
      expectedStatus: 403,
    };

    await executeDocumentedCall(app, forbiddenDetailCall);
    expect(formatCallDocumentation(forbiddenDetailCall)).toContain(
      'X-User-Id: other_emp',
    );
  });
});
