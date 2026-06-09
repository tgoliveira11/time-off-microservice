import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { OutboxEventStatus } from '../../domain/enums';

export interface OutboxEventRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: string;
  status: OutboxEventStatus;
  retryCount: number;
  nextRetryAt: string | null;
  createdAt: string;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  create(data: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): OutboxEventRecord {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.aggregateType,
        data.aggregateId,
        data.eventType,
        JSON.stringify(data.payload),
        OutboxEventStatus.PENDING,
      );
    return this.findById(id)!;
  }

  findById(id: string): OutboxEventRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM outbox_events WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  private map(row: Record<string, unknown>): OutboxEventRecord {
    return {
      id: row.id as string,
      aggregateType: row.aggregate_type as string,
      aggregateId: row.aggregate_id as string,
      eventType: row.event_type as string,
      payload: row.payload as string,
      status: row.status as OutboxEventStatus,
      retryCount: row.retry_count as number,
      nextRetryAt: (row.next_retry_at as string) ?? null,
      createdAt: row.created_at as string,
    };
  }
}
