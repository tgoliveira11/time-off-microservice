import { HttpException, HttpStatus } from '@nestjs/common';

export class OperationAcceptedException extends HttpException {
  constructor(body: Record<string, unknown>) {
    super(body, HttpStatus.ACCEPTED);
  }
}

export class OperationOkException extends HttpException {
  constructor(body: Record<string, unknown>) {
    super(body, HttpStatus.OK);
  }
}
