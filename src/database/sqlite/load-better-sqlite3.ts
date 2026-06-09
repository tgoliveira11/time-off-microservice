/* eslint-disable @typescript-eslint/no-explicit-any */

export type SqliteDatabase = {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
  pragma(name: string): unknown;
  transaction<T>(fn: () => T): () => T;
  close(): void;
};

type BetterSqlite3Constructor = new (filename: string) => SqliteDatabase;

let loadCount = 0;

export function getBetterSqlite3LoadCountForTests(): number {
  return loadCount;
}

export function resetBetterSqlite3LoadCountForTests(): void {
  loadCount = 0;
}

export function loadBetterSqlite3(): BetterSqlite3Constructor {
  loadCount += 1;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BetterSqlite3 = require('better-sqlite3') as
      | BetterSqlite3Constructor
      | { default: BetterSqlite3Constructor };
    const DatabaseConstructor =
      (BetterSqlite3 as { default?: BetterSqlite3Constructor }).default ??
      (BetterSqlite3 as BetterSqlite3Constructor);
    return DatabaseConstructor;
  } catch (error) {
    throw new Error(
      'SQLite persistence mode requires the optional dependency "better-sqlite3". ' +
        'Install dependencies normally with npm ci, or run with PERSISTENCE_MODE=memory for offline mode. ' +
        `Original error: ${(error as Error).message}`,
    );
  }
}
