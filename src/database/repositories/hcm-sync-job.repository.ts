import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { HcmSyncJobStatus, HcmSyncJobType } from '../../domain/enums';

export interface HcmSyncJobRecord {
  id: string;
  type: HcmSyncJobType;
  status: HcmSyncJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  resultJson: string | null;
  createdAt: string;
}

@Injectable()
export class HcmSyncJobRepository {
  constructor(private readonly database: DatabaseService) {}

  create(type: HcmSyncJobType): HcmSyncJobRecord {
    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO hcm_sync_jobs (id, type, status, started_at) VALUES (?, ?, ?, datetime('now'))`,
      )
      .run(id, type, HcmSyncJobStatus.RUNNING);
    return this.findById(id)!;
  }

  complete(id: string, result: Record<string, unknown>): HcmSyncJobRecord {
    this.database
      .getDb()
      .prepare(
        `UPDATE hcm_sync_jobs SET status = ?, completed_at = datetime('now'), result_json = ? WHERE id = ?`,
      )
      .run(HcmSyncJobStatus.COMPLETED, JSON.stringify(result), id);
    return this.findById(id)!;
  }

  fail(id: string, errorMessage: string): HcmSyncJobRecord {
    this.database
      .getDb()
      .prepare(
        `UPDATE hcm_sync_jobs SET status = ?, completed_at = datetime('now'), error_message = ? WHERE id = ?`,
      )
      .run(HcmSyncJobStatus.FAILED, errorMessage, id);
    return this.findById(id)!;
  }

  findById(id: string): HcmSyncJobRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM hcm_sync_jobs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  private map(row: Record<string, unknown>): HcmSyncJobRecord {
    return {
      id: row.id as string,
      type: row.type as HcmSyncJobType,
      status: row.status as HcmSyncJobStatus,
      startedAt: (row.started_at as string) ?? null,
      completedAt: (row.completed_at as string) ?? null,
      errorMessage: (row.error_message as string) ?? null,
      resultJson: (row.result_json as string) ?? null,
      createdAt: row.created_at as string,
    };
  }
}
