export enum HcmErrorType {
  INVALID_DIMENSIONS = 'INVALID_DIMENSIONS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  DUPLICATE_SUBMISSION = 'DUPLICATE_SUBMISSION',
  TRANSIENT = 'TRANSIENT',
  TIMEOUT = 'TIMEOUT',
  MALFORMED = 'MALFORMED',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

export class HcmClientError extends Error {
  constructor(
    public readonly type: HcmErrorType,
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
    public readonly transactionId?: string,
  ) {
    super(message);
    this.name = 'HcmClientError';
  }
}

export class HcmErrorMapperService {
  mapHttpStatus(status: number, body?: Record<string, unknown>): HcmClientError {
    const nested =
      body?.message && typeof body.message === 'object'
        ? (body.message as Record<string, unknown>)
        : undefined;
    const message =
      (typeof body?.message === 'string'
        ? body.message
        : (nested?.message as string)) ??
      (body?.error as string) ??
      'HCM error';
    const transactionId =
      (body?.transactionId as string | undefined) ??
      (nested?.transactionId as string | undefined);

    switch (status) {
      case 400:
        return new HcmClientError(
          HcmErrorType.INVALID_DIMENSIONS,
          message,
          status,
          false,
        );
      case 404:
        return new HcmClientError(
          HcmErrorType.NOT_FOUND,
          message,
          status,
          false,
        );
      case 409:
        if (message.toLowerCase().includes('duplicate')) {
          return new HcmClientError(
            HcmErrorType.DUPLICATE_SUBMISSION,
            message,
            status,
            false,
            transactionId,
          );
        }
        return new HcmClientError(
          HcmErrorType.INSUFFICIENT_BALANCE,
          message,
          status,
          false,
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new HcmClientError(
          HcmErrorType.TRANSIENT,
          message,
          status,
          true,
        );
      default:
        return new HcmClientError(
          HcmErrorType.UNKNOWN,
          message,
          status,
          false,
        );
    }
  }

  mapTimeout(): HcmClientError {
    // Retryable=true signals business-level retry/reconciliation paths, not
    // immediate inline retry in executeWithRetry (see HcmClientService).
    return new HcmClientError(
      HcmErrorType.TIMEOUT,
      'HCM request timed out',
      undefined,
      true,
    );
  }

  isRetryable(error: HcmClientError): boolean {
    return error.retryable;
  }
}

export class RetryClassifierService {
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 100;

  isRetryable(error: HcmClientError): boolean {
    return error.retryable;
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }

  getDelayMs(attempt: number): number {
    return this.baseDelayMs * Math.pow(2, attempt);
  }
}
