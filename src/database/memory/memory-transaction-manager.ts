import { Injectable } from '@nestjs/common';
import { MemoryStore } from './memory-store';
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
} from '../ports/transaction-manager.port';

@Injectable()
export class MemoryTransactionManager implements TransactionManagerPort {
  constructor(private readonly store: MemoryStore) {}

  runInTransaction<T>(callback: () => T): T {
    const snapshot = this.store.snapshot();
    try {
      const result = callback();
      return result;
    } catch (error) {
      this.store.restore(snapshot);
      throw error;
    }
  }
}

export const memoryTransactionManagerProvider = {
  provide: TRANSACTION_MANAGER,
  useClass: MemoryTransactionManager,
};
