import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { ActorType, RequestStatus } from '../../domain/enums';

export interface StatusHistoryRecord {
  id: string;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorType: ActorType;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

@Injectable()
export class StatusHistoryRepository {
  constructor(private readonly database: DatabaseService) {}

  create(data: {
    requestId: string;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus;
    actorType: ActorType;
    actorId?: string | null;
    reason?: string | null;
  }): StatusHistoryRecord {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO request_status_history (id, request_id, from_status, to_status, actor_type, actor_id, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.requestId,
        data.fromStatus,
        data.toStatus,
        data.actorType,
        data.actorId ?? null,
        data.reason ?? null,
      );
    return this.findByRequestId(data.requestId).slice(-1)[0];
  }

  findByRequestId(requestId: string): StatusHistoryRecord[] {
    const rows = this.database
      .getDb()
      .prepare(
        'SELECT * FROM request_status_history WHERE request_id = ? ORDER BY created_at ASC',
      )
      .all(requestId) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  private map(row: Record<string, unknown>): StatusHistoryRecord {
    return {
      id: row.id as string,
      requestId: row.request_id as string,
      fromStatus: (row.from_status as RequestStatus) ?? null,
      toStatus: row.to_status as RequestStatus,
      actorType: row.actor_type as ActorType,
      actorId: (row.actor_id as string) ?? null,
      reason: (row.reason as string) ?? null,
      createdAt: row.created_at as string,
    };
  }
}
