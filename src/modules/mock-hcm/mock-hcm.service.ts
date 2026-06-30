import { Injectable, HttpException } from '@nestjs/common';
import { throwHcmError } from './mock-hcm.errors';
import { DEFAULT_MOCK_HCM_SEED } from './mock-hcm-defaults';

export interface MockBalance {
  employeeId: string;
  locationId: string;
  balance: number;
  unit: string;
  version: string;
}

interface MockSubmission {
  externalRequestId: string;
  transactionId: string;
  amount: number;
  employeeId: string;
  locationId: string;
}

@Injectable()
export class MockHcmService {
  private balances = new Map<string, MockBalance>();
  private submissions = new Map<string, MockSubmission>();
  private scenarios = new Map<string, string>();

  reset(): void {
    this.balances.clear();
    this.submissions.clear();
    this.scenarios.clear();
  }

  seed(data: Record<string, unknown> = {}): void {
    const balances = Array.isArray(data.balances) ? data.balances : [];
    const payload =
      balances.length > 0
        ? data
        : { ...data, balances: DEFAULT_MOCK_HCM_SEED.balances };

    if (Array.isArray(payload.balances)) {
      for (const item of payload.balances as MockBalance[]) {
        this.setBalance(item);
      }
    }
    if (payload.scenarios && typeof payload.scenarios === 'object') {
      for (const [key, value] of Object.entries(
        payload.scenarios as Record<string, string>,
      )) {
        this.scenarios.set(key, value);
      }
    }
  }

  setBalance(balance: MockBalance): void {
    this.balances.set(this.key(balance.employeeId, balance.locationId), balance);
  }

  setScenario(key: string, scenario: string): void {
    this.scenarios.set(key, scenario);
  }

  getBalance(
    employeeId: string,
    locationId: string,
    scenario?: string,
  ): MockBalance {
    const activeScenario =
      scenario ?? this.scenarios.get(this.key(employeeId, locationId));

    if (activeScenario === 'invalid_dimension') {
      throwHcmError(404, 'Invalid employee/location combination');
    }
    if (activeScenario === 'dimension_conflict') {
      throwHcmError(409, 'Dimension conflict');
    }
    if (activeScenario === 'transient_error') {
      throwHcmError(500, 'Transient HCM error');
    }
    if (activeScenario === 'timeout') {
      return new Promise(() => {}) as never;
    }

    const balance = this.balances.get(this.key(employeeId, locationId));
    if (!balance) {
      throwHcmError(404, 'Invalid employee/location combination');
    }
    return { ...balance };
  }

  submitTimeOff(
    body: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: string;
      externalRequestId: string;
    },
    scenario?: string,
  ) {
    const activeScenario =
      scenario ??
      this.scenarios.get(`submit:${body.externalRequestId}`) ??
      this.scenarios.get(this.key(body.employeeId, body.locationId));

    if (activeScenario === 'invalid_dimension') {
      throwHcmError(400, 'Invalid dimensions');
    }

    const duplicate = this.submissions.get(body.externalRequestId);
    if (duplicate) {
      const txId =
        activeScenario === 'duplicate_foreign'
          ? 'hcm_tx_foreign_request'
          : duplicate.transactionId;
      throw new HttpException(
        {
          message: 'Duplicate external request ID',
          transactionId: txId,
        },
        409,
      );
    }

    if (activeScenario === 'transient_error') {
      throwHcmError(500, 'Transient failure');
    }
    if (activeScenario === 'timeout_after_accept') {
      const existing = this.submissions.get(body.externalRequestId);
      if (!existing) {
        this.acceptSubmission(body);
        this.scenarios.delete(`submit:${body.externalRequestId}`);
        return new Promise(() => {}) as never;
      }

      throw new HttpException(
        {
          message: 'Duplicate external request ID',
          transactionId: existing.transactionId,
        },
        409,
      );
    }

    if (activeScenario === 'submit_timeout') {
      return new Promise(() => {}) as never;
    }

    const balance = this.balances.get(
      this.key(body.employeeId, body.locationId),
    );
    if (!balance) {
      throwHcmError(400, 'Invalid dimensions');
    }
    if (balance.balance < body.amount) {
      throwHcmError(409, 'Insufficient balance');
    }

    return this.acceptSubmission(body);
  }

  getBatchBalances(scenario?: string): { balances: unknown[] } {
    const activeScenario =
      scenario ?? this.scenarios.get('batch');

    if (activeScenario === 'timeout') {
      return new Promise(() => {}) as never;
    }
    if (activeScenario === 'corrupted') {
      throwHcmError(500, 'Corrupted batch payload');
    }

    if (activeScenario === 'partial') {
      return { balances: Array.from(this.balances.values()).slice(0, 1) };
    }

    if (activeScenario === 'malformed') {
      return {
        balances: [
          { employeeId: 'bad', locationId: 'loc', balance: 'NaN', unit: 'DAYS' },
        ],
      };
    }

    if (activeScenario === 'duplicate_rows') {
      const row = Array.from(this.balances.values())[0];
      return { balances: row ? [row, { ...row }] : [] };
    }

    if (activeScenario === 'negative') {
      const row = Array.from(this.balances.values())[0];
      return {
        balances: row ? [{ ...row, balance: -1 }] : [],
      };
    }

    if (activeScenario === 'missing_employee') {
      return {
        balances: [{ locationId: 'loc_001', balance: 5, unit: 'DAYS', version: 'v1' }],
      };
    }

    return { balances: Array.from(this.balances.values()) };
  }

  isHealthy(): boolean {
    return true;
  }

  private acceptSubmission(body: {
    employeeId: string;
    locationId: string;
    amount: number;
    externalRequestId: string;
  }) {
    const balance = this.balances.get(
      this.key(body.employeeId, body.locationId),
    )!;
    balance.balance -= body.amount;
    balance.version = `v${Number.parseInt(balance.version.replace('v', ''), 10) + 1}`;

    const transactionId = `hcm_tx_${body.externalRequestId}`;
    this.submissions.set(body.externalRequestId, {
      externalRequestId: body.externalRequestId,
      transactionId,
      amount: body.amount,
      employeeId: body.employeeId,
      locationId: body.locationId,
    });

    return {
      transactionId,
      status: 'ACCEPTED',
      remainingBalance: balance.balance,
    };
  }

  getSubmission(externalRequestId: string): MockSubmission | undefined {
    return this.submissions.get(externalRequestId);
  }

  private key(employeeId: string, locationId: string): string {
    return `${employeeId}:${locationId}`;
  }
}
