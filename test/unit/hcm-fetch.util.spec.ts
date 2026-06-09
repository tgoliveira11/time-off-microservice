import { HcmErrorMapperService, HcmErrorType, HcmClientError } from '../../src/domain/hcm-error-mapper.service';
import { fetchHcmWithTimeout } from '../../src/modules/hcm/hcm-fetch.util';

describe('fetchHcmWithTimeout', () => {
  const errorMapper = new HcmErrorMapperService();

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.HCM_TIMEOUT_MS;
  });

  it('maps abort to retryable timeout error', async () => {
    process.env.HCM_TIMEOUT_MS = '50';

    global.fetch = jest.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    }) as typeof fetch;

    await expect(
      fetchHcmWithTimeout('http://example.test/hcm', errorMapper),
    ).rejects.toMatchObject({
      type: HcmErrorType.TIMEOUT,
      retryable: true,
    });
  });

  it('returns response when fetch completes before timeout', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    global.fetch = jest.fn().mockResolvedValue(response) as typeof fetch;

    process.env.HCM_TIMEOUT_MS = '5000';
    const result = await fetchHcmWithTimeout('http://example.test/hcm', errorMapper);
    expect(result.status).toBe(200);
  });

  it('maps generic fetch failures to transient HCM errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as typeof fetch;
    process.env.HCM_TIMEOUT_MS = '5000';

    await expect(
      fetchHcmWithTimeout('http://example.test/hcm', errorMapper),
    ).rejects.toMatchObject({
      type: HcmErrorType.TRANSIENT,
      retryable: true,
    });
  });

  it('rethrows mapped HCM client errors unchanged', async () => {
    const mapped = new HcmClientError(HcmErrorType.NOT_FOUND, 'missing', 404, false);
    global.fetch = jest.fn().mockRejectedValue(mapped) as typeof fetch;

    await expect(
      fetchHcmWithTimeout('http://example.test/hcm', errorMapper),
    ).rejects.toBe(mapped);
  });
});
