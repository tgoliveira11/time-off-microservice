import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { BalanceService } from '../../src/modules/balances/balance.service';
import { BalanceRepository } from '../../src/database/repositories/balance.repository';
import { EmployeeRepository } from '../../src/database/repositories/employee.repository';
import { LocationRepository } from '../../src/database/repositories/location.repository';
import { HcmClientService } from '../../src/modules/hcm/hcm-client.service';
import { BalanceCalculatorService } from '../../src/domain/balance-calculator.service';
import { AuditService } from '../../src/common/audit/audit.service';
import { HcmClientError, HcmErrorType } from '../../src/domain/hcm-error-mapper.service';

describe('BalanceService', () => {
  const balanceRepository = {
    findByEmployee: jest.fn(),
    findByEmployeeAndLocation: jest.fn(),
    updateProjection: jest.fn(),
    create: jest.fn(),
  };
  const employeeRepository = {
    findById: jest.fn(),
  };
  const locationRepository = {
    findById: jest.fn(),
  };
  const hcmClientService = {
    getRealtimeBalance: jest.fn(),
  };
  const auditService = {
    log: jest.fn(),
  };

  const service = new BalanceService(
    balanceRepository as unknown as BalanceRepository,
    employeeRepository as unknown as EmployeeRepository,
    locationRepository as unknown as LocationRepository,
    hcmClientService as unknown as HcmClientService,
    new BalanceCalculatorService(),
    auditService as unknown as AuditService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    employeeRepository.findById.mockReturnValue({
      id: 'emp_1',
      hcmEmployeeId: 'hcm_emp_1',
    });
    locationRepository.findById.mockReturnValue({
      id: 'loc_1',
      hcmLocationId: 'hcm_loc_1',
    });
    balanceRepository.findByEmployeeAndLocation.mockReturnValue({
      id: 'bal_1',
      reservedBalance: 2,
      hcmBalance: 10,
      availableBalance: 8,
      lastHcmSyncAt: null,
    });
    balanceRepository.updateProjection.mockReturnValue({
      id: 'bal_1',
      hcmBalance: 12,
      reservedBalance: 2,
      availableBalance: 10,
      lastHcmSyncAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns employee balances', () => {
    balanceRepository.findByEmployee.mockReturnValue([
      {
        locationId: 'loc_1',
        hcmBalance: 10,
        reservedBalance: 2,
        availableBalance: 8,
        unit: 'DAYS',
        lastHcmSyncAt: null,
        reconciliationRequired: false,
      },
    ]);

    const result = service.getEmployeeBalances('emp_1');
    expect(result.balances).toHaveLength(1);
  });

  it('throws when employee is missing', () => {
    employeeRepository.findById.mockReturnValue(null);
    expect(() => service.getEmployeeBalances('missing')).toThrow(NotFoundException);
  });

  it('refreshes balance from HCM', async () => {
    hcmClientService.getRealtimeBalance.mockResolvedValue({
      balance: 12,
      unit: 'DAYS',
      version: 'v2',
    });

    const result = await service.refreshBalance('emp_1', 'loc_1');
    expect(result.hcmBalance).toBe(12);
    expect(result.source).toBe('HCM_REALTIME');
    expect(auditService.log).toHaveBeenCalled();
  });

  it('throws not found when employee or location is missing on refresh', async () => {
    employeeRepository.findById.mockReturnValue(null);
    await expect(service.refreshBalance('emp_1', 'loc_1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks reconciliation required when HCM dimensions are invalid', async () => {
    hcmClientService.getRealtimeBalance.mockRejectedValue(
      new HcmClientError(HcmErrorType.NOT_FOUND, 'missing', 404, false),
    );

    await expect(service.refreshBalance('emp_1', 'loc_1')).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(balanceRepository.updateProjection).toHaveBeenCalledWith(
      'emp_1',
      'loc_1',
      expect.objectContaining({ reconciliationRequired: true, availableBalance: 0 }),
    );
  });

  it('throws service unavailable for retryable HCM failures', async () => {
    hcmClientService.getRealtimeBalance.mockRejectedValue(
      new HcmClientError(HcmErrorType.TIMEOUT, 'timeout', undefined, true),
    );

    await expect(service.refreshBalance('emp_1', 'loc_1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('creates balance projection when none exists locally', async () => {
    balanceRepository.findByEmployeeAndLocation.mockReturnValue(null);
    balanceRepository.create.mockReturnValue({
      id: 'bal_new',
      hcmBalance: 15,
      reservedBalance: 0,
      availableBalance: 15,
      lastHcmSyncAt: '2026-01-01T00:00:00.000Z',
    });
    hcmClientService.getRealtimeBalance.mockResolvedValue({
      balance: 15,
      unit: 'DAYS',
      version: 'v3',
    });

    const result = await service.refreshBalance('emp_1', 'loc_1');
    expect(result.hcmBalance).toBe(15);
    expect(balanceRepository.create).toHaveBeenCalled();
  });
});
