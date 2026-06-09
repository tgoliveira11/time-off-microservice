import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';

export interface LocationRecord {
  id: string;
  hcmLocationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class LocationRepository {
  constructor(private readonly database: DatabaseService) {}

  findById(id: string): LocationRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM locations WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  findByHcmId(hcmLocationId: string): LocationRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM locations WHERE hcm_location_id = ?')
      .get(hcmLocationId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  upsert(data: { hcmLocationId: string; name: string }): LocationRecord {
    const existing = this.findByHcmId(data.hcmLocationId);
    if (existing) {
      this.database
        .getDb()
        .prepare(
          `UPDATE locations SET name = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .run(data.name, existing.id);
      return this.findById(existing.id)!;
    }

    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO locations (id, hcm_location_id, name) VALUES (?, ?, ?)`,
      )
      .run(id, data.hcmLocationId, data.name);
    return this.findById(id)!;
  }

  create(data: {
    id?: string;
    hcmLocationId: string;
    name: string;
  }): LocationRecord {
    const id = data.id ?? uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO locations (id, hcm_location_id, name) VALUES (?, ?, ?)`,
      )
      .run(id, data.hcmLocationId, data.name);
    return this.findById(id)!;
  }

  private map(row: Record<string, unknown>): LocationRecord {
    return {
      id: row.id as string,
      hcmLocationId: row.hcm_location_id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
