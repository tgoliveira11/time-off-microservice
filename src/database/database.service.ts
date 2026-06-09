import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadBetterSqlite3,
  SqliteDatabase,
} from './sqlite/load-better-sqlite3';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: SqliteDatabase;

  onModuleInit(): void {
    const DatabaseConstructor = loadBetterSqlite3();
    const dbPath =
      process.env.DATABASE_PATH ??
      path.join(process.cwd(), 'data', 'time-off.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseConstructor(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  onModuleDestroy(): void {
    this.db?.close();
  }

  getDb(): SqliteDatabase {
    return this.db;
  }

  transaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }

  isHealthy(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  resetForTests(): void {
    const tables = [
      'idempotency_records',
      'audit_logs',
      'outbox_events',
      'hcm_sync_jobs',
      'request_status_history',
      'time_off_requests',
      'balances',
      'locations',
      'employees',
    ];
    for (const table of tables) {
      this.db.exec(`DELETE FROM ${table}`);
    }
  }

  private initializeSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }
}
