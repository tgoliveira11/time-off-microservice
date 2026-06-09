import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepositoryPort,
} from '../../database/ports/repository.ports';
import { ActorType } from '../../domain/enums';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepositoryPort,
  ) {}

  log(data: {
    entityType: string;
    entityId: string;
    action: string;
    actorType: ActorType;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }): void {
    this.auditLogRepository.create(data);
    this.logger.log(
      `${data.action} on ${data.entityType}:${data.entityId} by ${data.actorType}:${data.actorId ?? 'system'}`,
    );
  }
}
