import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';

export function ApiIdempotencyKeyHeader(
  description = 'Idempotency key for safe retries. The Idempotency-Key header takes precedence over requestBody.idempotencyKey when both are sent.',
) {
  return applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description,
      schema: { type: 'string', example: 'sqlite-create-001' },
    }),
    ApiSecurity('Idempotency-Key'),
  );
}
