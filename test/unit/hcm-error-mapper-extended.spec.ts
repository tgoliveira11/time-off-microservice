import { HcmErrorMapperService, HcmErrorType } from '../../src/domain/hcm-error-mapper.service';

describe('HcmErrorMapperService extended', () => {
  const mapper = new HcmErrorMapperService();

  it('maps duplicate submission on 409 conflict responses', () => {
    const error = mapper.mapHttpStatus(409, {
      message: 'Duplicate external request ID',
      transactionId: 'hcm_tx_123',
    });

    expect(error.type).toBe(HcmErrorType.DUPLICATE_SUBMISSION);
    expect(error.transactionId).toBe('hcm_tx_123');
  });

  it('maps nested error payloads', () => {
    const error = mapper.mapHttpStatus(400, {
      message: { message: 'Invalid dimensions' },
    });

    expect(error.type).toBe(HcmErrorType.INVALID_DIMENSIONS);
  });

  it('maps unknown status codes', () => {
    const error = mapper.mapHttpStatus(418, { error: 'Teapot' });
    expect(error.type).toBe(HcmErrorType.UNKNOWN);
  });

  it('maps timeout as retryable', () => {
    const error = mapper.mapTimeout();
    expect(error.type).toBe(HcmErrorType.TIMEOUT);
    expect(mapper.isRetryable(error)).toBe(true);
  });
});
