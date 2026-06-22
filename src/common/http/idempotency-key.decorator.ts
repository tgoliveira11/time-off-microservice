import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const raw =
      request.header('idempotency-key') ??
      request.header('Idempotency-Key') ??
      undefined;
    const trimmed = raw?.trim();
    return trimmed || undefined;
  },
);
