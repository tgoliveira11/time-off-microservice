import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../domain/enums';
import { AUTH_USER_KEY, AuthUser } from './auth.types';
import { ROLES_KEY } from './roles.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.header('X-User-Id');
    const roleHeader = request.header('X-User-Role') as UserRole | undefined;

    if (!userId || !roleHeader) {
      throw new UnauthorizedException('Missing authentication headers');
    }

    if (!Object.values(UserRole).includes(roleHeader)) {
      throw new UnauthorizedException('Invalid role');
    }

    const user: AuthUser = { id: userId, role: roleHeader };
    (request as Request & { [AUTH_USER_KEY]: AuthUser })[AUTH_USER_KEY] = user;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
