import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { HcmClientService } from '../../src/modules/hcm/hcm-client.service';
import { HcmErrorType } from '../../src/domain/hcm-error-mapper.service';

describe('HCM Client Contract', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;
  let hcmClientService: HcmClientService;

  jest.setTimeout(15000);

  beforeAll(async () => {
    ({ app, database, mockHcm } = await createTestApp());
    hcmClientService = app.get(HcmClientService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    seedScenario(database, mockHcm);
  });

  it('handles successful balance response', async () => {
    const balance = await hcmClientService.getRealtimeBalance(
      'emp_123',
      'loc_001',
    );
    expect(balance.balance).toBe(10);
    expect(balance.version).toBe('v10');
  });

  it('handles successful submission response', async () => {
    const submission = await hcmClientService.submitTimeOff({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 2,
      unit: 'DAYS',
      externalRequestId: 'tor_contract_1',
    });
    expect(submission.status).toBe('ACCEPTED');
    expect(submission.remainingBalance).toBe(8);
  });

  it('maps insufficient balance error', async () => {
    await expect(
      hcmClientService.submitTimeOff({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 100,
        unit: 'DAYS',
        externalRequestId: 'tor_contract_2',
      }),
    ).rejects.toMatchObject({ type: HcmErrorType.INSUFFICIENT_BALANCE });
  });

  it('maps duplicate submission response', async () => {
    await hcmClientService.submitTimeOff({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 1,
      unit: 'DAYS',
      externalRequestId: 'tor_contract_dup',
    });

    await expect(
      hcmClientService.submitTimeOff({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        externalRequestId: 'tor_contract_dup',
      }),
    ).rejects.toMatchObject({ type: HcmErrorType.DUPLICATE_SUBMISSION });
  });

  it('handles batch corpus response', async () => {
    const batch = await hcmClientService.getBatchBalances();
    expect(batch.balances.length).toBe(1);
  });

  it('maps balance lookup timeout as retryable', async () => {
    mockHcm.setScenario('emp_123:loc_001', 'timeout');

    await expect(
      hcmClientService.getRealtimeBalance('emp_123', 'loc_001'),
    ).rejects.toMatchObject({ type: HcmErrorType.TIMEOUT, retryable: true });
  });

  it('maps submission timeout as retryable', async () => {
    mockHcm.setScenario('submit:tor_timeout_test', 'submit_timeout');

    await expect(
      hcmClientService.submitTimeOff({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 1,
        unit: 'DAYS',
        externalRequestId: 'tor_timeout_test',
      }),
    ).rejects.toMatchObject({ type: HcmErrorType.TIMEOUT, retryable: true });
  });

  it('maps batch import timeout as retryable', async () => {
    mockHcm.setScenario('batch', 'timeout');

    await expect(hcmClientService.getBatchBalances()).rejects.toMatchObject({
      type: HcmErrorType.TIMEOUT,
      retryable: true,
    });
  });

  it('mock HCM endpoints are reachable', async () => {
    await request(app.getHttpServer())
      .get('/mock-hcm/employees/emp_123/locations/loc_001/balance')
      .expect(200);
  });
});
