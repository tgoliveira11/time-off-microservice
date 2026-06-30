import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createSqliteTestApp, authHeaders } from '../helpers/test-app.helper';

describe('Demo dataset seed (Swagger flow)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    ({ app } = await createSqliteTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('seeds local employee and balances via sqlite test seed', async () => {
    await request(app.getHttpServer()).post('/sqlite/test/seed').expect(200);

    const balances = await request(app.getHttpServer())
      .get('/employees/emp_123/balances')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .expect(200);

    expect(balances.body).toMatchObject({
      employeeId: 'emp_123',
      balances: [
        expect.objectContaining({
          locationId: 'loc_001',
          hcmBalance: 10,
          availableBalance: 10,
        }),
      ],
    });
  });

  it('seeds mock HCM balance via mock-hcm test seed', async () => {
    await request(app.getHttpServer()).post('/mock-hcm/test/seed').send({}).expect(200);

    const mockBalance = await request(app.getHttpServer())
      .get('/mock-hcm/employees/emp_123/locations/loc_001/balance')
      .expect(200);

    expect(mockBalance.body.balance).toBe(10);
  });

  it('clears only local persistence via sqlite test reset', async () => {
    await request(app.getHttpServer()).post('/sqlite/test/seed').expect(200);
    await request(app.getHttpServer()).post('/mock-hcm/test/seed').send({}).expect(200);

    await request(app.getHttpServer()).post('/sqlite/test/reset').expect(200);

    await request(app.getHttpServer())
      .get('/employees/emp_123/balances')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .expect(404);

    await request(app.getHttpServer())
      .get('/mock-hcm/employees/emp_123/locations/loc_001/balance')
      .expect(200);
  });

  it('clears only mock HCM via mock-hcm test reset', async () => {
    await request(app.getHttpServer()).post('/sqlite/test/seed').expect(200);
    await request(app.getHttpServer()).post('/mock-hcm/test/seed').send({}).expect(200);

    await request(app.getHttpServer()).post('/mock-hcm/test/reset').expect(200);

    await request(app.getHttpServer())
      .get('/employees/emp_123/balances')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .expect(200);

    await request(app.getHttpServer())
      .get('/mock-hcm/employees/emp_123/locations/loc_001/balance')
      .expect(404);
  });

  it('supports full walkthrough reset by calling sqlite and mock-hcm reset', async () => {
    await request(app.getHttpServer()).post('/sqlite/test/seed').expect(200);
    await request(app.getHttpServer()).post('/mock-hcm/test/seed').send({}).expect(200);

    await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .set('Idempotency-Key', 'reset-flow-key')
      .send({
        employeeId: 'emp_123',
        locationId: 'loc_001',
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-07-10',
        endDate: '2026-07-11',
      })
      .expect(200);

    await request(app.getHttpServer()).post('/sqlite/test/reset').expect(200);
    await request(app.getHttpServer()).post('/mock-hcm/test/reset').expect(200);

    await request(app.getHttpServer())
      .get('/employees/emp_123/balances')
      .set(authHeaders('emp_123', 'EMPLOYEE'))
      .expect(404);

    await request(app.getHttpServer())
      .get('/mock-hcm/employees/emp_123/locations/loc_001/balance')
      .expect(404);
  });
});
