import { HttpHcmClient } from '../../src/modules/hcm/http-hcm.client';
import { HcmErrorMapperService } from '../../src/domain/hcm-error-mapper.service';

jest.mock('../../src/modules/hcm/hcm-fetch.util', () => ({
  fetchHcmWithTimeout: jest.fn(),
  encodeHcmPathSegment: (value: string) => encodeURIComponent(value),
}));

import { fetchHcmWithTimeout } from '../../src/modules/hcm/hcm-fetch.util';

describe('HttpHcmClient success paths', () => {
  const errorMapper = new HcmErrorMapperService();
  const client = new HttpHcmClient(errorMapper);

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.HCM_BASE_URL = 'http://hcm.test';
  });

  it('returns parsed balance responses', async () => {
    (fetchHcmWithTimeout as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ balance: 10, unit: 'DAYS', version: 'v1' }), {
        status: 200,
      }),
    );

    const balance = await client.getRealtimeBalance('emp_1', 'loc_1');
    expect(balance.balance).toBe(10);
  });

  it('returns parsed submission responses', async () => {
    (fetchHcmWithTimeout as jest.Mock).mockResolvedValue(
      new Response(
        JSON.stringify({
          transactionId: 'hcm_tx_1',
          status: 'ACCEPTED',
          remainingBalance: 8,
        }),
        { status: 200 },
      ),
    );

    const submission = await client.submitTimeOff({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 2,
      unit: 'DAYS',
      externalRequestId: 'req_1',
    });

    expect(submission.transactionId).toBe('hcm_tx_1');
  });

  it('returns parsed batch responses', async () => {
    (fetchHcmWithTimeout as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ balances: [{ employeeId: 'emp_1' }] }), {
        status: 200,
      }),
    );

    const batch = await client.getBatchBalances();
    expect(batch.balances).toHaveLength(1);
  });
});
