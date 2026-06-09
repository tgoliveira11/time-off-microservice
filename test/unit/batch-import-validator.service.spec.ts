import { BatchImportValidatorService } from '../../src/domain/batch-import-validator.service';

describe('BatchImportValidatorService', () => {
  const validator = new BatchImportValidatorService();

  it('accepts valid corpus', () => {
    const rows = validator.validateCorpus({
      balances: [
        {
          employeeId: 'emp_1',
          locationId: 'loc_1',
          balance: 10,
          unit: 'DAYS',
          version: 'v1',
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].balance).toBe(10);
  });

  it('rejects missing employeeId', () => {
    expect(() =>
      validator.validateCorpus({
        balances: [{ locationId: 'loc_1', balance: 5, unit: 'DAYS', version: 'v1' }],
      }),
    ).toThrow(/missing employeeId/);
  });

  it('rejects negative balance', () => {
    expect(() =>
      validator.validateCorpus({
        balances: [
          {
            employeeId: 'emp_1',
            locationId: 'loc_1',
            balance: -1,
            unit: 'DAYS',
            version: 'v1',
          },
        ],
      }),
    ).toThrow(/negative balance/);
  });

  it('rejects duplicate rows in same batch', () => {
    expect(() =>
      validator.validateCorpus({
        balances: [
          {
            employeeId: 'emp_1',
            locationId: 'loc_1',
            balance: 5,
            unit: 'DAYS',
            version: 'v1',
          },
          {
            employeeId: 'emp_1',
            locationId: 'loc_1',
            balance: 6,
            unit: 'DAYS',
            version: 'v2',
          },
        ],
      }),
    ).toThrow(/duplicate employee\/location/);
  });
});
