import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { loadBetterSqlite3 } from './sqlite/load-better-sqlite3';

export type PersistenceMode = 'sqlite' | 'memory';
export type PersistenceModeSetting = 'sqlite' | 'memory' | 'auto';

const logger = new Logger('PersistenceMode');

export function getPersistenceModeSetting(): PersistenceModeSetting {
  const raw = (process.env.PERSISTENCE_MODE ?? 'sqlite').toLowerCase();
  if (raw === 'memory' || raw === 'auto') {
    return raw;
  }
  return 'sqlite';
}

function canInitializeSqlite(): boolean {
  try {
    const DatabaseConstructor = loadBetterSqlite3();
    const dbPath =
      process.env.DATABASE_PATH ??
      path.join(process.cwd(), 'data', '.sqlite-probe.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseConstructor(dbPath);
    db.prepare('SELECT 1').get();
    db.close();
    if (dbPath.endsWith('.sqlite-probe.db')) {
      fs.unlinkSync(dbPath);
    }
    return true;
  } catch {
    return false;
  }
}

let resolvedMode: PersistenceMode | null = null;

export function resolvePersistenceMode(): PersistenceMode {
  if (resolvedMode) {
    return resolvedMode;
  }

  const setting = getPersistenceModeSetting();
  if (setting === 'memory') {
    resolvedMode = 'memory';
    return resolvedMode;
  }

  if (setting === 'sqlite') {
    resolvedMode = 'sqlite';
    return resolvedMode;
  }

  if (canInitializeSqlite()) {
    resolvedMode = 'sqlite';
    return resolvedMode;
  }

  logger.warn(
    'SQLite persistence could not be initialized. Falling back to in-memory persistence because PERSISTENCE_MODE=auto. ' +
      'This mode is intended for offline/demo use only and data will be lost on restart.',
  );
  resolvedMode = 'memory';
  return resolvedMode;
}

export function resetPersistenceModeCacheForTests(): void {
  resolvedMode = null;
}

export function shouldSeedMemoryData(): boolean {
  return (
    resolvePersistenceMode() === 'memory' &&
    process.env.SEED_MEMORY_DATA === 'true'
  );
}
