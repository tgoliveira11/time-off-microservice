import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BalanceService } from '../balances/balance.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { EmployeeAccessGuard } from '../../common/auth/employee-access.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole } from '../../domain/enums';

@ApiTags('employees')
@Controller('employees')
@UseGuards(AuthGuard, EmployeeAccessGuard)
export class EmployeesController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/balances')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  getBalances(@Param('employeeId') employeeId: string) {
    return this.balanceService.getEmployeeBalances(employeeId);
  }

  @Post(':employeeId/locations/:locationId/balances/refresh')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  refreshBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balanceService.refreshBalance(employeeId, locationId);
  }
}
