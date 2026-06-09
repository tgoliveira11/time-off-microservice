import { BatchImportValidatorService } from '../../src/domain/batch-import-validator.service';

describe('BatchImportValidatorService edge cases', () => {
  const validator = new BatchImportValidatorService();

  it('rejects malformed root payload', () => {
    expect(() => validator.validateCorpus(null)).toThrow(/Malformed batch payload/);
  });

  it('rejects missing balances array', () => {
    expect(() => validator.validateCorpus({})).toThrow(/Missing balances array/);
  });

  it('rejects empty corpus', () => {
    expect(() => validator.validateCorpus({ balances: [] })).toThrow(/Empty batch corpus/);
  });

  it('rejects malformed row objects', () => {
    expect(() => validator.validateCorpus({ balances: [null] })).toThrow(/malformed entry/);
  });

  it('rejects missing locationId', () => {
    expect(() =>
      validator.validateCorpus({
        balances: [{ employeeId: 'emp_1', balance: 1, unit: 'DAYS', version: 'v1' }],
      }),
    ).toThrow(/missing locationId/);
  });

  it('rejects invalid unit', () => {
    expect(() =>
      validator.validateCorpus({
        balances: [
          {
            employeeId: 'emp_1',
            locationId: 'loc_1',
            balance: 1,
            unit: 'HOURS',
            version: 'v1',
          },
        ],
      }),
    ).toThrow(/invalid unit/);
  });
});
