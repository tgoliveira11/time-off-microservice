import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums';

export const SWAGGER_PATH = 'api';

const AUTH_DESCRIPTION = `
## Authentication (mock)

Use **Authorize** or the per-request header parameters:

| Header | Example | Notes |
|--------|---------|-------|
| \`X-User-Id\` | \`emp_123\` | Any user id |
| \`X-User-Role\` | \`EMPLOYEE\` | One of: ${Object.values(UserRole).join(', ')} |

Do **not** put the user id in \`X-User-Role\`.
`.trim();

export function buildSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Time-Off Microservice')
    .setDescription(`ExampleHR Time-Off REST API\n\n${AUTH_DESCRIPTION}`)
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-User-Id',
        in: 'header',
        description: 'User id. Example: emp_123',
      },
      'X-User-Id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-User-Role',
        in: 'header',
        description: `Role. Example: EMPLOYEE (not the user id). Allowed: ${Object.values(UserRole).join(', ')}`,
      },
      'X-User-Role',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description: 'Optional idempotency key for write operations (safe retries)',
      },
      'Idempotency-Key',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication) {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  return document;
}
