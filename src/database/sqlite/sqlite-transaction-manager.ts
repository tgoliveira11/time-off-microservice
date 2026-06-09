import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
} from '../ports/transaction-manager.port';

@Injectable()
export class SqliteTransactionManager implements TransactionManagerPort {
  constructor(private readonly database: DatabaseService) {}

  runInTransaction<T>(callback: () => T): T {
    return this.database.transaction(callback);
  }
}

export const sqliteTransactionManagerProvider = {
  provide: TRANSACTION_MANAGER,
  useClass: SqliteTransactionManager,
};
