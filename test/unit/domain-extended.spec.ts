import { HcmErrorMapperService } from '../../src/domain/hcm-error-mapper.service';
import { ReconciliationRulesService } from '../../src/domain/reconciliation-rules.service';

describe('HcmErrorMapperService extended', () => {
  const mapper = new HcmErrorMapperService();

  it('maps unknown status codes', () => {
    const error = mapper.mapHttpStatus(418, { message: 'Teapot' });
    expect(error.retryable).toBe(false);
  });

  it('maps nested duplicate payload', () => {
    const error = mapper.mapHttpStatus(409, {
      message: {
        message: 'Duplicate external request ID',
        transactionId: 'tx_1',
      },
    });
    expect(error.transactionId).toBe('tx_1');
  });
});

describe('ReconciliationRulesService extended', () => {
  const service = new ReconciliationRulesService();

  it('detects balance mismatch', () => {
    const issue = service.evaluateBalanceMismatch(
      'emp_1',
      'loc_1',
      10,
      8,
      2,
    );
    expect(issue).not.toBeNull();
  });
});
