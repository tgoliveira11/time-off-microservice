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
import { HcmSyncJobRecord } from '../repositories/hcm-sync-job.repository';
import { OutboxEventRecord } from '../repositories/outbox.repository';
import { AuditLogRecord } from '../repositories/audit-log.repository';
import { EmployeeStatus, BalanceUnit, RequestStatus, ActorType, HcmSyncJobType } from '../../domain/enums';

export {
  EmployeeRecord,
  LocationRecord,
  BalanceRecord,
  BalanceUpdateConflictError,
  TimeOffRequestRecord,
  RequestTransitionConflictError,
  StatusHistoryRecord,
  HcmSyncJobRecord,
  OutboxEventRecord,
  AuditLogRecord,
};

export const EMPLOYEE_REPOSITORY = Symbol('EmployeeRepositoryPort');
export const LOCATION_REPOSITORY = Symbol('LocationRepositoryPort');
export const BALANCE_REPOSITORY = Symbol('BalanceRepositoryPort');
export const TIME_OFF_REQUEST_REPOSITORY = Symbol('TimeOffRequestRepositoryPort');
export const REQUEST_STATUS_HISTORY_REPOSITORY = Symbol('RequestStatusHistoryRepositoryPort');
export const AUDIT_LOG_REPOSITORY = Symbol('AuditLogRepositoryPort');
export const HCM_SYNC_JOB_REPOSITORY = Symbol('HcmSyncJobRepositoryPort');
export const IDEMPOTENCY_REPOSITORY = Symbol('IdempotencyRepositoryPort');
export const OUTBOX_REPOSITORY = Symbol('OutboxRepositoryPort');

export interface EmployeeRepositoryPort {
  findById(id: string): EmployeeRecord | null;
  findByHcmId(hcmEmployeeId: string): EmployeeRecord | null;
  upsert(data: {
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord;
  create(data: {
    id?: string;
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord;
  findDirectReports(managerId: string): EmployeeRecord[];
}

export interface LocationRepositoryPort {
  findById(id: string): LocationRecord | null;
  findByHcmId(hcmLocationId: string): LocationRecord | null;
  upsert(data: { hcmLocationId: string; name: string }): LocationRecord;
  create(data: {
    id?: string;
    hcmLocationId: string;
    name: string;
  }): LocationRecord;
}

export interface BalanceRepositoryPort {
  findByEmployee(employeeId: string): BalanceRecord[];
  findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): BalanceRecord | null;
  create(data: {
    employeeId: string;
    locationId: string;
    hcmBalance: number;
    unit?: BalanceUnit;
    hcmVersion?: string | null;
    lastHcmSyncAt?: string | null;
  }): BalanceRecord;
  findById(id: string): BalanceRecord | null;
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
  ): BalanceRecord;
  reserveBalanceIfAvailable(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord;
  releaseReservedBalance(
    employeeId: string,
    locationId: string,
    amount: number,
  ): BalanceRecord;
  applyApprovalConsumption(
    employeeId: string,
    locationId: string,
    amount: number,
    newHcmBalance: number,
  ): BalanceRecord;
  findAll(): BalanceRecord[];
}

export interface TimeOffRequestRepositoryPort {
  findById(id: string): TimeOffRequestRecord | null;
  findByIdempotencyKey(
    employeeId: string,
    idempotencyKey: string,
  ): TimeOffRequestRecord | null;
  findByManagerAndStatus(
    managerId: string,
    status: RequestStatus,
  ): TimeOffRequestRecord[];
  findActiveByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): TimeOffRequestRecord[];
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
  }): TimeOffRequestRecord;
  transitionStatus(
    id: string,
    expectedStatus: RequestStatus,
    nextStatus: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord;
  transitionStatusIfIn(
    id: string,
    expectedStatuses: RequestStatus[],
    nextStatus: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord;
  forceUpdateStatusForSystemReconciliation(
    id: string,
    status: RequestStatus,
    extras?: {
      hcmTransactionId?: string | null;
      failureReason?: string | null;
    },
  ): TimeOffRequestRecord;
  findAll(): TimeOffRequestRecord[];
}

export interface RequestStatusHistoryRepositoryPort {
  create(data: {
    requestId: string;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus;
    actorType: ActorType;
    actorId?: string | null;
    reason?: string | null;
  }): StatusHistoryRecord;
  findByRequestId(requestId: string): StatusHistoryRecord[];
}

export interface AuditLogRepositoryPort {
  create(data: {
    entityType: string;
    entityId: string;
    action: string;
    actorType: ActorType;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }): AuditLogRecord;
  findByEntity(entityType: string, entityId: string): AuditLogRecord[];
  findById(id: string): AuditLogRecord | null;
}

export interface HcmSyncJobRepositoryPort {
  create(type: HcmSyncJobType): HcmSyncJobRecord;
  complete(id: string, result: Record<string, unknown>): HcmSyncJobRecord;
  fail(id: string, errorMessage: string): HcmSyncJobRecord;
  findById(id: string): HcmSyncJobRecord | null;
}

export interface IdempotencyRepositoryPort {
  find(scope: string, idempotencyKey: string): Record<string, unknown> | null;
  save(
    scope: string,
    idempotencyKey: string,
    response: Record<string, unknown>,
  ): void;
}

export interface OutboxRepositoryPort {
  create(data: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): OutboxEventRecord;
  findById(id: string): OutboxEventRecord | null;
}
