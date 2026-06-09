import {
  Injectable,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
} from '../../database/ports/repository.ports';
import { HcmClientService } from '../hcm/hcm-client.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { AuditService } from '../../common/audit/audit.service';
import { ActorType } from '../../domain/enums';
import { HcmClientError, HcmErrorType } from '../../domain/hcm-error-mapper.service';

@Injectable()
export class BalanceService {
  constructor(
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    private readonly hcmClientService: HcmClientService,
    private readonly balanceCalculator: BalanceCalculatorService,
    private readonly auditService: AuditService,
  ) {}

  getEmployeeBalances(employeeId: string) {
    const employee = this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const balances = this.balanceRepository.findByEmployee(employeeId);
    return {
      employeeId,
      balances: balances.map((b) => ({
        locationId: b.locationId,
        hcmBalance: b.hcmBalance,
        reservedBalance: b.reservedBalance,
        availableBalance: b.availableBalance,
        unit: b.unit,
        lastHcmSyncAt: b.lastHcmSyncAt,
        reconciliationRequired: b.reconciliationRequired,
      })),
    };
  }

  async refreshBalance(employeeId: string, locationId: string) {
    const employee = this.employeeRepository.findById(employeeId);
    const location = this.locationRepository.findById(locationId);
    if (!employee || !location) {
      throw new NotFoundException('Employee or location not found');
    }

    const localBalance = this.balanceRepository.findByEmployeeAndLocation(
      employeeId,
      locationId,
    );

    try {
      const hcmBalance = await this.hcmClientService.getRealtimeBalance(
        employee.hcmEmployeeId,
        location.hcmLocationId,
      );

      const reserved = localBalance?.reservedBalance ?? 0;
      const projection = this.balanceCalculator.recalculateAfterHcmUpdate(
        hcmBalance.balance,
        reserved,
      );

      const updated = localBalance
        ? this.balanceRepository.updateProjection(employeeId, locationId, {
            hcmBalance: projection.hcmBalance,
            availableBalance: projection.availableBalance,
            hcmVersion: hcmBalance.version,
            lastHcmSyncAt: new Date().toISOString(),
            reconciliationRequired: projection.reconciliationRequired,
          })
        : this.balanceRepository.create({
            employeeId,
            locationId,
            hcmBalance: hcmBalance.balance,
            hcmVersion: hcmBalance.version,
            lastHcmSyncAt: new Date().toISOString(),
          });

      this.auditService.log({
        entityType: 'BALANCE',
        entityId: updated.id,
        action: 'BALANCE_REFRESHED',
        actorType: ActorType.SYSTEM,
        metadata: { employeeId, locationId, source: 'HCM_REALTIME' },
      });

      return {
        employeeId,
        locationId,
        hcmBalance: updated.hcmBalance,
        reservedBalance: updated.reservedBalance,
        availableBalance: updated.availableBalance,
        source: 'HCM_REALTIME',
        lastHcmSyncAt: updated.lastHcmSyncAt,
      };
    } catch (error) {
      if (
        error instanceof HcmClientError &&
        (error.type === HcmErrorType.INVALID_DIMENSIONS ||
          error.type === HcmErrorType.NOT_FOUND)
      ) {
        if (localBalance) {
          this.balanceRepository.updateProjection(employeeId, locationId, {
            reconciliationRequired: true,
            availableBalance: 0,
          });
        }
        throw new UnprocessableEntityException(
          'Invalid employee/location in HCM',
        );
      }
      if (error instanceof HcmClientError && error.retryable) {
        throw new ServiceUnavailableException('HCM balance refresh unavailable');
      }
      throw error;
    }
  }
}
