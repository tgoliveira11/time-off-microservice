import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { ActorType } from '../../domain/enums';

export interface AuditLogRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  metadata: string;
  createdAt: string;
}

@Injectable()
export class AuditLogRepository {
  constructor(private readonly database: DatabaseService) {}

  create(data: {
    entityType: string;
    entityId: string;
    action: string;
    actorType: ActorType;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }): AuditLogRecord {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_type, actor_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.entityType,
        data.entityId,
        data.action,
        data.actorType,
        data.actorId ?? null,
        JSON.stringify(data.metadata ?? {}),
      );
    return this.findById(id)!;
  }

  findByEntity(entityType: string, entityId: string): AuditLogRecord[] {
    const rows = this.database
      .getDb()
      .prepare(
        'SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC',
      )
      .all(entityType, entityId) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  findById(id: string): AuditLogRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM audit_logs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  private map(row: Record<string, unknown>): AuditLogRecord {
    return {
      id: row.id as string,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      action: row.action as string,
      actorType: row.actor_type as ActorType,
      actorId: (row.actor_id as string) ?? null,
      metadata: row.metadata as string,
      createdAt: row.created_at as string,
    };
  }
}
