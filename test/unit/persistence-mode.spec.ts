import {
  resetPersistenceModeCacheForTests,
  resolvePersistenceMode,
  getPersistenceModeSetting,
  shouldSeedMemoryData,
} from '../../src/database/persistence-mode';

describe('persistence-mode', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetPersistenceModeCacheForTests();
  });

  it('defaults to sqlite when PERSISTENCE_MODE is missing', () => {
    delete process.env.PERSISTENCE_MODE;
    expect(getPersistenceModeSetting()).toBe('sqlite');
    expect(resolvePersistenceMode()).toBe('sqlite');
  });

  it('honors explicit memory mode', () => {
    process.env.PERSISTENCE_MODE = 'memory';
    expect(resolvePersistenceMode()).toBe('memory');
  });

  it('requires SEED_MEMORY_DATA for seeding helper', () => {
    process.env.PERSISTENCE_MODE = 'memory';
    delete process.env.SEED_MEMORY_DATA;
    expect(shouldSeedMemoryData()).toBe(false);
    process.env.SEED_MEMORY_DATA = 'true';
    expect(shouldSeedMemoryData()).toBe(true);
  });

  it('falls back to memory in auto mode when sqlite probe fails', () => {
    process.env.PERSISTENCE_MODE = 'auto';
    const loaderPath = require.resolve('../../src/database/sqlite/load-better-sqlite3');
    const modePath = require.resolve('../../src/database/persistence-mode');

    jest.isolateModules(() => {
      jest.doMock('better-sqlite3', () => {
        throw new Error('native module unavailable');
      });
      delete require.cache[loaderPath];
      delete require.cache[modePath];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mode = require('../../src/database/persistence-mode');
      mode.resetPersistenceModeCacheForTests();
      expect(mode.resolvePersistenceMode()).toBe('memory');
    });
  });
});
