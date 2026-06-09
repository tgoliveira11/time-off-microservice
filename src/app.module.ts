import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { TimeOffRequestsModule } from './modules/time-off-requests/time-off-requests.module';
import { SystemModule } from './modules/system/system.module';
import { HealthModule } from './modules/health/health.module';
import { MockHcmModule } from './modules/mock-hcm/mock-hcm.module';
import { HcmModule } from './modules/hcm/hcm.module';
import { AuthGuard } from './common/auth/auth.guard';
import { EmployeeAccessGuard } from './common/auth/employee-access.guard';
import { BalanceCalculatorService } from './domain/balance-calculator.service';
import { StateTransitionService } from './domain/state-transition.service';
import {
  HcmErrorMapperService,
  RetryClassifierService,
} from './domain/hcm-error-mapper.service';
import { ReconciliationRulesService } from './domain/reconciliation-rules.service';
import { RequestValidationService } from './domain/request-validation.service';

@Module({
  imports: [
    DatabaseModule.register(),
    ObservabilityModule,
    HcmModule,
    MockHcmModule,
    EmployeesModule,
    TimeOffRequestsModule,
    SystemModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    EmployeeAccessGuard,
    BalanceCalculatorService,
    StateTransitionService,
    HcmErrorMapperService,
    RetryClassifierService,
    ReconciliationRulesService,
    RequestValidationService,
  ],
})
export class AppModule {}
