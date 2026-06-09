import { DatabaseService } from '../../src/database/database.service';
import { EmployeeRepository } from '../../src/database/repositories/employee.repository';
import { LocationRepository } from '../../src/database/repositories/location.repository';
import { BalanceRepository } from '../../src/database/repositories/balance.repository';
import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';
import { EmployeeStatus } from '../../src/domain/enums';

export interface SeedData {
  employeeId: string;
  managerId: string;
  locationId: string;
  hcmEmployeeId: string;
  hcmLocationId: string;
  balance: number;
}

export function seedScenario(
  database: DatabaseService,
  mockHcm: MockHcmService,
  data: Partial<SeedData> = {},
): SeedData {
  database.resetForTests();
  mockHcm.reset();

  const employeeRepo = new EmployeeRepository(database);
  const locationRepo = new LocationRepository(database);
  const balanceRepo = new BalanceRepository(database);

  const managerId = data.managerId ?? 'mgr_001';
  const employeeId = data.employeeId ?? 'emp_123';
  const locationId = data.locationId ?? 'loc_001';
  const hcmEmployeeId = data.hcmEmployeeId ?? 'emp_123';
  const hcmLocationId = data.hcmLocationId ?? 'loc_001';
  const balance = data.balance ?? 10;

  employeeRepo.create({
    id: managerId,
    hcmEmployeeId: managerId,
    managerId: null,
  });
  employeeRepo.create({
    id: employeeId,
    hcmEmployeeId,
    managerId,
    status: EmployeeStatus.ACTIVE,
  });
  locationRepo.create({
    id: locationId,
    hcmLocationId,
    name: 'HQ',
  });
  balanceRepo.create({
    employeeId,
    locationId,
    hcmBalance: balance,
  });

  mockHcm.seed({
    balances: [
      {
        employeeId: hcmEmployeeId,
        locationId: hcmLocationId,
        balance,
        unit: 'DAYS',
        version: 'v10',
      },
    ],
  });

  return {
    employeeId,
    managerId,
    locationId,
    hcmEmployeeId,
    hcmLocationId,
    balance,
  };
}
