import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { shouldSeedMemoryData } from '../persistence-mode';
import { MemoryStore } from './memory-store';
import { DemoDatasetService } from '../../demo/demo-dataset.service';
import { MockHcmService } from '../../modules/mock-hcm/mock-hcm.service';
import { DEFAULT_MOCK_HCM_BALANCE } from '../../modules/mock-hcm/mock-hcm-defaults';

@Injectable()
export class MemorySeedService implements OnModuleInit {
  private readonly logger = new Logger(MemorySeedService.name);

  constructor(
    private readonly store: MemoryStore,
    private readonly demoDatasetService: DemoDatasetService,
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

    this.demoDatasetService.ensureDefaultDemoDataset();

    const mockHcm = this.moduleRef.get(MockHcmService, { strict: false });
    mockHcm?.seed({
      balances: [DEFAULT_MOCK_HCM_BALANCE],
    });
  }
}
