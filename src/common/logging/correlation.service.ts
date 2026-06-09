import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class CorrelationService {
  private readonly storage = new AsyncLocalStorage<string>();
  private readonly logger = new Logger(CorrelationService.name);

  run<T>(correlationId: string, fn: () => T): T {
    return this.storage.run(correlationId, fn);
  }

  getId(): string {
    return this.storage.getStore() ?? uuidv4();
  }

  log(message: string, context?: Record<string, unknown>): void {
    this.logger.log({ correlationId: this.getId(), message, ...context });
  }
}
