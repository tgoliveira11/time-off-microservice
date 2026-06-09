import * as path from 'path';
import { DatabaseService } from '../../src/database/database.service';
import {
  RequestTransitionConflictError,
  TimeOffRequestRepository,
} from '../../src/database/repositories/time-off-request.repository';
import { EmployeeRepository } from '../../src/database/repositories/employee.repository';
import { LocationRepository } from '../../src/database/repositories/location.repository';
import { BalanceUnit, RequestStatus } from '../../src/domain/enums';

describe('TimeOffRequestRepository', () => {
  let database: DatabaseService;
  let repository: TimeOffRequestRepository;

  beforeEach(() => {
    process.env.DATABASE_PATH = path.join(
      '/tmp',
      `tor-repo-${Date.now()}-${Math.random()}.db`,
    );
    database = new DatabaseService();
    database.onModuleInit();
    repository = new TimeOffRequestRepository(database);

    const employeeRepo = new EmployeeRepository(database);
    const locationRepo = new LocationRepository(database);
    employeeRepo.create({ id: 'emp_1', hcmEmployeeId: 'emp_1', managerId: 'mgr_1' });
    employeeRepo.create({ id: 'mgr_1', hcmEmployeeId: 'mgr_1', managerId: null });
    locationRepo.create({ id: 'loc_1', hcmLocationId: 'loc_1', name: 'HQ' });
  });

  afterEach(() => {
    database.onModuleDestroy();
    delete process.env.DATABASE_PATH;
  });

  it('creates and finds requests by id and idempotency key', () => {
    const created = repository.create({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 2,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-10',
      endDate: '2026-02-11',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
      managerId: 'mgr_1',
      idempotencyKey: 'key-1',
    });

    expect(repository.findById(created.id)?.status).toBe(
      RequestStatus.PENDING_MANAGER_APPROVAL,
    );
    expect(repository.findByIdempotencyKey('emp_1', 'key-1')?.id).toBe(created.id);
  });

  it('finds pending requests for manager and active requests by location', () => {
    repository.create({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-10',
      endDate: '2026-02-10',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
      managerId: 'mgr_1',
    });

    expect(repository.findByManagerAndStatus('mgr_1', RequestStatus.PENDING_MANAGER_APPROVAL))
      .toHaveLength(1);
    expect(repository.findActiveByEmployeeAndLocation('emp_1', 'loc_1')).toHaveLength(1);
    expect(repository.findAll()).toHaveLength(1);
  });

  it('transitions status only from expected state', () => {
    const created = repository.create({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-10',
      endDate: '2026-02-10',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
    });

    const updated = repository.transitionStatus(
      created.id,
      RequestStatus.PENDING_MANAGER_APPROVAL,
      RequestStatus.REJECTED,
      { failureReason: 'No coverage' },
    );

    expect(updated.status).toBe(RequestStatus.REJECTED);
    expect(updated.failureReason).toBe('No coverage');

    expect(() =>
      repository.transitionStatus(
        created.id,
        RequestStatus.PENDING_MANAGER_APPROVAL,
        RequestStatus.APPROVED,
      ),
    ).toThrow(RequestTransitionConflictError);
  });

  it('transitions status when current status is in allowed set', () => {
    const created = repository.create({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-10',
      endDate: '2026-02-10',
      status: RequestStatus.APPROVED_PENDING_HCM,
    });

    const updated = repository.transitionStatusIfIn(
      created.id,
      [RequestStatus.APPROVED_PENDING_HCM, RequestStatus.FAILED_HCM_SUBMISSION],
      RequestStatus.APPROVED,
      { hcmTransactionId: 'hcm_tx_1' },
    );

    expect(updated.status).toBe(RequestStatus.APPROVED);
    expect(updated.hcmTransactionId).toBe('hcm_tx_1');
  });

  it('uses administrative force update for reconciliation fallback', () => {
    const created = repository.create({
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-10',
      endDate: '2026-02-10',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
    });

    const updated = repository.forceUpdateStatusForSystemReconciliation(
      created.id,
      RequestStatus.RECONCILIATION_REQUIRED,
      { failureReason: 'Batch import conflict' },
    );

    expect(updated.status).toBe(RequestStatus.RECONCILIATION_REQUIRED);
  });
});
