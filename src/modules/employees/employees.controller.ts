import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { BalanceService } from '../balances/balance.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { EmployeeAccessGuard } from '../../common/auth/employee-access.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole } from '../../domain/enums';
import { ApiAuthHeaders } from '../../common/swagger/api-auth.decorator';
import { ErrorResponseDto } from '../../common/swagger/dto/error-response.dto';
import {
  BalanceRefreshResponseDto,
  EmployeeBalancesResponseDto,
} from '../../common/swagger/dto/employee-balances-response.dto';

@ApiTags('employees')
@Controller('employees')
@UseGuards(AuthGuard, EmployeeAccessGuard)
@ApiAuthHeaders()
export class EmployeesController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/balances')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Get employee balances across locations',
    description:
      'Requires the employee to exist in local persistence. For Swagger demos, call POST /sqlite/test/seed first (seeds emp_123 by default).',
  })
  @ApiParam({ name: 'employeeId', example: 'emp_123' })
  @ApiOkResponse({ type: EmployeeBalancesResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getBalances(@Param('employeeId') employeeId: string) {
    return this.balanceService.getEmployeeBalances(employeeId);
  }

  @Post(':employeeId/locations/:locationId/balances/refresh')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh balance from HCM real-time lookup' })
  @ApiParam({ name: 'employeeId', example: 'emp_123' })
  @ApiParam({ name: 'locationId', example: 'loc_001' })
  @ApiOkResponse({ type: BalanceRefreshResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  refreshBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balanceService.refreshBalance(employeeId, locationId);
  }
}
