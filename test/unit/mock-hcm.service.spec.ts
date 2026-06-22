import { MockHcmService } from '../../src/modules/mock-hcm/mock-hcm.service';

describe('MockHcmService', () => {
  let service: MockHcmService;

  beforeEach(() => {
    service = new MockHcmService();
  });

  it('seeds default demo balance when seed payload is empty', () => {
    service.seed({});

    expect(
      service.getBalance('emp_123', 'loc_001'),
    ).toMatchObject({
      employeeId: 'emp_123',
      locationId: 'loc_001',
      balance: 10,
      unit: 'DAYS',
    });
  });

  it('clears balances after reset until seeded again', () => {
    service.seed({});
    service.reset();

    expect(() => service.getBalance('emp_123', 'loc_001')).toThrow(
      'Invalid employee/location combination',
    );
  });
});
