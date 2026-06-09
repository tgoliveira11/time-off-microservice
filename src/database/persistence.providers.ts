import { Provider } from '@nestjs/common';
import { resolvePersistenceMode } from './persistence-mode';

export function createPersistenceProviders(): Provider[] {
  if (resolvePersistenceMode() === 'memory') {
    // Dynamic require keeps SQLite adapters out of the memory/offline module graph.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createMemoryPersistenceProviders } = require('./memory-persistence.providers') as typeof import('./memory-persistence.providers');
    return createMemoryPersistenceProviders();
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createSqlitePersistenceProviders } = require('./sqlite-persistence.providers') as typeof import('./sqlite-persistence.providers');
  return createSqlitePersistenceProviders();
}

export function createPersistenceExports(): Array<string | symbol | Function> {
  if (resolvePersistenceMode() === 'memory') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { memoryPersistenceExports } = require('./memory-persistence.providers') as typeof import('./memory-persistence.providers');
    return [...memoryPersistenceExports];
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sqlitePersistenceExports } = require('./sqlite-persistence.providers') as typeof import('./sqlite-persistence.providers');
  return [...sqlitePersistenceExports];
}
