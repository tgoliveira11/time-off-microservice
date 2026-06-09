import { Injectable } from '@nestjs/common';
import { EmployeeRecord } from '../repositories/employee.repository';
import { LocationRecord } from '../repositories/location.repository';
import { BalanceRecord } from '../repositories/balance.repository';
import { TimeOffRequestRecord } from '../repositories/time-off-request.repository';
import { StatusHistoryRecord } from '../repositories/status-history.repository';
import { AuditLogRecord } from '../repositories/audit-log.repository';
import { HcmSyncJobRecord } from '../repositories/hcm-sync-job.repository';
import { OutboxEventRecord } from '../repositories/outbox.repository';

export interface MemoryStoreSnapshot {
  employees: EmployeeRecord[];
  locations: LocationRecord[];
  balances: BalanceRecord[];
  timeOffRequests: TimeOffRequestRecord[];
  statusHistory: StatusHistoryRecord[];
  auditLogs: AuditLogRecord[];
  hcmSyncJobs: HcmSyncJobRecord[];
  outboxEvents: OutboxEventRecord[];
  idempotencyRecords: Array<{
    scope: string;
    idempotencyKey: string;
    response: Record<string, unknown>;
  }>;
}

@Injectable()
export class MemoryStore {
  employees = new Map<string, EmployeeRecord>();
  locations = new Map<string, LocationRecord>();
  balances = new Map<string, BalanceRecord>();
  timeOffRequests = new Map<string, TimeOffRequestRecord>();
  statusHistory: StatusHistoryRecord[] = [];
  auditLogs: AuditLogRecord[] = [];
  hcmSyncJobs = new Map<string, HcmSyncJobRecord>();
  outboxEvents = new Map<string, OutboxEventRecord>();
  idempotencyRecords = new Map<
    string,
    { scope: string; idempotencyKey: string; response: Record<string, unknown> }
  >();

  balanceKey(employeeId: string, locationId: string): string {
    return `${employeeId}:${locationId}`;
  }

  idempotencyKey(scope: string, key: string): string {
    return `${scope}:${key}`;
  }

  snapshot(): MemoryStoreSnapshot {
    return {
      employees: [...this.employees.values()],
      locations: [...this.locations.values()],
      balances: [...this.balances.values()],
      timeOffRequests: [...this.timeOffRequests.values()],
      statusHistory: [...this.statusHistory],
      auditLogs: [...this.auditLogs],
      hcmSyncJobs: [...this.hcmSyncJobs.values()],
      outboxEvents: [...this.outboxEvents.values()],
      idempotencyRecords: [...this.idempotencyRecords.values()],
    };
  }

  restore(snapshot: MemoryStoreSnapshot): void {
    this.employees = new Map(snapshot.employees.map((e) => [e.id, { ...e }]));
    this.locations = new Map(snapshot.locations.map((l) => [l.id, { ...l }]));
    this.balances = new Map(
      snapshot.balances.map((b) => [
        this.balanceKey(b.employeeId, b.locationId),
        { ...b },
      ]),
    );
    this.timeOffRequests = new Map(
      snapshot.timeOffRequests.map((r) => [r.id, { ...r }]),
    );
    this.statusHistory = snapshot.statusHistory.map((h) => ({ ...h }));
    this.auditLogs = snapshot.auditLogs.map((a) => ({ ...a }));
    this.hcmSyncJobs = new Map(snapshot.hcmSyncJobs.map((j) => [j.id, { ...j }]));
    this.outboxEvents = new Map(snapshot.outboxEvents.map((o) => [o.id, { ...o }]));
    this.idempotencyRecords = new Map(
      snapshot.idempotencyRecords.map((r) => [
        this.idempotencyKey(r.scope, r.idempotencyKey),
        { ...r, response: { ...r.response } },
      ]),
    );
  }

  resetForTests(): void {
    this.employees.clear();
    this.locations.clear();
    this.balances.clear();
    this.timeOffRequests.clear();
    this.statusHistory = [];
    this.auditLogs = [];
    this.hcmSyncJobs.clear();
    this.outboxEvents.clear();
    this.idempotencyRecords.clear();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
