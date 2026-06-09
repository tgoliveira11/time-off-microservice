import { Provider } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { EmployeeRepository } from './repositories/employee.repository';
import { LocationRepository } from './repositories/location.repository';
import { BalanceRepository } from './repositories/balance.repository';
import { TimeOffRequestRepository } from './repositories/time-off-request.repository';
import { StatusHistoryRepository } from './repositories/status-history.repository';
import { HcmSyncJobRepository } from './repositories/hcm-sync-job.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { IdempotencyRepository } from './repositories/idempotency.repository';
import { PersistenceInfoService } from './persistence-info.service';
import {
  EMPLOYEE_REPOSITORY,
  LOCATION_REPOSITORY,
  BALANCE_REPOSITORY,
  TIME_OFF_REQUEST_REPOSITORY,
  REQUEST_STATUS_HISTORY_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  HCM_SYNC_JOB_REPOSITORY,
  IDEMPOTENCY_REPOSITORY,
  OUTBOX_REPOSITORY,
} from './ports/repository.ports';
import { TRANSACTION_MANAGER } from './ports/transaction-manager.port';
import { SqliteTransactionManager } from './sqlite/sqlite-transaction-manager';

export function createSqlitePersistenceProviders(): Provider[] {
  return [
    PersistenceInfoService,
    {
      provide: DatabaseService,
      useFactory: () => {
        const service = new DatabaseService();
        service.onModuleInit();
        return service;
      },
    },
    {
      provide: TRANSACTION_MANAGER,
      useFactory: (database: DatabaseService) =>
        new SqliteTransactionManager(database),
      inject: [DatabaseService],
    },
    {
      provide: EMPLOYEE_REPOSITORY,
      useFactory: (database: DatabaseService) => new EmployeeRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: LOCATION_REPOSITORY,
      useFactory: (database: DatabaseService) => new LocationRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: BALANCE_REPOSITORY,
      useFactory: (database: DatabaseService) => new BalanceRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: TIME_OFF_REQUEST_REPOSITORY,
      useFactory: (database: DatabaseService) =>
        new TimeOffRequestRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: REQUEST_STATUS_HISTORY_REPOSITORY,
      useFactory: (database: DatabaseService) =>
        new StatusHistoryRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (database: DatabaseService) => new AuditLogRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: HCM_SYNC_JOB_REPOSITORY,
      useFactory: (database: DatabaseService) =>
        new HcmSyncJobRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: IDEMPOTENCY_REPOSITORY,
      useFactory: (database: DatabaseService) =>
        new IdempotencyRepository(database),
      inject: [DatabaseService],
    },
    {
      provide: OUTBOX_REPOSITORY,
      useFactory: (database: DatabaseService) => new OutboxRepository(database),
      inject: [DatabaseService],
    },
  ];
}

export const sqlitePersistenceExports = [
  PersistenceInfoService,
  TRANSACTION_MANAGER,
  EMPLOYEE_REPOSITORY,
  LOCATION_REPOSITORY,
  BALANCE_REPOSITORY,
  TIME_OFF_REQUEST_REPOSITORY,
  REQUEST_STATUS_HISTORY_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  HCM_SYNC_JOB_REPOSITORY,
  IDEMPOTENCY_REPOSITORY,
  OUTBOX_REPOSITORY,
  DatabaseService,
] as const;
