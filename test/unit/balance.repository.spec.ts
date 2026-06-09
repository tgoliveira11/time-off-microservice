import { DatabaseService } from '../../src/database/database.service';
import { BalanceRepository, BalanceUpdateConflictError } from '../../src/database/repositories/balance.repository';
import { EmployeeRepository } from '../../src/database/repositories/employee.repository';
import { LocationRepository } from '../../src/database/repositories/location.repository';

describe('BalanceRepository conditional updates', () => {
  let database: DatabaseService;
  let balanceRepository: BalanceRepository;
  let previousDatabasePath: string | undefined;

  beforeEach(() => {
    previousDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = `/tmp/time-off-test-${Date.now()}-${Math.random()}.db`;
    database = new DatabaseService();
    database.onModuleInit();
    database.resetForTests();
    balanceRepository = new BalanceRepository(database);

    const employeeRepo = new EmployeeRepository(database);
    const locationRepo = new LocationRepository(database);
    employeeRepo.create({ id: 'emp_1', hcmEmployeeId: 'emp_1', managerId: null });
    locationRepo.create({ id: 'loc_1', hcmLocationId: 'loc_1', name: 'HQ' });
    balanceRepository.create({ employeeId: 'emp_1', locationId: 'loc_1', hcmBalance: 10 });
  });

  afterEach(() => {
    database.onModuleDestroy();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
  });

  it('reserves balance only when available', () => {
    const updated = balanceRepository.reserveBalanceIfAvailable('emp_1', 'loc_1', 3);
    expect(updated.availableBalance).toBe(7);
    expect(updated.reservedBalance).toBe(3);
  });

  it('throws when balance projection target is missing', () => {
    expect(() =>
      balanceRepository.updateProjection('missing', 'loc_1', { hcmBalance: 1 }),
    ).toThrow('Balance not found');
  });

  it('throws when releasing more reservation than exists', () => {
    expect(() =>
      balanceRepository.reserveBalanceIfAvailable('emp_1', 'loc_1', 11),
    ).toThrow(BalanceUpdateConflictError);
  });

  it('releases reserved balance after rejection', () => {
    balanceRepository.reserveBalanceIfAvailable('emp_1', 'loc_1', 4);
    const released = balanceRepository.releaseReservedBalance('emp_1', 'loc_1', 4);
    expect(released.reservedBalance).toBe(0);
    expect(released.availableBalance).toBe(10);
  });

  it('applies approval consumption and updates projection', () => {
    balanceRepository.reserveBalanceIfAvailable('emp_1', 'loc_1', 2);
    const consumed = balanceRepository.applyApprovalConsumption(
      'emp_1',
      'loc_1',
      2,
      8,
    );
    expect(consumed.hcmBalance).toBe(8);
    expect(consumed.reservedBalance).toBe(0);
    expect(consumed.availableBalance).toBe(8);
  });

  it('blocks reservation when reconciliation is required', () => {
    balanceRepository.updateProjection('emp_1', 'loc_1', {
      reconciliationRequired: true,
    });
    expect(() =>
      balanceRepository.reserveBalanceIfAvailable('emp_1', 'loc_1', 1),
    ).toThrow(BalanceUpdateConflictError);
  });

  it('throws when approval consumption exceeds reserved amount', () => {
    expect(() =>
      balanceRepository.applyApprovalConsumption('emp_1', 'loc_1', 2, 8),
    ).toThrow(BalanceUpdateConflictError);
  });
});
