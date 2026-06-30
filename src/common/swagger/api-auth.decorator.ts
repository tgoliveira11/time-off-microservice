import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiSecurity } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums';

export function ApiAuthHeaders() {
  return applyDecorators(
    ApiHeader({
      name: 'X-User-Id',
      required: true,
      description: 'Authenticated user id',
      schema: { type: 'string', example: 'emp_123' },
    }),
    ApiHeader({
      name: 'X-User-Role',
      required: true,
      description:
        'Role constant — use EMPLOYEE, MANAGER, SYSTEM_ADMIN, or SYSTEM_INTEGRATION (not the user id)',
      schema: {
        type: 'string',
        enum: Object.values(UserRole),
        example: UserRole.EMPLOYEE,
      },
    }),
    ApiSecurity('X-User-Id'),
    ApiSecurity('X-User-Role'),
  );
}
