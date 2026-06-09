import * as path from 'path';

describe('DatabaseService sqlite initialization', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fails fast in explicit sqlite mode when better-sqlite3 is unavailable', () => {
    const dbServicePath = require.resolve('../../src/database/database.service');
    const loaderPath = require.resolve('../../src/database/sqlite/load-better-sqlite3');

    jest.isolateModules(() => {
      jest.doMock('better-sqlite3', () => {
        throw new Error('native module unavailable');
      });
      delete require.cache[dbServicePath];
      delete require.cache[loaderPath];

      process.env.PERSISTENCE_MODE = 'sqlite';
      process.env.DATABASE_PATH = path.join(
        '/tmp',
        `sqlite-fail-${Date.now()}.db`,
      );

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DatabaseService } = require('../../src/database/database.service');
      const service = new DatabaseService();

      expect(() => service.onModuleInit()).toThrow(
        /SQLite persistence mode requires the optional dependency "better-sqlite3"/,
      );
    });
  });
});
