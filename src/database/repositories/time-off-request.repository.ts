import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { BalanceUnit, RequestStatus } from '../../domain/enums';

export class RequestTransitionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestTransitionConflictError';
  }
}

export interface TimeOffRequestRecord {
  id: string;
  employeeId: string;
  locationId: string;
  amount: number;
  unit: BalanceUnit;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  managerId: string | null;
  hcmTransactionId: string | null;
  idempotencyKey: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TimeOffRequestRepository {
  constructor(private readonly database: DatabaseService) {}

  findById(id: string): TimeOffRequestRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM time_off_requests WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  findByIdempotencyKey(
    employeeId: string,
    idempotencyKey: string,
  ): TimeOffRequestRecord | null {
    const row = this.database
      .getDb()
      .prepare(
        'SELECT * FROM time_off_requests WHERE employee_id = ? AND idempotency_key = ?',
      )
      .get(employeeId, idempotencyKey) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  findByManagerAndStatus(
    managerId: string,
    status: RequestStatus,
  ): TimeOffRequestRecord[] {
    const rows = this.database
      .getDb()
      .prepare(
        `SELECT tor.* FROM time_off_requests tor
         JOIN employees e ON e.id = tor.employee_id
         WHERE e.manager_id = ? AND tor.status = ?`,
      )
      .all(managerId, status) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  findActiveByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): TimeOffRequestRecord[] {
    const rows = this.database
      .getDb()
      .prepare(
        `SELECT * FROM time_off_requests
         WHERE employee_id = ? AND location_id = ?
         AND status IN ('SUBMITTED', 'PENDING_MANAGER_APPROVAL', 'APPROVED_PENDING_HCM')`,
      )
      .all(employeeId, locationId) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  create(data: {
    employeeId: string;
    locationId: string;
    amount: number;
    unit: BalanceUnit;
    startDate: string;
    endDate: string;
    status: RequestStatus;
    managerId?: string | null;
    idempotencyKey?: string | null;
  }): TimeOffRequestRecord {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO time_off_requests
         (id, employee_id, location_id, amount, unit, start_date, end_date, status, manager_id, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.employeeId,
        data.locationId,
        data.amount,
        data.unit,
        data.startDate,
        data.endDate,
        data.status,
        data.managerId ?? null,
        data.idempotencyKey ?? null,
      );
    return this.findById(id)!;
  }

  transitionStatus(
    id: string,
    expectedStatus: RequestStatus,
    nextStatus: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord {
    const result = this.database
      .getDb()
      .prepare(
        `UPDATE time_off_requests SET
          status = ?,
          hcm_transaction_id = COALESCE(?, hcm_transaction_id),
          failure_reason = COALESCE(?, failure_reason),
          updated_at = datetime('now')
        WHERE id = ? AND status = ?`,
      )
      .run(
        nextStatus,
        extras?.hcmTransactionId ?? null,
        extras?.failureReason ?? null,
        id,
        expectedStatus,
      );

    if (result.changes === 0) {
      throw new RequestTransitionConflictError(
        `Cannot transition request ${id} from ${expectedStatus} to ${nextStatus}`,
      );
    }

    return this.findById(id)!;
  }

  transitionStatusIfIn(
    id: string,
    expectedStatuses: RequestStatus[],
    nextStatus: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord {
    const placeholders = expectedStatuses.map(() => '?').join(', ');
    const result = this.database
      .getDb()
      .prepare(
        `UPDATE time_off_requests SET
          status = ?,
          hcm_transaction_id = COALESCE(?, hcm_transaction_id),
          failure_reason = COALESCE(?, failure_reason),
          updated_at = datetime('now')
        WHERE id = ? AND status IN (${placeholders})`,
      )
      .run(
        nextStatus,
        extras?.hcmTransactionId ?? null,
        extras?.failureReason ?? null,
        id,
        ...expectedStatuses,
      );

    if (result.changes === 0) {
      throw new RequestTransitionConflictError(
        `Cannot transition request ${id} to ${nextStatus}`,
      );
    }

    return this.findById(id)!;
  }

  /**
   * Administrative escape hatch for system reconciliation flows only.
   * Bypasses expected-state guards; do not use for normal lifecycle transitions.
   */
  forceUpdateStatusForSystemReconciliation(
    id: string,
    status: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord {
    this.database
      .getDb()
      .prepare(
        `UPDATE time_off_requests SET
          status = ?,
          hcm_transaction_id = COALESCE(?, hcm_transaction_id),
          failure_reason = COALESCE(?, failure_reason),
          updated_at = datetime('now')
        WHERE id = ?`,
      )
      .run(
        status,
        extras?.hcmTransactionId ?? null,
        extras?.failureReason ?? null,
        id,
      );
    return this.findById(id)!;
  }

  /** @deprecated Use forceUpdateStatusForSystemReconciliation for admin-only updates. */
  updateStatus(
    id: string,
    status: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord {
    return this.forceUpdateStatusForSystemReconciliation(id, status, extras);
  }

  findAll(): TimeOffRequestRecord[] {
    const rows = this.database
      .getDb()
      .prepare('SELECT * FROM time_off_requests')
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  private map(row: Record<string, unknown>): TimeOffRequestRecord {
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      locationId: row.location_id as string,
      amount: row.amount as number,
      unit: row.unit as BalanceUnit,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      status: row.status as RequestStatus,
      managerId: (row.manager_id as string) ?? null,
      hcmTransactionId: (row.hcm_transaction_id as string) ?? null,
      idempotencyKey: (row.idempotency_key as string) ?? null,
      failureReason: (row.failure_reason as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
