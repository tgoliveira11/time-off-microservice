import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationService } from '../logging/correlation.service';

export const CORRELATION_HEADER = 'X-Correlation-Id';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  constructor(private readonly correlationService: CorrelationService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId =
      incoming && incoming.trim().length > 0 ? incoming.trim() : uuidv4();
    res.setHeader(CORRELATION_HEADER, correlationId);
    this.correlationService.run(correlationId, () => next());
  }
}
