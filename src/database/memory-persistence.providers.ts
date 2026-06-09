import { Logger, Provider } from '@nestjs/common';
import { resolvePersistenceMode } from './persistence-mode';
import { MemoryStore } from './memory/memory-store';
import {
  MemoryEmployeeRepository,
  MemoryLocationRepository,
  MemoryBalanceRepository,
  MemoryTimeOffRequestRepository,
  MemoryStatusHistoryRepository,
  MemoryAuditLogRepository,
  MemoryHcmSyncJobRepository,
  MemoryIdempotencyRepository,
  MemoryOutboxRepository,
} from './memory/memory-repositories';
import { MemoryTransactionManager } from './memory/memory-transaction-manager';
import { MemorySeedService } from './memory/memory-seed.service';
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

const logger = new Logger('MemoryPersistence');

export function createMemoryPersistenceProviders(): Provider[] {
  logger.log('Using in-memory persistence (non-production, data lost on restart)');

  return [
    PersistenceInfoService,
    MemoryStore,
    MemorySeedService,
    {
      provide: TRANSACTION_MANAGER,
      useFactory: (store: MemoryStore) => new MemoryTransactionManager(store),
      inject: [MemoryStore],
    },
    {
      provide: EMPLOYEE_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryEmployeeRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: LOCATION_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryLocationRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: BALANCE_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryBalanceRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: TIME_OFF_REQUEST_REPOSITORY,
      useFactory: (store: MemoryStore) =>
        new MemoryTimeOffRequestRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: REQUEST_STATUS_HISTORY_REPOSITORY,
      useFactory: (store: MemoryStore) =>
        new MemoryStatusHistoryRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryAuditLogRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: HCM_SYNC_JOB_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryHcmSyncJobRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: IDEMPOTENCY_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryIdempotencyRepository(store),
      inject: [MemoryStore],
    },
    {
      provide: OUTBOX_REPOSITORY,
      useFactory: (store: MemoryStore) => new MemoryOutboxRepository(store),
      inject: [MemoryStore],
    },
  ];
}

export const memoryPersistenceExports = [
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
  MemoryStore,
] as const;
