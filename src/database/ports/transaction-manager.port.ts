export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export interface TransactionManagerPort {
  runInTransaction<T>(callback: () => T): T;
}
