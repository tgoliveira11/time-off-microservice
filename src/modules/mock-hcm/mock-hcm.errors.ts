import { HttpException } from '@nestjs/common';

export function throwHcmError(status: number, message: string): never {
  throw new HttpException({ message, error: message }, status);
}
