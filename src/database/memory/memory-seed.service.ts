import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { shouldSeedMemoryData } from '../persistence-mode';
import { MemoryStore } from './memory-store';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
} from '../ports/repository.ports';
import { EmployeeStatus, BalanceUnit } from '../../domain/enums';
import { MockHcmService } from '../../modules/mock-hcm/mock-hcm.service';

const OFFLINE_HCM_BALANCE = {
  employeeId: 'emp_123',
  locationId: 'loc_001',
  balance: 10,
  unit: 'DAYS',
  version: 'v1',
};

@Injectable()
export class MemorySeedService implements OnModuleInit {
  private readonly logger = new Logger(MemorySeedService.name);

  constructor(
    private readonly store: MemoryStore,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    if (!shouldSeedMemoryData()) {
      return;
    }
    if (this.store.employees.size > 0) {
      return;
    }

    this.logger.log(
      'Seeding in-memory demo dataset and mock HCM balances (SEED_MEMORY_DATA=true)',
    );

    this.employeeRepository.create({
      id: 'mgr_001',
      hcmEmployeeId: 'mgr_001',
      managerId: null,
      status: EmployeeStatus.ACTIVE,
    });

    this.employeeRepository.create({
      id: 'emp_123',
      hcmEmployeeId: 'emp_123',
      managerId: 'mgr_001',
      status: EmployeeStatus.ACTIVE,
    });

    this.locationRepository.create({
      id: 'loc_001',
      hcmLocationId: 'loc_001',
      name: 'HQ',
    });

    this.balanceRepository.create({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      hcmBalance: 10,
      unit: BalanceUnit.DAYS,
      hcmVersion: 'v1',
      lastHcmSyncAt: new Date().toISOString(),
    });

    const mockHcm = this.moduleRef.get(MockHcmService, { strict: false });
    mockHcm?.seed({
      balances: [OFFLINE_HCM_BALANCE],
    });
  }
}
