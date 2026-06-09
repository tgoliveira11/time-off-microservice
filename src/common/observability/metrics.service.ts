import { Injectable } from '@nestjs/common';

export interface AppMetricsSnapshot {
  requestsCreatedTotal: number;
  requestsApprovedTotal: number;
  requestsRejectedTotal: number;
  requestsCancelledTotal: number;
  hcmLookupSuccessTotal: number;
  hcmLookupFailureTotal: number;
  hcmSubmissionSuccessTotal: number;
  hcmSubmissionFailureTotal: number;
  hcmTimeoutTotal: number;
  hcmDuplicateSubmissionTotal: number;
  batchImportSuccessTotal: number;
  batchImportFailureTotal: number;
  reconciliationRunsTotal: number;
  reconciliationIssuesTotal: number;
  idempotencyReplayTotal: number;
  idempotencyMismatchTotal: number;
}

@Injectable()
export class MetricsService {
  private metrics: AppMetricsSnapshot = this.createEmptyMetrics();

  private createEmptyMetrics(): AppMetricsSnapshot {
    return {
      requestsCreatedTotal: 0,
      requestsApprovedTotal: 0,
      requestsRejectedTotal: 0,
      requestsCancelledTotal: 0,
      hcmLookupSuccessTotal: 0,
      hcmLookupFailureTotal: 0,
      hcmSubmissionSuccessTotal: 0,
      hcmSubmissionFailureTotal: 0,
      hcmTimeoutTotal: 0,
      hcmDuplicateSubmissionTotal: 0,
      batchImportSuccessTotal: 0,
      batchImportFailureTotal: 0,
      reconciliationRunsTotal: 0,
      reconciliationIssuesTotal: 0,
      idempotencyReplayTotal: 0,
      idempotencyMismatchTotal: 0,
    };
  }

  snapshot(): AppMetricsSnapshot {
    return { ...this.metrics };
  }

  resetForTests(): void {
    this.metrics = this.createEmptyMetrics();
  }

  increment(metric: keyof AppMetricsSnapshot, amount = 1): void {
    this.metrics[metric] += amount;
  }
}
