import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';

describe('Create idempotency payload mismatch', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  const basePayload = (seed: ReturnType<typeof seedScenario>) => ({
    employeeId: seed.employeeId,
    locationId: seed.locationId,
    amount: 2,
    unit: 'DAYS',
    startDate: '2026-02-10',
    endDate: '2026-02-11',
  });

  it('replays the original response for same key and same payload', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = basePayload(seed);

    const first = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-1')
      .send(payload)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-1')
      .send(payload)
      .expect(200);

    expect(replay.body.requestId).toBe(first.body.requestId);
  });

  it('returns 409 when the same key is reused with a different amount', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = basePayload(seed);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-2')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-2')
      .send({ ...payload, amount: 3 })
      .expect(409);
  });

  it('returns 409 when the same key is reused with different dates', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = basePayload(seed);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-3')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-3')
      .send({
        ...payload,
        startDate: '2026-03-10',
        endDate: '2026-03-11',
      })
      .expect(409);
  });

  it('returns 409 after idempotency cache is cleared but request row remains', async () => {
    const seed = seedScenario(database, mockHcm);
    const payload = basePayload(seed);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-4')
      .send(payload)
      .expect(200);

    database.getDb().prepare('DELETE FROM idempotency_records').run();

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .set('Idempotency-Key', 'create-key-4')
      .send({ ...payload, amount: 4 })
      .expect(409);
  });
});
