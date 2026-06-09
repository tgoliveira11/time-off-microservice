import {
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  HCM_SYNC_JOB_REPOSITORY,
  HcmSyncJobRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
  TIME_OFF_REQUEST_REPOSITORY,
  TimeOffRequestRepositoryPort,
} from '../../database/ports/repository.ports';
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
} from '../../database/ports/transaction-manager.port';
import { HcmClientService } from '../hcm/hcm-client.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { AuditService } from '../../common/audit/audit.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { buildBatchImportScope } from '../../common/idempotency/idempotency-scope.util';
import {
  BatchImportValidationError,
  BatchImportValidatorService,
  ValidatedBatchBalanceRow,
} from '../../domain/batch-import-validator.service';
import {
  HcmClientError,
} from '../../domain/hcm-error-mapper.service';
import {
  ActorType,
  HcmSyncJobType,
  RequestStatus,
} from '../../domain/enums';
import { AuthUser } from '../../common/auth/auth.types';
import { OperationOkException } from '../../common/http/operation-http.exceptions';
import { MetricsService } from '../../common/observability/metrics.service';
import { StructuredEventLogger } from '../../common/observability/structured-event-logger.service';

@Injectable()
export class BatchImportService {
  private readonly logger = new Logger(BatchImportService.name);

  constructor(
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepository: TimeOffRequestRepositoryPort,
    @Inject(HCM_SYNC_JOB_REPOSITORY)
    private readonly syncJobRepository: HcmSyncJobRepositoryPort,
    private readonly hcmClientService: HcmClientService,
    private readonly balanceCalculator: BalanceCalculatorService,
    private readonly batchImportValidator: BatchImportValidatorService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly metricsService: MetricsService,
    private readonly eventLogger: StructuredEventLogger,
  ) {}

  async runBatchImport(user: AuthUser, idempotencyKey?: string) {
    const scope = idempotencyKey
      ? buildBatchImportScope(user.id, idempotencyKey)
      : undefined;

    if (scope && idempotencyKey) {
      const cached = this.idempotencyService.getCached<Record<string, unknown>>(
        scope,
        idempotencyKey,
      );
      if (cached) {
        throw new OperationOkException(cached);
      }
    }

    const job = this.syncJobRepository.create(HcmSyncJobType.BATCH_IMPORT);
    this.logger.log(`Batch import started: ${job.id}`);
    this.eventLogger.emit({ event: 'batch.import.started', requestId: job.id });

    try {
      const rawBatch = await this.hcmClientService.getBatchBalances();
      const validatedRows = this.batchImportValidator.validateCorpus(rawBatch);
      const importedKeys = new Set<string>();

      let importedBalances = 0;
      let reconciliationRequired = 0;

      const result = this.transactionManager.runInTransaction(() => {
        for (const item of validatedRows) {
          importedKeys.add(`${item.employeeId}:${item.locationId}`);
          reconciliationRequired += this.applyValidatedRow(item);
          importedBalances++;
        }

        reconciliationRequired += this.markMissingFromCorpus(importedKeys);

        this.auditService.log({
          entityType: 'HCM_SYNC_JOB',
          entityId: job.id,
          action: 'BATCH_IMPORT_COMPLETED',
          actorType: ActorType.SYSTEM,
          actorId: user.id,
          metadata: { importedBalances, reconciliationRequired },
        });

        return {
          jobId: job.id,
          status: 'COMPLETED',
          importedBalances,
          reconciliationRequired,
        };
      });

      this.syncJobRepository.complete(job.id, result);
      if (scope && idempotencyKey) {
        this.idempotencyService.save(scope, idempotencyKey, result);
      }
      this.metricsService.increment('batchImportSuccessTotal');
      this.eventLogger.emit({
        event: 'batch.import.completed',
        requestId: job.id,
      });
      throw new OperationOkException(result);
    } catch (error) {
      if (error instanceof OperationOkException) {
        throw error;
      }
      if (error instanceof BatchImportValidationError) {
        this.syncJobRepository.fail(job.id, error.message);
        this.metricsService.increment('batchImportFailureTotal');
        this.eventLogger.emit({
          event: 'batch.import.failed',
          level: 'error',
          requestId: job.id,
          reason: error.message,
        });
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof HcmClientError) {
        this.syncJobRepository.fail(job.id, error.message);
        if (error.retryable) {
          throw new ServiceUnavailableException('HCM batch import unavailable');
        }
        throw new UnprocessableEntityException(error.message);
      }
      this.syncJobRepository.fail(job.id, (error as Error).message);
      throw error;
    }
  }

  private applyValidatedRow(item: ValidatedBatchBalanceRow): number {
    const employee = this.employeeRepository.upsert({
      hcmEmployeeId: item.employeeId,
    });
    const location = this.locationRepository.upsert({
      hcmLocationId: item.locationId,
      name: item.locationId,
    });

    const existing = this.balanceRepository.findByEmployeeAndLocation(
      employee.id,
      location.id,
    );

    const reserved = existing?.reservedBalance ?? 0;
    const projection = this.balanceCalculator.recalculateAfterHcmUpdate(
      item.balance,
      reserved,
    );

    if (existing) {
      this.balanceRepository.updateProjection(employee.id, location.id, {
        hcmBalance: projection.hcmBalance,
        availableBalance: projection.availableBalance,
        hcmVersion: item.version,
        lastHcmSyncAt: new Date().toISOString(),
        reconciliationRequired: projection.reconciliationRequired,
      });
    } else {
      this.balanceRepository.create({
        employeeId: employee.id,
        locationId: location.id,
        hcmBalance: item.balance,
        hcmVersion: item.version,
        lastHcmSyncAt: new Date().toISOString(),
      });
    }

    if (projection.reconciliationRequired) {
      this.markPendingRequestsReconciliation(employee.id, location.id);
      return 1;
    }

    return 0;
  }

  private markMissingFromCorpus(importedKeys: Set<string>): number {
    let conflicts = 0;
    const allBalances = this.balanceRepository.findAll();

    for (const balance of allBalances) {
      const employee = this.employeeRepository.findById(balance.employeeId);
      const location = this.locationRepository.findById(balance.locationId);
      if (!employee || !location) {
        continue;
      }

      const key = `${employee.hcmEmployeeId}:${location.hcmLocationId}`;
      if (!importedKeys.has(key)) {
        this.balanceRepository.updateProjection(
          balance.employeeId,
          balance.locationId,
          {
            reconciliationRequired: true,
            availableBalance: 0,
          },
        );
        this.markPendingRequestsReconciliation(
          balance.employeeId,
          balance.locationId,
        );
        conflicts++;
      }
    }

    return conflicts;
  }

  private markPendingRequestsReconciliation(
    employeeId: string,
    locationId: string,
  ): void {
    const pending = this.requestRepository.findActiveByEmployeeAndLocation(
      employeeId,
      locationId,
    );
    for (const request of pending) {
      try {
        this.requestRepository.transitionStatusIfIn(
          request.id,
          [
            RequestStatus.SUBMITTED,
            RequestStatus.PENDING_MANAGER_APPROVAL,
            RequestStatus.APPROVED_PENDING_HCM,
          ],
          RequestStatus.RECONCILIATION_REQUIRED,
          { failureReason: 'Batch import conflict' },
        );
      } catch {
        this.requestRepository.forceUpdateStatusForSystemReconciliation(
          request.id,
          RequestStatus.RECONCILIATION_REQUIRED,
          { failureReason: 'Batch import conflict' },
        );
      }
    }
  }
}
