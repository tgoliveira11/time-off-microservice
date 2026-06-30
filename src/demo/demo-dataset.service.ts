import { Inject, Injectable } from '@nestjs/common';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
} from '../database/ports/repository.ports';
import { PersistenceInfoService } from '../database/persistence-info.service';
import { MetricsService } from '../common/observability/metrics.service';
import { BalanceUnit, EmployeeStatus } from '../domain/enums';
import {
  DEMO_BALANCE,
  DEMO_EMPLOYEE_ID,
  DEMO_LOCATION_ID,
  DEMO_MANAGER_ID,
} from './demo-dataset.constants';

@Injectable()
export class DemoDatasetService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    private readonly persistenceInfo: PersistenceInfoService,
    private readonly metricsService: MetricsService,
  ) {}

  resetLocalData(): void {
    this.persistenceInfo.resetForTests();
    this.metricsService.resetForTests();
  }

  ensureDefaultDemoDataset(): void {
    if (!this.employeeRepository.findById(DEMO_MANAGER_ID)) {
      this.employeeRepository.create({
        id: DEMO_MANAGER_ID,
        hcmEmployeeId: DEMO_MANAGER_ID,
        managerId: null,
        status: EmployeeStatus.ACTIVE,
      });
    }

    if (!this.employeeRepository.findById(DEMO_EMPLOYEE_ID)) {
      this.employeeRepository.create({
        id: DEMO_EMPLOYEE_ID,
        hcmEmployeeId: DEMO_EMPLOYEE_ID,
        managerId: DEMO_MANAGER_ID,
        status: EmployeeStatus.ACTIVE,
      });
    }

    if (!this.locationRepository.findById(DEMO_LOCATION_ID)) {
      this.locationRepository.create({
        id: DEMO_LOCATION_ID,
        hcmLocationId: DEMO_LOCATION_ID,
        name: 'HQ',
      });
    }

    if (
      !this.balanceRepository.findByEmployeeAndLocation(
        DEMO_EMPLOYEE_ID,
        DEMO_LOCATION_ID,
      )
    ) {
      this.balanceRepository.create({
        employeeId: DEMO_EMPLOYEE_ID,
        locationId: DEMO_LOCATION_ID,
        hcmBalance: DEMO_BALANCE,
        unit: BalanceUnit.DAYS,
        hcmVersion: 'v1',
        lastHcmSyncAt: new Date().toISOString(),
      });
    }
  }
}
