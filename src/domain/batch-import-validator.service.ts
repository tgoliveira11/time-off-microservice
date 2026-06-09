import { BalanceUnit } from './enums';

export interface ValidatedBatchBalanceRow {
  employeeId: string;
  locationId: string;
  balance: number;
  unit: BalanceUnit;
  version: string;
}

export class BatchImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchImportValidationError';
  }
}

export class BatchImportValidatorService {
  validateCorpus(raw: unknown): ValidatedBatchBalanceRow[] {
    if (!raw || typeof raw !== 'object') {
      throw new BatchImportValidationError('Malformed batch payload');
    }

    const balances = (raw as { balances?: unknown }).balances;
    if (!Array.isArray(balances)) {
      throw new BatchImportValidationError('Missing balances array');
    }

    if (balances.length === 0) {
      throw new BatchImportValidationError('Empty batch corpus');
    }

    const seen = new Set<string>();
    const validated: ValidatedBatchBalanceRow[] = [];

    for (const [index, row] of balances.entries()) {
      validated.push(this.validateRow(row, index, seen));
    }

    return validated;
  }

  private validateRow(
    row: unknown,
    index: number,
    seen: Set<string>,
  ): ValidatedBatchBalanceRow {
    if (!row || typeof row !== 'object') {
      throw new BatchImportValidationError(`Row ${index}: malformed entry`);
    }

    const record = row as Record<string, unknown>;
    const employeeId = record.employeeId;
    const locationId = record.locationId;
    const balance = record.balance;
    const unit = record.unit ?? BalanceUnit.DAYS;
    const version = record.version ?? 'v0';

    if (typeof employeeId !== 'string' || !employeeId.trim()) {
      throw new BatchImportValidationError(`Row ${index}: missing employeeId`);
    }
    if (typeof locationId !== 'string' || !locationId.trim()) {
      throw new BatchImportValidationError(`Row ${index}: missing locationId`);
    }
    if (typeof balance !== 'number' || Number.isNaN(balance)) {
      throw new BatchImportValidationError(`Row ${index}: non-numeric balance`);
    }
    if (balance < 0) {
      throw new BatchImportValidationError(`Row ${index}: negative balance`);
    }
    if (unit !== BalanceUnit.DAYS) {
      throw new BatchImportValidationError(`Row ${index}: invalid unit`);
    }
    if (typeof version !== 'string' || !version.trim()) {
      throw new BatchImportValidationError(`Row ${index}: missing version`);
    }

    const key = `${employeeId}:${locationId}`;
    if (seen.has(key)) {
      throw new BatchImportValidationError(
        `Row ${index}: duplicate employee/location ${key}`,
      );
    }
    seen.add(key);

    return {
      employeeId,
      locationId,
      balance,
      unit,
      version,
    };
  }
}
