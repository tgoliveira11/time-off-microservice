import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MemoryStore, nowIso } from './memory-store';
import {
  EmployeeRepositoryPort,
  LocationRepositoryPort,
  BalanceRepositoryPort,
  TimeOffRequestRepositoryPort,
  RequestStatusHistoryRepositoryPort,
  AuditLogRepositoryPort,
  HcmSyncJobRepositoryPort,
  IdempotencyRepositoryPort,
  OutboxRepositoryPort,
} from '../ports/repository.ports';
import { EmployeeRecord } from '../repositories/employee.repository';
import { LocationRecord } from '../repositories/location.repository';
import {
  BalanceRecord,
  BalanceUpdateConflictError,
} from '../repositories/balance.repository';
import {
  TimeOffRequestRecord,
  RequestTransitionConflictError,
} from '../repositories/time-off-request.repository';
import { StatusHistoryRecord } from '../repositories/status-history.repository';
import { AuditLogRecord } from '../repositories/audit-log.repository';
import { HcmSyncJobRecord } from '../repositories/hcm-sync-job.repository';
import { OutboxEventRecord } from '../repositories/outbox.repository';
import {
  ActorType,
  BalanceUnit,
  EmployeeStatus,
  HcmSyncJobStatus,
  HcmSyncJobType,
  OutboxEventStatus,
  RequestStatus,
} from '../../domain/enums';

