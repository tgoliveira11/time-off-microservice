import {
  loadBetterSqlite3,
  resetBetterSqlite3LoadCountForTests,
} from '../../src/database/sqlite/load-better-sqlite3';

describe('loadBetterSqlite3', () => {
  afterEach(() => {
    resetBetterSqlite3LoadCountForTests();
  });

  it('loads better-sqlite3 when available', () => {
    expect(() => loadBetterSqlite3()).not.toThrow();
  });
});
