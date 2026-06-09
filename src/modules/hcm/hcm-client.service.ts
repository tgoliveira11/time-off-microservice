import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  HcmClient,
  HcmBatchBalanceResponse,
  HcmBalanceResponse,
  HcmSubmissionRequest,
  HcmSubmissionResponse,
  HCM_CLIENT,
} from './hcm-client.interface';
import {
  HcmClientError,
  HcmErrorMapperService,
  HcmErrorType,
  RetryClassifierService,
} from '../../domain/hcm-error-mapper.service';
import { MetricsService } from '../../common/observability/metrics.service';
import { StructuredEventLogger } from '../../common/observability/structured-event-logger.service';

@Injectable()
export class HcmClientService {
  private readonly logger = new Logger(HcmClientService.name);

  constructor(
    @Inject(HCM_CLIENT) private readonly hcmClient: HcmClient,
    private readonly errorMapper: HcmErrorMapperService,
    private readonly retryClassifier: RetryClassifierService,
    private readonly metricsService: MetricsService,
    private readonly eventLogger: StructuredEventLogger,
  ) {}

  async getRealtimeBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse> {
    this.eventLogger.emit({
      event: 'hcm.lookup.started',
      employeeId,
      locationId,
    });
    try {
      const result = await this.executeWithRetry(() =>
        this.hcmClient.getRealtimeBalance(employeeId, locationId),
      );
      this.metricsService.increment('hcmLookupSuccessTotal');
      this.eventLogger.emit({
        event: 'hcm.lookup.succeeded',
        employeeId,
        locationId,
      });
      return result;
    } catch (error) {
      this.trackHcmFailure('hcm.lookup.failed', error, {
        employeeId,
        locationId,
      });
      throw error;
    }
  }

  async submitTimeOff(
    request: HcmSubmissionRequest,
  ): Promise<HcmSubmissionResponse> {
    this.eventLogger.emit({
      event: 'hcm.submission.started',
      employeeId: request.employeeId,
      locationId: request.locationId,
      requestId: request.externalRequestId,
    });
    try {
      const result = await this.executeWithRetry(() =>
        this.hcmClient.submitTimeOff(request),
      );
      this.metricsService.increment('hcmSubmissionSuccessTotal');
      this.eventLogger.emit({
        event: 'hcm.submission.succeeded',
        employeeId: request.employeeId,
        locationId: request.locationId,
        requestId: request.externalRequestId,
        hcmTransactionId: result.transactionId,
      });
      return result;
    } catch (error) {
      this.trackHcmFailure('hcm.submission.failed', error, {
        employeeId: request.employeeId,
        locationId: request.locationId,
        requestId: request.externalRequestId,
      });
      throw error;
    }
  }

  async getBatchBalances(): Promise<HcmBatchBalanceResponse> {
    this.eventLogger.emit({ event: 'hcm.batch.started' });
    try {
      const result = await this.executeWithRetry(() =>
        this.hcmClient.getBatchBalances(),
      );
      this.eventLogger.emit({ event: 'hcm.batch.succeeded' });
      return result;
    } catch (error) {
      this.trackHcmFailure('hcm.batch.failed', error);
      throw error;
    }
  }

  private trackHcmFailure(
    event: string,
    error: unknown,
    context?: {
      employeeId?: string;
      locationId?: string;
      requestId?: string;
    },
  ): void {
    const mapped =
      error instanceof HcmClientError
        ? error
        : this.errorMapper.mapHttpStatus(500, {
            message: (error as Error).message,
          });

    if (event.includes('lookup')) {
      this.metricsService.increment('hcmLookupFailureTotal');
    } else if (event.includes('submission')) {
      this.metricsService.increment('hcmSubmissionFailureTotal');
    }

    if (mapped.type === HcmErrorType.TIMEOUT) {
      this.metricsService.increment('hcmTimeoutTotal');
      this.eventLogger.emit({
        event: 'hcm.timeout.detected',
        level: 'warn',
        errorType: mapped.type,
        reason: mapped.message,
        ...context,
      });
    }

    if (mapped.type === HcmErrorType.DUPLICATE_SUBMISSION) {
      this.metricsService.increment('hcmDuplicateSubmissionTotal');
      this.eventLogger.emit({
        event: 'hcm.duplicate_submission.detected',
        level: 'warn',
        errorType: mapped.type,
        reason: mapped.message,
        ...context,
      });
    }

    this.eventLogger.emit({
      event,
      level: 'error',
      errorType: mapped.type,
      reason: mapped.message,
      ...context,
    });
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    // Inline auto-retry is limited to TRANSIENT HCM failures (5xx/network).
    // TIMEOUT is marked retryable for classification and business-level retry,
    // but is intentionally NOT retried here: HCM may have accepted a submission
    // before the client timed out. Re-submitting inline could double-consume.
    // Timeout-after-accept is handled via stable externalRequestId, duplicate
    // detection, explicit approve retries, and reconciliation instead.
    let lastError: HcmClientError | undefined;

    for (let attempt = 0; attempt <= this.retryClassifier.getMaxRetries(); attempt++) {
      try {
        return await fn();
      } catch (error) {
        const mapped =
          error instanceof HcmClientError
            ? error
            : this.errorMapper.mapHttpStatus(500, {
                message: (error as Error).message,
              });

        lastError = mapped;

        if (
          !this.retryClassifier.isRetryable(mapped) ||
          mapped.type !== HcmErrorType.TRANSIENT
        ) {
          throw mapped;
        }

        if (attempt < this.retryClassifier.getMaxRetries()) {
          const delay = this.retryClassifier.getDelayMs(attempt);
          this.logger.warn(
            `HCM retry attempt ${attempt + 1} after ${delay}ms: ${mapped.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}
