import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AUTH_USER_KEY, AuthUser } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request as Request & { [AUTH_USER_KEY]: AuthUser })[AUTH_USER_KEY];
  },
);
