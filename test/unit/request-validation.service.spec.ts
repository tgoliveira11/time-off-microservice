import { RequestValidationService } from '../../src/domain/request-validation.service';

describe('RequestValidationService', () => {
  const service = new RequestValidationService();

  it('rejects invalid date formats', () => {
    expect(() => service.validateDates('not-a-date', '2026-02-10')).toThrow(
      'Invalid date format',
    );
  });

  it('validates date order', () => {
    expect(() =>
      service.validateDates('2026-02-12', '2026-02-10'),
    ).toThrow('End date must be on or after start date');
  });

  it('rejects non-positive amount', () => {
    expect(() => service.validateAmount(0)).toThrow('Amount must be positive');
  });
});
