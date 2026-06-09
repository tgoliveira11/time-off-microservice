import {
  HcmErrorMapperService,
  RetryClassifierService,
  HcmErrorType,
} from '../../src/domain/hcm-error-mapper.service';

describe('HcmErrorMapperService', () => {
  const mapper = new HcmErrorMapperService();
  const retryClassifier = new RetryClassifierService();

  it('maps insufficient balance to conflict', () => {
    const error = mapper.mapHttpStatus(409, { message: 'Insufficient balance' });
    expect(error.type).toBe(HcmErrorType.INSUFFICIENT_BALANCE);
    expect(error.retryable).toBe(false);
  });

  it('maps duplicate submission', () => {
    const error = mapper.mapHttpStatus(409, {
      message: 'Duplicate external request ID',
      transactionId: 'hcm_tx_1',
    });
    expect(error.type).toBe(HcmErrorType.DUPLICATE_SUBMISSION);
    expect(error.transactionId).toBe('hcm_tx_1');
  });

  it('maps timeout as retryable', () => {
    const error = mapper.mapTimeout();
    expect(error.type).toBe(HcmErrorType.TIMEOUT);
    expect(retryClassifier.isRetryable(error)).toBe(true);
  });

  it('maps 500 as retryable transient', () => {
    const error = mapper.mapHttpStatus(500, { message: 'Server error' });
    expect(error.retryable).toBe(true);
  });

  it('maps invalid dimensions as non-retryable', () => {
    const error = mapper.mapHttpStatus(400, { message: 'Invalid dimensions' });
    expect(error.type).toBe(HcmErrorType.INVALID_DIMENSIONS);
    expect(error.retryable).toBe(false);
  });
});
