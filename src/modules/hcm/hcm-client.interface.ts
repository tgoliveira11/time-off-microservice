export interface HcmBalanceResponse {
  employeeId: string;
  locationId: string;
  balance: number;
  unit: string;
  version: string;
}

export interface HcmBatchBalanceResponse {
  balances: HcmBalanceResponse[];
}

export interface HcmSubmissionRequest {
  employeeId: string;
  locationId: string;
  amount: number;
  unit: string;
  externalRequestId: string;
}

export interface HcmSubmissionResponse {
  transactionId: string;
  status: string;
  remainingBalance: number;
}

export interface HcmClient {
  getRealtimeBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse>;
  submitTimeOff(request: HcmSubmissionRequest): Promise<HcmSubmissionResponse>;
  getBatchBalances(): Promise<HcmBatchBalanceResponse>;
}

export const HCM_CLIENT = Symbol('HCM_CLIENT');
