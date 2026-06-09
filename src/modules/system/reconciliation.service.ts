import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  HCM_SYNC_JOB_REPOSITORY,
  HcmSyncJobRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
} from '../../database/ports/repository.ports';
import { HcmClientService } from '../hcm/hcm-client.service';
import { AuditService } from '../../common/audit/audit.service';
import {
  ActorType,
  HcmSyncJobType,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from '../../domain/enums';
import {
  ReconciliationIssue,
  ReconciliationRulesService,
} from '../../domain/reconciliation-rules.service';
import { MetricsService } from '../../common/observability/metrics.service';
import { StructuredEventLogger } from '../../common/observability/structured-event-logger.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    @Inject(HCM_SYNC_JOB_REPOSITORY)
    private readonly syncJobRepository: HcmSyncJobRepositoryPort,
    private readonly hcmClientService: HcmClientService,
    private readonly reconciliationRules: ReconciliationRulesService,
    private readonly auditService: AuditService,
    private readonly metricsService: MetricsService,
    private readonly eventLogger: StructuredEventLogger,
  ) {}

  async runReconciliation() {
    this.eventLogger.emit({ event: 'reconciliation.started' });
    this.metricsService.increment('reconciliationRunsTotal');
    const job = this.syncJobRepository.create(HcmSyncJobType.RECONCILIATION);
    const issues: ReconciliationIssue[] = [];

    const balances = this.balanceRepository.findAll();

    for (const balance of balances) {
      const employee = this.employeeRepository.findById(balance.employeeId);
      const location = this.locationRepository.findById(balance.locationId);
      if (!employee || !location) {
        continue;
      }

      try {
        const remote = await this.hcmClientService.getRealtimeBalance(
          employee.hcmEmployeeId,
          location.hcmLocationId,
        );

        const reservedIssue = this.reconciliationRules.evaluateReservedExceedsHcm(
          balance.employeeId,
          balance.locationId,
          remote.balance,
          balance.reservedBalance,
        );
        if (reservedIssue) {
          issues.push(reservedIssue);
        }

        const mismatchIssue = this.reconciliationRules.evaluateBalanceMismatch(
          balance.employeeId,
          balance.locationId,
          balance.hcmBalance,
          remote.balance,
          balance.reservedBalance,
        );
        if (mismatchIssue) {
          issues.push(mismatchIssue);
        }

        if (reservedIssue || mismatchIssue) {
          this.balanceRepository.updateProjection(
            balance.employeeId,
            balance.locationId,
            { reconciliationRequired: true, availableBalance: 0 },
          );
          this.auditService.log({
            entityType: 'BALANCE',
            entityId: balance.id,
            action: 'RECONCILIATION_ISSUE_DETECTED',
            actorType: ActorType.SYSTEM,
            metadata: {
              issues: [reservedIssue, mismatchIssue].filter(Boolean),
            },
          });
        }
      } catch {
        issues.push({
          type: ReconciliationIssueType.INVALID_DIMENSION,
          employeeId: balance.employeeId,
          locationId: balance.locationId,
          severity: ReconciliationSeverity.HIGH,
          details: 'HCM rejected employee/location during reconciliation',
        });
      }
    }

    const result = {
      jobId: job.id,
      status: 'COMPLETED',
      issues,
    };

    this.syncJobRepository.complete(job.id, result);
    if (issues.length > 0) {
      this.metricsService.increment('reconciliationIssuesTotal', issues.length);
      this.eventLogger.emit({
        event: 'reconciliation.issues.detected',
        level: 'warn',
        reason: `${issues.length} issue(s) detected`,
      });
    }
    this.eventLogger.emit({
      event: 'reconciliation.completed',
      requestId: job.id,
    });
    this.logger.log(`Reconciliation completed with ${issues.length} issues`);
    return result;
  }
}
