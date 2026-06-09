import { MemoryStore } from '../../src/database/memory/memory-store';
import {
  MemoryAuditLogRepository,
  MemoryBalanceRepository,
  MemoryEmployeeRepository,
  MemoryHcmSyncJobRepository,
  MemoryIdempotencyRepository,
  MemoryLocationRepository,
  MemoryOutboxRepository,
  MemoryStatusHistoryRepository,
  MemoryTimeOffRequestRepository,
} from '../../src/database/memory/memory-repositories';
import { BalanceUnit, HcmSyncJobType, RequestStatus, ActorType } from '../../src/domain/enums';
import {
  BalanceUpdateConflictError,
  RequestTransitionConflictError,
} from '../../src/database/ports/repository.ports';

describe('Memory repositories', () => {
  let store: MemoryStore;
  let employees: MemoryEmployeeRepository;
  let locations: MemoryLocationRepository;
  let balances: MemoryBalanceRepository;
  let requests: MemoryTimeOffRequestRepository;

  beforeEach(() => {
    store = new MemoryStore();
    employees = new MemoryEmployeeRepository(store);
    locations = new MemoryLocationRepository(store);
    balances = new MemoryBalanceRepository(store);
    requests = new MemoryTimeOffRequestRepository(store);

    employees.create({ id: 'mgr_001', hcmEmployeeId: 'mgr_001' });
    employees.create({
      id: 'emp_123',
      hcmEmployeeId: 'emp_123',
      managerId: 'mgr_001',
    });
    locations.create({ id: 'loc_001', hcmLocationId: 'loc_001', name: 'HQ' });
    balances.create({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      hcmBalance: 10,
      unit: BalanceUnit.DAYS,
    });
  });

  it('upserts employees and locations by HCM id', () => {
    employees.upsert({ hcmEmployeeId: 'emp_123', managerId: 'mgr_001' });
    locations.upsert({ hcmLocationId: 'loc_001', name: 'Updated HQ' });
    expect(locations.findByHcmId('loc_001')?.name).toBe('Updated HQ');
  });

  it('enforces conditional balance reservation rules', () => {
    balances.updateProjection('emp_123', 'loc_001', {
      reconciliationRequired: true,
    });
    expect(() =>
      balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 1),
    ).toThrow(BalanceUpdateConflictError);

    balances.updateProjection('emp_123', 'loc_001', {
      reconciliationRequired: false,
      reservedBalance: 0,
      availableBalance: 10,
    });
    const updated = balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 3);
    expect(updated.reservedBalance).toBe(3);
    expect(updated.availableBalance).toBe(7);
  });

  it('applies approval consumption and release paths', () => {
    balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 4);
    const approved = balances.applyApprovalConsumption(
      'emp_123',
      'loc_001',
      4,
      6,
    );
    expect(approved.hcmBalance).toBe(6);
    expect(approved.reservedBalance).toBe(0);

    balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 2);
    const released = balances.releaseReservedBalance('emp_123', 'loc_001', 2);
    expect(released.reservedBalance).toBe(0);
  });

  it('enforces conditional request transitions', () => {
    const request = requests.create({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
      managerId: 'mgr_001',
    });

    requests.transitionStatus(
      request.id,
      RequestStatus.PENDING_MANAGER_APPROVAL,
      RequestStatus.APPROVED_PENDING_HCM,
    );

    expect(() =>
      requests.transitionStatus(
        request.id,
        RequestStatus.PENDING_MANAGER_APPROVAL,
        RequestStatus.REJECTED,
      ),
    ).toThrow(RequestTransitionConflictError);

    requests.forceUpdateStatusForSystemReconciliation(
      request.id,
      RequestStatus.RECONCILIATION_REQUIRED,
      { failureReason: 'system' },
    );
    expect(requests.findById(request.id)?.status).toBe(
      RequestStatus.RECONCILIATION_REQUIRED,
    );
  });

  it('supports store snapshot and restore', () => {
    const snapshot = store.snapshot();
    balances.reserveBalanceIfAvailable('emp_123', 'loc_001', 1);
    store.restore(snapshot);
    const balance = balances.findByEmployeeAndLocation('emp_123', 'loc_001');
    expect(balance?.reservedBalance).toBe(0);
  });

  it('covers auxiliary memory repositories', () => {
    const history = new MemoryStatusHistoryRepository(store);
    const audit = new MemoryAuditLogRepository(store);
    const syncJobs = new MemoryHcmSyncJobRepository(store);
    const idempotency = new MemoryIdempotencyRepository(store);
    const outbox = new MemoryOutboxRepository(store);

    const request = requests.create({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      amount: 1,
      unit: BalanceUnit.DAYS,
      startDate: '2026-02-01',
      endDate: '2026-02-01',
      status: RequestStatus.PENDING_MANAGER_APPROVAL,
    });

    history.create({
      requestId: request.id,
      fromStatus: null,
      toStatus: RequestStatus.PENDING_MANAGER_APPROVAL,
      actorType: ActorType.EMPLOYEE,
    });
    expect(history.findByRequestId(request.id)).toHaveLength(1);

    audit.create({
      entityType: 'TIME_OFF_REQUEST',
      entityId: request.id,
      action: 'TEST',
      actorType: ActorType.SYSTEM,
    });
    expect(audit.findByEntity('TIME_OFF_REQUEST', request.id)).toHaveLength(1);

    const job = syncJobs.create(HcmSyncJobType.BATCH_IMPORT);
    syncJobs.complete(job.id, { ok: true });
    expect(syncJobs.findById(job.id)?.status).toBe('COMPLETED');
    const failed = syncJobs.create(HcmSyncJobType.RECONCILIATION);
    syncJobs.fail(failed.id, 'failed');
    expect(syncJobs.findById(failed.id)?.errorMessage).toBe('failed');

    idempotency.save('scope', 'key', { ok: true });
    expect(idempotency.find('scope', 'key')).toEqual({ ok: true });
    idempotency.save('scope', 'key', { ok: false });

    outbox.create({
      aggregateType: 'TIME_OFF_REQUEST',
      aggregateId: request.id,
      eventType: 'TEST',
      payload: { id: request.id },
    });

    expect(requests.findByManagerAndStatus('mgr_001', RequestStatus.PENDING_MANAGER_APPROVAL))
      .toHaveLength(1);
    expect(requests.findActiveByEmployeeAndLocation('emp_123', 'loc_001')).toHaveLength(1);
    expect(balances.findById(balances.findByEmployee('emp_123')[0].id)).toBeTruthy();
    expect(employees.findDirectReports('mgr_001')).toHaveLength(1);
    expect(employees.findById('missing')).toBeNull();
    expect(locations.findById('missing')).toBeNull();
  });

  it('throws when balance projection target is missing', () => {
    expect(() =>
      balances.updateProjection('missing', 'loc_001', { hcmBalance: 1 }),
    ).toThrow(BalanceUpdateConflictError);
    expect(() =>
      balances.releaseReservedBalance('emp_123', 'loc_001', 99),
    ).toThrow(BalanceUpdateConflictError);
    expect(() =>
      balances.applyApprovalConsumption('emp_123', 'loc_001', 99, 1),
    ).toThrow(BalanceUpdateConflictError);
    store.resetForTests();
    expect(store.employees.size).toBe(0);
  });
});
