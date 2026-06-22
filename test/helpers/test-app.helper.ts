import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as path from 'path';
import * as fs from 'fs';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { DatabaseService } from '../../src/database/database.service';
import { PersistenceInfoService } from '../../src/database/persistence-info.service';
import { resetPersistenceModeCacheForTests } from '../../src/database/persistence-mode';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { MetricsService } from '../../src/common/observability/metrics.service';
import { DatabaseService as DatabaseServiceClass } from '../../src/database/database.service';
import { setupSwagger } from '../../src/common/swagger/swagger.config';

type TestAppResult = {
  app: INestApplication;
  mockHcm: MockHcmService;
  persistence: PersistenceInfoService;
  database?: DatabaseService;
  swaggerDocument: OpenAPIObject;
};

async function bootstrapTestApp(): Promise<TestAppResult> {
  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const swaggerDocument = setupSwagger(app);
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  process.env.HCM_BASE_URL = `http://127.0.0.1:${port}/mock-hcm`;

  const persistence = app.get(PersistenceInfoService);
  const mockHcm = app.get(MockHcmService);
  app.get(MetricsService).resetForTests();

  let database: DatabaseService | undefined;
  if (persistence.getMode() === 'sqlite') {
    database = app.get(DatabaseServiceClass);
  }

  return { app, mockHcm, persistence, database, swaggerDocument };
}

export async function createSqliteTestApp(dbPath?: string): Promise<
  TestAppResult & { database: DatabaseService }
> {
  resetPersistenceModeCacheForTests();
  process.env.PERSISTENCE_MODE = 'sqlite';
  delete process.env.SEED_MEMORY_DATA;

  const databasePath =
    dbPath ??
    path.join(
      process.cwd(),
      'data',
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  process.env.DATABASE_PATH = databasePath;
  process.env.HCM_TIMEOUT_MS = '300';

  const result = await bootstrapTestApp();
  if (!result.database) {
    throw new Error('Expected sqlite database in createSqliteTestApp');
  }

  return { ...result, database: result.database };
}

/** @deprecated Use createSqliteTestApp */
export const createTestApp = createSqliteTestApp;

export async function createMemoryTestApp(
  seed = true,
): Promise<TestAppResult> {
  resetPersistenceModeCacheForTests();
  process.env.PERSISTENCE_MODE = 'memory';
  process.env.SEED_MEMORY_DATA = seed ? 'true' : 'false';
  delete process.env.DATABASE_PATH;
  process.env.HCM_TIMEOUT_MS = '300';

  return bootstrapTestApp();
}

export function authHeaders(userId: string, role: string) {
  return {
    'X-User-Id': userId,
    'X-User-Role': role,
  };
}
