import { Module } from '@nestjs/common';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequestService } from './time-off-request.service';
import { AuditService } from '../../common/audit/audit.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { StateTransitionService } from '../../domain/state-transition.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { RequestValidationService } from '../../domain/request-validation.service';
import { HcmModule } from '../hcm/hcm.module';

@Module({
  imports: [HcmModule],
  controllers: [TimeOffRequestsController],
  providers: [
    TimeOffRequestService,
    AuditService,
    IdempotencyService,
    StateTransitionService,
    BalanceCalculatorService,
    RequestValidationService,
  ],
  exports: [TimeOffRequestService],
})
export class TimeOffRequestsModule {}
