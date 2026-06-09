import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly database: DatabaseService) {}

  find(scope: string, idempotencyKey: string): Record<string, unknown> | null {
    const row = this.database
      .getDb()
      .prepare(
        'SELECT response_json FROM idempotency_records WHERE scope = ? AND idempotency_key = ?',
      )
      .get(scope, idempotencyKey) as { response_json: string } | undefined;
    return row ? (JSON.parse(row.response_json) as Record<string, unknown>) : null;
  }

  save(
    scope: string,
    idempotencyKey: string,
    response: Record<string, unknown>,
  ): void {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT OR IGNORE INTO idempotency_records (id, scope, idempotency_key, response_json)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, scope, idempotencyKey, JSON.stringify(response));
  }
}
