import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { TimeOffRequestService } from './time-off-request.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole, BalanceUnit } from '../../domain/enums';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';

@ApiTags('time-off-requests')
@Controller()
@UseGuards(AuthGuard)
export class TimeOffRequestsController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Post('time-off-requests')
  @Roles(UserRole.EMPLOYEE, UserRole.SYSTEM_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(
    @Body() dto: CreateTimeOffRequestDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.createRequest(user, dto, idempotencyKey);
  }

  @Get('time-off-requests/:requestId')
  @Roles(
    UserRole.EMPLOYEE,
    UserRole.MANAGER,
    UserRole.SYSTEM_ADMIN,
    UserRole.SYSTEM_INTEGRATION,
  )
  get(@Param('requestId') requestId: string, @CurrentUser() user: AuthUser) {
    return this.timeOffRequestService.getRequest(requestId, user);
  }

  @Post('time-off-requests/:requestId/cancel')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  cancel(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.cancelRequest(
      requestId,
      user,
      idempotencyKey,
    );
  }

  @Get('managers/:managerId/time-off-requests')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  listPending(
    @Param('managerId') managerId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.timeOffRequestService.listPendingForManager(managerId, user);
  }

  @Post('time-off-requests/:requestId/approve')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  approve(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.approveRequest(
      requestId,
      user,
      idempotencyKey,
    );
  }

  @Post('time-off-requests/:requestId/reject')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  reject(
    @Param('requestId') requestId: string,
    @Body() dto: RejectTimeOffRequestDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.rejectRequest(
      requestId,
      user,
      dto.reason,
      idempotencyKey,
    );
  }
}
