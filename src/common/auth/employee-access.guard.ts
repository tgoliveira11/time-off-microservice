import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import {
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
} from '../../database/ports/repository.ports';
import { AUTH_USER_KEY, AuthUser } from './auth.types';
import { UserRole } from '../../domain/enums';
import { Request } from 'express';

@Injectable()
export class EmployeeAccessGuard implements CanActivate {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { [AUTH_USER_KEY]: AuthUser })[
      AUTH_USER_KEY
    ];
    const employeeIdParam = request.params.employeeId ?? request.body?.employeeId;
    const employeeId = Array.isArray(employeeIdParam)
      ? employeeIdParam[0]
      : employeeIdParam;

    if (!employeeId) {
      return true;
    }

    if (
      user.role === UserRole.SYSTEM_ADMIN ||
      user.role === UserRole.SYSTEM_INTEGRATION
    ) {
      return true;
    }

    if (user.role === UserRole.EMPLOYEE && user.id === employeeId) {
      return true;
    }

    if (user.role === UserRole.MANAGER) {
      const employee = this.employeeRepository.findById(employeeId);
      if (employee?.managerId === user.id) {
        return true;
      }
    }

    throw new ForbiddenException('Cannot access employee data');
  }
}
