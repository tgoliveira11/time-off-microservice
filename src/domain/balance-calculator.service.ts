export class InsufficientBalanceError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Insufficient balance: requested ${requested}, available ${available}`,
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class BalanceCalculatorService {
  calculateAvailable(hcmBalance: number, reservedBalance: number): number {
    return Math.max(0, hcmBalance - reservedBalance);
  }

  assertSufficientBalance(available: number, requested: number): void {
    if (requested <= 0) {
      throw new Error('Requested amount must be positive');
    }
    if (requested > available) {
      throw new InsufficientBalanceError(available, requested);
    }
  }

  recalculateAfterReservation(
    hcmBalance: number,
    reservedBalance: number,
  ): { reservedBalance: number; availableBalance: number } {
    const availableBalance = this.calculateAvailable(hcmBalance, reservedBalance);
    return { reservedBalance, availableBalance };
  }

  recalculateAfterHcmUpdate(
    newHcmBalance: number,
    reservedBalance: number,
  ): {
    hcmBalance: number;
    reservedBalance: number;
    availableBalance: number;
    reconciliationRequired: boolean;
  } {
    const reconciliationRequired = reservedBalance > newHcmBalance;
    const availableBalance = reconciliationRequired
      ? 0
      : this.calculateAvailable(newHcmBalance, reservedBalance);

    return {
      hcmBalance: newHcmBalance,
      reservedBalance,
      availableBalance,
      reconciliationRequired,
    };
  }

  applyApprovalConsumption(
    hcmBalance: number,
    reservedBalance: number,
    amount: number,
  ): {
    hcmBalance: number;
    reservedBalance: number;
    availableBalance: number;
  } {
    const newHcmBalance = hcmBalance - amount;
    const newReserved = Math.max(0, reservedBalance - amount);
    return {
      hcmBalance: newHcmBalance,
      reservedBalance: newReserved,
      availableBalance: this.calculateAvailable(newHcmBalance, newReserved),
    };
  }
}
