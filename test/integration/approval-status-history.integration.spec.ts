import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, authHeaders } from '../helpers/test-app.helper';
import { seedScenario } from '../helpers/seed.helper';
import { DatabaseService } from '../../src/database/database.service';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { RequestStatus } from '../../src/domain/enums';

describe('Approval status history accuracy', () => {
  let app: INestApplication;
  let database: DatabaseService;
  let mockHcm: MockHcmService;

  jest.setTimeout(15000);

  beforeEach(async () => {
    ({ app, database, mockHcm } = await createTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('records APPROVED_PENDING_HCM -> APPROVED on normal approval', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.body.requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(detail.body.statusHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromStatus: RequestStatus.APPROVED_PENDING_HCM,
          toStatus: RequestStatus.APPROVED,
        }),
      ]),
    );
  });

  it('records FAILED_HCM_SUBMISSION -> APPROVED on timeout retry success', async () => {
    const seed = seedScenario(database, mockHcm);

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .send({
        employeeId: seed.employeeId,
        locationId: seed.locationId,
        amount: 2,
        unit: 'DAYS',
        startDate: '2026-02-10',
        endDate: '2026-02-11',
      })
      .expect(200);

    const requestId = created.body.requestId;
    mockHcm.setScenario(`submit:${requestId}`, 'timeout_after_accept');

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(202);

    await request(app.getHttpServer())
      .post(`/time-off-requests/${requestId}/approve`)
      .set(authHeaders(seed.managerId, 'MANAGER'))
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/time-off-requests/${requestId}`)
      .set(authHeaders(seed.employeeId, 'EMPLOYEE'))
      .expect(200);

    expect(detail.body.statusHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromStatus: RequestStatus.FAILED_HCM_SUBMISSION,
          toStatus: RequestStatus.APPROVED,
        }),
      ]),
    );
  });
});
