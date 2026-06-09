import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { BatchImportService } from './batch-import.service';
import { ReconciliationService } from './reconciliation.service';
import { AuditService } from '../../common/audit/audit.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { ReconciliationRulesService } from '../../domain/reconciliation-rules.service';
import { BatchImportValidatorService } from '../../domain/batch-import-validator.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { HcmModule } from '../hcm/hcm.module';

@Module({
  imports: [HcmModule],
  controllers: [SystemController],
  providers: [
    BatchImportService,
    ReconciliationService,
    AuditService,
    BalanceCalculatorService,
    ReconciliationRulesService,
    BatchImportValidatorService,
    IdempotencyService,
  ],
})
export class SystemModule {}
