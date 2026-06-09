import { UserRole } from '../../domain/enums';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export const AUTH_USER_KEY = 'authUser';
