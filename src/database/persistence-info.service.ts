import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MemoryStore } from './memory/memory-store';
import { resolvePersistenceMode, PersistenceMode } from './persistence-mode';

@Injectable()
export class PersistenceInfoService {
  constructor(
    @Optional() private readonly databaseService?: DatabaseService,
    @Optional() private readonly memoryStore?: MemoryStore,
  ) {}

  getMode(): PersistenceMode {
    return resolvePersistenceMode();
  }

  isHealthy(): boolean {
    if (this.getMode() === 'memory') {
      return Boolean(this.memoryStore);
    }
    return this.databaseService?.isHealthy() ?? false;
  }

  resetForTests(): void {
    if (this.getMode() === 'memory') {
      this.memoryStore?.resetForTests();
      return;
    }
    this.databaseService?.resetForTests();
  }
}
