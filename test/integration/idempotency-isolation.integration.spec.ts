import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { EmployeeRepository } from '../../src/database/repositories/employee.repository';
import { BalanceRepository } from '../../src/database/repositories/balance.repository';
import { EmployeeStatus } from '../../src/domain/enums';

describe('Idempotency isolation', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  function seedSecondEmployee(seed: ReturnType<typeof seedScenario>) {
    const employeeRepo = new EmployeeRepository(database);
    const balanceRepo = new BalanceRepository(database);

    employeeRepo.create({
      id: 'emp_456',
      hcmEmployeeId: 'emp_456',
      managerId: seed.managerId,
      status: EmployeeStatus.ACTIVE,
    });
    balanceRepo.create({
      employeeId: 'emp_456',
      locationId: seed.locationId,
      hcmBalance: 10,
    });

    mockHcm.setBalance({
      employeeId: 'emp_456',
      locationId: seed.hcmLocationId,
      balance: 10,
      unit: 'DAYS',
      version: 'v10',
    });
  }

  it('does not share create cache across different employees with same key', async () => {
    const seed = seedScenario(database, mockHcm);
    seedSecondEmployee(seed);

    const payload = {
      locationId: seed.locationId,
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-11',
    };

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'shared-create-key')
      .send({ ...payload, employeeId: seed.employeeId })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_456', 'EMPLOYEE'))
      .set('Idempotency-Key', 'shared-create-key')
      .send({ ...payload, employeeId: 'emp_456' })
      .expect(200);

    expect(second.body.requestId).not.toBe(first.body.requestId);
  });

  it('does not share approve cache across different requests with same key', async () => {
    const seed = seedScenario(database, mockHcm);

    const createA = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-10',
      })
      .expect(200);

    const createB = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 1,
        unit: 'DAYS',
        startDate: '2026-02-11',
        endDate: '2026-02-11',
      })
      .expect(200);

    const approveA = await request(app.getHttpServer())
      .post(`/time-off-requests/${createA.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'shared-approve-key')
      .expect(200);

    const approveB = await request(app.getHttpServer())
      .post(`/time-off-requests/${createB.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .set('Idempotency-Key', 'shared-approve-key')
      .expect(200);

    expect(approveB.body.requestId).not.toBe(approveA.body.requestId);
  });

  it('returns cached create response only for the same employee scope', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = {
      employeeId: seed.employeeId,
      locationId: seed.locationId,
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-11',
    };

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'repeat-key')
      .send(payload)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'repeat-key')
      .send(payload)
      .expect(200);

    expect(replay.body.requestId).toBe(first.body.requestId);
  });
});