@Injectable()
export class MemoryEmployeeRepository implements EmployeeRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  findById(id: string): EmployeeRecord | null {
    return this.store.employees.get(id) ?? null;
  }

  findByHcmId(hcmEmployeeId: string): EmployeeRecord | null {
    for (const employee of this.store.employees.values()) {
      if (employee.hcmEmployeeId === hcmEmployeeId) {
        return employee;
      }
    }
    return null;
  }

  upsert(data: {
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord {
    const existing = this.findByHcmId(data.hcmEmployeeId);
    if (existing) {
      const updated: EmployeeRecord = {
        ...existing,
        managerId: data.managerId ?? existing.managerId,
        status: data.status ?? existing.status,
        updatedAt: nowIso(),
      };
      this.store.employees.set(existing.id, updated);
      return updated;
    }
    return this.create(data);
  }

  create(data: {
    id?: string;
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord {
    const id = data.id ?? uuidv4();
    const timestamp = nowIso();
    const record: EmployeeRecord = {
      id,
      hcmEmployeeId: data.hcmEmployeeId,
      managerId: data.managerId ?? null,
      status: data.status ?? EmployeeStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.employees.set(id, record);
    return record;
  }

  findDirectReports(managerId: string): EmployeeRecord[] {
    return [...this.store.employees.values()].filter(
      (e) => e.managerId === managerId,
    );
  }
}

@Injectable()
export class MemoryLocationRepository implements LocationRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  findById(id: string): LocationRecord | null {
    return this.store.locations.get(id) ?? null;
  }

  findByHcmId(hcmLocationId: string): LocationRecord | null {
    for (const location of this.store.locations.values()) {
      if (location.hcmLocationId === hcmLocationId) {
        return location;
      }
    }
    return null;
  }

  upsert(data: { hcmLocationId: string; name: string }): LocationRecord {
    const existing = this.findByHcmId(data.hcmLocationId);
    if (existing) {
      const updated: LocationRecord = {
        ...existing,
        name: data.name,
        updatedAt: nowIso(),
      };
      this.store.locations.set(existing.id, updated);
      return updated;
    }
    return this.create(data);
  }

  create(data: {
    id?: string;
    hcmLocationId: string;
    name: string;
  }): LocationRecord {
    const id = data.id ?? uuidv4();
    const timestamp = nowIso();
    const record: LocationRecord = {
      id,
      hcmLocationId: data.hcmLocationId,
      name: data.name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.locations.set(id, record);
    return record;
  }
}

@Injectable()
export class MemoryBalanceRepository implements BalanceRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  findByEmployee(employeeId: string): BalanceRecord[] {
    return [...this.store.balances.values()].filter(
      (b) => b.employeeId === employeeId,
    );
  }

  findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): BalanceRecord | null {
    return (
      this.store.balances.get(this.store.balanceKey(employeeId, locationId)) ??
      null
    );
  }

  findById(id: string): BalanceRecord | null {
    for (const balance of this.store.balances.values()) {
      if (balance.id === id) {
        return balance;
      }
    }
    return null;
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
    const timestamp = nowIso();
    const record: BalanceRecord = {
      id,
      employeeId: data.employeeId,
      locationId: data.locationId,
      hcmBalance: data.hcmBalance,
      reservedBalance,
      availableBalance,
      unit: data.unit ?? BalanceUnit.DAYS,
      hcmVersion: data.hcmVersion ?? null,
      lastHcmSyncAt: data.lastHcmSyncAt ?? null,
      reconciliationRequired: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.balances.set(
      this.store.balanceKey(data.employeeId, data.locationId),
      record,
    );
    return record;
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
      throw new BalanceUpdateConflictError('Balance not found');
    }
    const updated: BalanceRecord = {
      ...current,
      hcmBalance: data.hcmBalance ?? current.hcmBalance,
      reservedBalance: data.reservedBalance ?? current.reservedBalance,
      availableBalance: data.availableBalance ?? current.availableBalance,
      hcmVersion: data.hcmVersion !== undefined ? data.hcmVersion : current.hcmVersion,
      lastHcmSyncAt:
        data.lastHcmSyncAt !== undefined
          ? data.lastHcmSyncAt
          : current.lastHcmSyncAt,
      reconciliationRequired:
        data.reconciliationRequired !== undefined
          ? data.reconciliationRequired
          : current.reconciliationRequired,
      updatedAt: nowIso(),
    };
    this.store.balances.set(
      this.store.balanceKey(employeeId, locationId),
      updated,
    );
    return updated;
  }

  reserveBalanceIfAvailable(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord {
    const current = this.findByEmployeeAndLocation(employeeId, locationId);
    if (
      !current ||
      current.reconciliationRequired ||
      current.availableBalance < amount
    ) {
      throw new BalanceUpdateConflictError(
        'Insufficient balance or reconciliation required',
      );
    }
    const reservedBalance = current.reservedBalance + amount;
    const availableBalance = current.hcmBalance - reservedBalance;
    if (availableBalance < 0) {
      throw new BalanceUpdateConflictError(
        'Insufficient balance or reconciliation required',
      );
    }
    return this.updateProjection(employeeId, locationId, {
      reservedBalance,
      availableBalance,
    });
  }

  releaseReservedBalance(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord {
    const current = this.findByEmployeeAndLocation(employeeId, locationId);
    if (!current || current.reservedBalance < amount) {
      throw new BalanceUpdateConflictError('Cannot release reservation');
    }
    const reservedBalance = Math.max(0, current.reservedBalance - amount);
    const availableBalance = current.hcmBalance - reservedBalance;
    return this.updateProjection(employeeId, locationId, {
      reservedBalance,
      availableBalance,
    });
  }

  applyApprovalConsumption(
    employeeId: string,
    locationId: string,
    amount: number,
    newHcmBalance: number,
  ): BalanceRecord {
    const current = this.findByEmployeeAndLocation(employeeId, locationId);
    if (!current || current.reservedBalance < amount) {
      throw new BalanceUpdateConflictError('Approval balance update conflict');
    }
    const reservedBalance = Math.max(0, current.reservedBalance - amount);
    const availableBalance = newHcmBalance - reservedBalance;
    return this.updateProjection(employeeId, locationId, {
      hcmBalance: newHcmBalance,
      reservedBalance,
      availableBalance,
    });
  }

  findAll(): BalanceRecord[] {
    return [...this.store.balances.values()];
  }
}

@Injectable()
export class MemoryTimeOffRequestRepository implements TimeOffRequestRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  findById(id: string): TimeOffRequestRecord | null {
    return this.store.timeOffRequests.get(id) ?? null;
  }

  findByIdempotencyKey(
    employeeId: string,
    idempotencyKey: string,
  ): TimeOffRequestRecord | null {
    for (const request of this.store.timeOffRequests.values()) {
      if (
        request.employeeId === employeeId &&
        request.idempotencyKey === idempotencyKey
      ) {
        return request;
      }
    }
    return null;
  }

  findByManagerAndStatus(
    managerId: string,
    status: RequestStatus,
  ): TimeOffRequestRecord[] {
    return [...this.store.timeOffRequests.values()].filter((request) => {
      const employee = this.store.employees.get(request.employeeId);
      return employee?.managerId === managerId && request.status === status;
    });
  }

  findActiveByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): TimeOffRequestRecord[] {
    const activeStatuses = new Set([
      RequestStatus.SUBMITTED,
      RequestStatus.PENDING_MANAGER_APPROVAL,
      RequestStatus.APPROVED_PENDING_HCM,
    ]);
    return [...this.store.timeOffRequests.values()].filter(
      (request) =>
        request.employeeId === employeeId &&
        request.locationId === locationId &&
        activeStatuses.has(request.status),
    );
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
    const timestamp = nowIso();
    const record: TimeOffRequestRecord = {
      id,
      employeeId: data.employeeId,
      locationId: data.locationId,
      amount: data.amount,
      unit: data.unit,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status,
      managerId: data.managerId ?? null,
      hcmTransactionId: null,
      idempotencyKey: data.idempotencyKey ?? null,
      failureReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.timeOffRequests.set(id, record);
    return record;
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
    return this.transitionStatusIfIn(id, [expectedStatus], nextStatus, extras);
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
    const current = this.findById(id);
    if (!current || !expectedStatuses.includes(current.status)) {
      throw new RequestTransitionConflictError(
        `Cannot transition request ${id} to ${nextStatus}`,
      );
    }
    const updated: TimeOffRequestRecord = {
      ...current,
      status: nextStatus,
      hcmTransactionId:
        extras?.hcmTransactionId !== undefined
          ? extras.hcmTransactionId
          : current.hcmTransactionId,
      failureReason:
        extras?.failureReason !== undefined
          ? extras.failureReason
          : current.failureReason,
      updatedAt: nowIso(),
    };
    this.store.timeOffRequests.set(id, updated);
    return updated;
  }

  forceUpdateStatusForSystemReconciliation(
    id: string,
    status: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord {
    const current = this.findById(id);
    if (!current) {
      throw new RequestTransitionConflictError(`Request ${id} not found`);
    }
    const updated: TimeOffRequestRecord = {
      ...current,
      status,
      hcmTransactionId:
        extras?.hcmTransactionId !== undefined
          ? extras.hcmTransactionId
          : current.hcmTransactionId,
      failureReason:
        extras?.failureReason !== undefined
          ? extras.failureReason
          : current.failureReason,
      updatedAt: nowIso(),
    };
    this.store.timeOffRequests.set(id, updated);
    return updated;
  }

  findAll(): TimeOffRequestRecord[] {
    return [...this.store.timeOffRequests.values()];
  }
}

@Injectable()
export class MemoryStatusHistoryRepository implements RequestStatusHistoryRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  create(data: {
    requestId: string;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus;
    actorType: ActorType;
    actorId?: string | null;
    reason?: string | null;
  }): StatusHistoryRecord {
    const record: StatusHistoryRecord = {
      id: uuidv4(),
      requestId: data.requestId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      actorType: data.actorType,
      actorId: data.actorId ?? null,
      reason: data.reason ?? null,
      createdAt: nowIso(),
    };
    this.store.statusHistory.push(record);
    return record;
  }

  findByRequestId(requestId: string): StatusHistoryRecord[] {
    return this.store.statusHistory
      .filter((entry) => entry.requestId === requestId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

@Injectable()
export class MemoryAuditLogRepository implements AuditLogRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  create(data: {
    entityType: string;
    entityId: string;
    action: string;
    actorType: ActorType;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }): AuditLogRecord {
    const record: AuditLogRecord = {
      id: uuidv4(),
      entityType: data.entityType,
      entityId: data.entityId,
      action: data.action,
      actorType: data.actorType,
      actorId: data.actorId ?? null,
      metadata: JSON.stringify(data.metadata ?? {}),
      createdAt: nowIso(),
    };
    this.store.auditLogs.push(record);
    return record;
  }

  findByEntity(entityType: string, entityId: string): AuditLogRecord[] {
    return this.store.auditLogs.filter(
      (log) => log.entityType === entityType && log.entityId === entityId,
    );
  }

  findById(id: string): AuditLogRecord | null {
    return this.store.auditLogs.find((log) => log.id === id) ?? null;
  }
}

@Injectable()
export class MemoryHcmSyncJobRepository implements HcmSyncJobRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  create(type: HcmSyncJobType): HcmSyncJobRecord {
    const id = uuidv4();
    const timestamp = nowIso();
    const record: HcmSyncJobRecord = {
      id,
      type,
      status: HcmSyncJobStatus.RUNNING,
      startedAt: timestamp,
      completedAt: null,
      errorMessage: null,
      resultJson: null,
      createdAt: timestamp,
    };
    this.store.hcmSyncJobs.set(id, record);
    return record;
  }

  complete(id: string, result: Record<string, unknown>): HcmSyncJobRecord {
    const current = this.findById(id);
    if (!current) {
      throw new Error(`HCM sync job ${id} not found`);
    }
    const updated: HcmSyncJobRecord = {
      ...current,
      status: HcmSyncJobStatus.COMPLETED,
      completedAt: nowIso(),
      resultJson: JSON.stringify(result),
    };
    this.store.hcmSyncJobs.set(id, updated);
    return updated;
  }

  fail(id: string, errorMessage: string): HcmSyncJobRecord {
    const current = this.findById(id);
    if (!current) {
      throw new Error(`HCM sync job ${id} not found`);
    }
    const updated: HcmSyncJobRecord = {
      ...current,
      status: HcmSyncJobStatus.FAILED,
      completedAt: nowIso(),
      errorMessage,
    };
    this.store.hcmSyncJobs.set(id, updated);
    return updated;
  }

  findById(id: string): HcmSyncJobRecord | null {
    return this.store.hcmSyncJobs.get(id) ?? null;
  }
}

@Injectable()
export class MemoryIdempotencyRepository implements IdempotencyRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  find(scope: string, idempotencyKey: string): Record<string, unknown> | null {
    const record = this.store.idempotencyRecords.get(
      this.store.idempotencyKey(scope, idempotencyKey),
    );
    return record ? { ...record.response } : null;
  }

  save(
    scope: string,
    idempotencyKey: string,
    response: Record<string, unknown>,
  ): void {
    const key = this.store.idempotencyKey(scope, idempotencyKey);
    if (this.store.idempotencyRecords.has(key)) {
      return;
    }
    this.store.idempotencyRecords.set(key, {
      scope,
      idempotencyKey,
      response: { ...response },
    });
  }
}

@Injectable()
export class MemoryOutboxRepository implements OutboxRepositoryPort {
  constructor(private readonly store: MemoryStore) {}

  create(data: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): OutboxEventRecord {
    const id = uuidv4();
    const timestamp = nowIso();
    const record: OutboxEventRecord = {
      id,
      aggregateType: data.aggregateType,
      aggregateId: data.aggregateId,
      eventType: data.eventType,
      payload: JSON.stringify(data.payload),
      status: OutboxEventStatus.PENDING,
      retryCount: 0,
      nextRetryAt: null,
      createdAt: timestamp,
    };
    this.store.outboxEvents.set(id, record);
    return record;
  }

  findById(id: string): OutboxEventRecord | null {
    return this.store.outboxEvents.get(id) ?? null;
  }
}

export const memoryRepositoryProviders = [
  MemoryEmployeeRepository,
  MemoryLocationRepository,
  MemoryBalanceRepository,
  MemoryTimeOffRequestRepository,
  MemoryStatusHistoryRepository,
  MemoryAuditLogRepository,
  MemoryHcmSyncJobRepository,
  MemoryIdempotencyRepository,
  MemoryOutboxRepository,
];
