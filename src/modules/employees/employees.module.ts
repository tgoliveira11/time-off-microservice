import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { BalanceService } from '../balances/balance.service';
import { AuditService } from '../../common/audit/audit.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { HcmModule } from '../hcm/hcm.module';

@Module({
  imports: [HcmModule],
  controllers: [EmployeesController],
  providers: [BalanceService, AuditService, BalanceCalculatorService],
})
export class EmployeesModule {}
