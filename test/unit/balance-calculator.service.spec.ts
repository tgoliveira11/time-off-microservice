import {
  BalanceCalculatorService,
  InsufficientBalanceError,
} from '../../src/domain/balance-calculator.service';

describe('BalanceCalculatorService', () => {
  const service = new BalanceCalculatorService();

  it('calculates available balance', () => {
    expect(service.calculateAvailable(10, 2)).toBe(8);
  });

  it('fails when request exceeds available balance', () => {
    expect(() => service.assertSufficientBalance(1, 2)).toThrow(
      InsufficientBalanceError,
    );
  });

  it('flags reconciliation when reserved exceeds hcm balance', () => {
    const result = service.recalculateAfterHcmUpdate(5, 8);
    expect(result.reconciliationRequired).toBe(true);
    expect(result.availableBalance).toBe(0);
  });

  it('applies approval consumption', () => {
    const result = service.applyApprovalConsumption(10, 2, 2);
    expect(result.hcmBalance).toBe(8);
    expect(result.reservedBalance).toBe(0);
    expect(result.availableBalance).toBe(8);
  });
});
