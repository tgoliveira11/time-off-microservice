import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IDEMPOTENCY_REPOSITORY,
  IdempotencyRepositoryPort,
} from '../../database/ports/repository.ports';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @Inject(IDEMPOTENCY_REPOSITORY)
    private readonly idempotencyRepository: IdempotencyRepositoryPort,
  ) {}

  getCached<T extends Record<string, unknown>>(
    scope: string,
    idempotencyKey: string | undefined,
  ): T | null {
    if (!idempotencyKey) {
      return null;
    }
    return this.idempotencyRepository.find(scope, idempotencyKey) as T | null;
  }

  save(
    scope: string,
    idempotencyKey: string | undefined,
    response: Record<string, unknown>,
  ): void {
    if (!idempotencyKey) {
      return;
    }
    this.idempotencyRepository.save(scope, idempotencyKey, response);
    this.logger.log(`Idempotency record saved for ${scope}`);
  }
}
