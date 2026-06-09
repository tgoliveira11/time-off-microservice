import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database.service';
import { EmployeeStatus } from '../../domain/enums';
import { EmployeeRepositoryPort } from '../ports/repository.ports';

export interface EmployeeRecord {
  id: string;
  hcmEmployeeId: string;
  managerId: string | null;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EmployeeRepository implements EmployeeRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  findById(id: string): EmployeeRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM employees WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  findByHcmId(hcmEmployeeId: string): EmployeeRecord | null {
    const row = this.database
      .getDb()
      .prepare('SELECT * FROM employees WHERE hcm_employee_id = ?')
      .get(hcmEmployeeId) as Record<string, unknown> | undefined;
    return row ? this.map(row) : null;
  }

  upsert(data: {
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord {
    const existing = this.findByHcmId(data.hcmEmployeeId);
    if (existing) {
      this.database
        .getDb()
        .prepare(
          `UPDATE employees SET manager_id = COALESCE(?, manager_id), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`,
        )
        .run(
          data.managerId ?? null,
          data.status ?? null,
          existing.id,
        );
      return this.findById(existing.id)!;
    }

    const id = uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO employees (id, hcm_employee_id, manager_id, status) VALUES (?, ?, ?, ?)`,
      )
      .run(
        id,
        data.hcmEmployeeId,
        data.managerId ?? null,
        data.status ?? EmployeeStatus.ACTIVE,
      );
    return this.findById(id)!;
  }

  create(data: {
    id?: string;
    hcmEmployeeId: string;
    managerId?: string | null;
    status?: EmployeeStatus;
  }): EmployeeRecord {
    const id = data.id ?? uuidv4();
    this.database
      .getDb()
      .prepare(
        `INSERT INTO employees (id, hcm_employee_id, manager_id, status) VALUES (?, ?, ?, ?)`,
      )
      .run(
        id,
        data.hcmEmployeeId,
        data.managerId ?? null,
        data.status ?? EmployeeStatus.ACTIVE,
      );
    return this.findById(id)!;
  }

  findDirectReports(managerId: string): EmployeeRecord[] {
    const rows = this.database
      .getDb()
      .prepare('SELECT * FROM employees WHERE manager_id = ?')
      .all(managerId) as Record<string, unknown>[];
    return rows.map((row) => this.map(row));
  }

  private map(row: Record<string, unknown>): EmployeeRecord {
    return {
      id: row.id as string,
      hcmEmployeeId: row.hcm_employee_id as string,
      managerId: (row.manager_id as string) ?? null,
      status: row.status as EmployeeStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
