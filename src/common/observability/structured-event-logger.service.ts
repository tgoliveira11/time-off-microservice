import { Injectable, Logger } from '@nestjs/common';
import { CorrelationService } from '../logging/correlation.service';

export type StructuredLogLevel = 'log' | 'warn' | 'error';

export interface StructuredLogPayload {
  event: string;
  level?: StructuredLogLevel;
  requestId?: string;
  employeeId?: string;
  locationId?: string;
  hcmTransactionId?: string;
  errorType?: string;
  reason?: string;
  [key: string]: unknown;
}

@Injectable()
export class StructuredEventLogger {
  private readonly logger = new Logger('StructuredEvent');

  constructor(private readonly correlationService: CorrelationService) {}

  emit(payload: StructuredLogPayload): void {
    const level = payload.level ?? 'log';
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event: payload.event,
      correlationId: this.correlationService.getId(),
      requestId: payload.requestId,
      employeeId: payload.employeeId,
      locationId: payload.locationId,
      hcmTransactionId: payload.hcmTransactionId,
      errorType: payload.errorType,
      reason: payload.reason,
    };

    if (level === 'error') {
      this.logger.error(entry);
      return;
    }
    if (level === 'warn') {
      this.logger.warn(entry);
      return;
    }
    this.logger.log(entry);
  }
}
