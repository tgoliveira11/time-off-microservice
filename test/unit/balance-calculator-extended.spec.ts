import { BalanceCalculatorService } from '../../src/domain/balance-calculator.service';

describe('BalanceCalculatorService extended', () => {
  const service = new BalanceCalculatorService();

  it('rejects non-positive requested amount', () => {
    expect(() => service.assertSufficientBalance(5, 0)).toThrow(
      'Requested amount must be positive',
    );
  });

  it('recalculates reservation projection', () => {
    const result = service.recalculateAfterReservation(10, 3);
    expect(result.availableBalance).toBe(7);
  });
});
