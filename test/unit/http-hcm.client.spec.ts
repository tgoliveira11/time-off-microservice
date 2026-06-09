import { HttpHcmClient } from '../../src/modules/hcm/http-hcm.client';
import { HcmErrorMapperService, HcmErrorType } from '../../src/domain/hcm-error-mapper.service';

describe('HttpHcmClient', () => {
  const errorMapper = new HcmErrorMapperService();
  const client = new HttpHcmClient(errorMapper);

  beforeEach(() => {
    process.env.HCM_BASE_URL = 'http://hcm.test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps non-OK balance responses through the error mapper', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid employee/location combination' }), {
        status: 404,
      }),
    ) as typeof fetch;

    await expect(client.getRealtimeBalance('emp_1', 'loc_1')).rejects.toMatchObject({
      type: HcmErrorType.NOT_FOUND,
    });
  });

  it('maps non-OK submission responses through the error mapper', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Insufficient balance' }), {
        status: 409,
      }),
    ) as typeof fetch;

    await expect(
      client.submitTimeOff({
        employeeId: 'emp_1',
        locationId: 'loc_1',
        amount: 99,
        unit: 'DAYS',
        externalRequestId: 'req_1',
      }),
    ).rejects.toMatchObject({ type: HcmErrorType.INSUFFICIENT_BALANCE });
  });

  it('maps non-OK batch responses through the error mapper', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Corrupted batch payload' }), {
        status: 500,
      }),
    ) as typeof fetch;

    await expect(client.getBatchBalances()).rejects.toMatchObject({
      type: HcmErrorType.TRANSIENT,
      retryable: true,
    });
  });
});
