import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { BalanceUnit } from '../../domain/enums';

export class BalanceUpdateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalanceUpdateConflictError';
  }
}

export interface BalanceRecord {
  id: string;
  employeeId: string;
  locationId: string;
  hcmBalance: number;
  reservedBalance: number;
  availableBalance: number;
  unit: BalanceUnit;
  hcmVersion: string | null;
  lastHcmSyncAt: string | null;
  reconciliationRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class BalanceRepository {
  constructor(private readonly database: DatabaseService) {}

  findByEmployee(employeeId: string): BalanceRecord[] {
    const rows = this.database
      .getDb()
      .prepare('SELECT * FROM balances WHERE employee_id = ?')
      .all(employeeId) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): BalanceRecord | null {
    const row = this.database
      .getDb()
      .prepare(
        'SELECT * FROM balances WHERE employee_id = ? AND location_id = ?',
      )
      .get(employeeId, locationId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  create(data: {
    employeeId: string;
    locationId: string;
    hcmBalance: number;
    unit?: BalanceUnit;
    hcmVersion?: string | null;
    lastHcmSyncAt?: string | null;
  }): BalanceRecord {
    const id = uuidv4();
    const reservedBalance = 0;
    const availableBalance = data.hcmBalance - reservedBalance;
    this.database
      .getDb()
      .prepare(
        `INSERT INTO balances (id, employee_id, location_id, hcm_balance, reserved_balance, available_balance, unit, hcm_version, last_hcm_sync_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.employeeId,
        data.locationId,
        data.hcmBalance,
        reservedBalance,
        availableBalance,
        data.unit ?? BalanceUnit.DAYS,
        data.hcmVersion ?? null,
        data.lastHcmSyncAt ?? null,
      );
    return this.findById(id)!;
  }

  findById(id: string): BalanceRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM balances WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  updateProjection(
    employeeId: string,
    locationId: string,
    data: {
      hcmBalance?: number;
      reservedBalance?: number;
      availableBalance?: number;
      hcmVersion?: string | null;
      lastHcmSyncAt?: string | null;
      reconciliationRequired?: boolean;
    },
  ): BalanceRecord {
    const current = this.findByEmployeeAndLocation(employeeId, locationId);
    if (!current) {
      throw new Error('Balance not found');
    }

    const result = this.database
      .getDb()
      .prepare(
        `UPDATE balances SET
          hcm_balance = COALESCE(?, hcm_balance),
          reserved_balance = COALESCE(?, reserved_balance),
          available_balance = COALESCE(?, available_balance),
          hcm_version = COALESCE(?, hcm_version),
          last_hcm_sync_at = COALESCE(?, last_hcm_sync_at),
          reconciliation_required = COALESCE(?, reconciliation_required),
          updated_at = datetime('now')
        WHERE employee_id = ? AND location_id = ?`,
      )
      .run(
        data.hcmBalance ?? null,
        data.reservedBalance ?? null,
        data.availableBalance ?? null,
        data.hcmVersion ?? null,
        data.lastHcmSyncAt ?? null,
        data.reconciliationRequired !== undefined
          ? data.reconciliationRequired
            ? 1
            : 0
          : null,
        employeeId,
        locationId,
      );

    if (result.changes === 0) {
      throw new BalanceUpdateConflictError('Balance row not updated');
    }

    return this.findByEmployeeAndLocation(employeeId, locationId)!;
  }

  reserveBalanceIfAvailable(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord {
    const result = this.database
      .getDb()
      .prepare(
        `UPDATE balances SET
          reserved_balance = reserved_balance + ?,
          available_balance = hcm_balance - (reserved_balance + ?),
          updated_at = datetime('now')
        WHERE employee_id = ?
          AND location_id = ?
          AND reconciliation_required = 0
          AND available_balance >= ?`,
      )
      .run(amount, amount, employeeId, locationId, amount);

    if (result.changes === 0) {
      throw new BalanceUpdateConflictError('Insufficient balance or reconciliation required');
    }

    return this.findByEmployeeAndLocation(employeeId, locationId)!;
  }

  releaseReservedBalance(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord {
    const result = this.database
      .getDb()
      .prepare(
        `UPDATE balances SET
          reserved_balance = MAX(0, reserved_balance - ?),
          available_balance = hcm_balance - MAX(0, reserved_balance - ?),
          updated_at = datetime('now')
        WHERE employee_id = ?
          AND location_id = ?
          AND reserved_balance >= ?`,
      )
      .run(amount, amount, employeeId, locationId, amount);

    if (result.changes === 0) {
      throw new BalanceUpdateConflictError('Cannot release reservation');
    }

    return this.findByEmployeeAndLocation(employeeId, locationId)!;
  }

  applyApprovalConsumption(
    employeeId: string,
    locationId: string,
    amount: number,
    newHcmBalance: number,
  ): BalanceRecord {
    const result = this.database
      .getDb()
      .prepare(
        `UPDATE balances SET
          hcm_balance = ?,
          reserved_balance = MAX(0, reserved_balance - ?),
          available_balance = ? - MAX(0, reserved_balance - ?),
          updated_at = datetime('now')
        WHERE employee_id = ?
          AND location_id = ?
          AND reserved_balance >= ?`,
      )
      .run(
        newHcmBalance,
        amount,
        newHcmBalance,
        amount,
        employeeId,
        locationId,
        amount,
      );

    if (result.changes === 0) {
      throw new BalanceUpdateConflictError('Approval balance update conflict');
    }

    return this.findByEmployeeAndLocation(employeeId, locationId)!;
  }

  findAll(): BalanceRecord[] {
    const rows = this.database
      .getDb()
      .prepare('SELECT * FROM balances')
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  private map(row: Record<string, unknown>): BalanceRecord {
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      locationId: row.location_id as string,
      hcmBalance: row.hcm_balance as number,
      reservedBalance: row.reserved_balance as number,
      availableBalance: row.available_balance as number,
      unit: row.unit as BalanceUnit,
      hcmVersion: (row.hcm_version as string) ?? null,
      lastHcmSyncAt: (row.last_hcm_sync_at as string) ?? null,
      reconciliationRequired: Boolean(row.reconciliation_required),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
