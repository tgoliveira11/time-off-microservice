import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnprocessableEntityResponse,
  ApiServiceUnavailableResponse,
  ApiAcceptedResponse,
} from '@nestjs/swagger';
import { TimeOffRequestService } from './time-off-request.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole } from '../../domain/enums';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { ApiAuthHeaders } from '../../common/swagger/api-auth.decorator';
import { ApiIdempotencyKeyHeader } from '../../common/swagger/api-idempotency.decorator';
import { IdempotencyKey } from '../../common/http/idempotency-key.decorator';
import { resolveIdempotencyKey } from '../../common/http/resolve-idempotency-key.util';
import { ErrorResponseDto } from '../../common/swagger/dto/error-response.dto';
import {
  CreateTimeOffRequestResponseDto,
  TimeOffRequestDetailResponseDto,
  TimeOffRequestSummaryDto,
  TimeOffRequestTransitionResponseDto,
} from '../../common/swagger/dto/time-off-request-response.dto';

@ApiTags('time-off-requests')
@Controller()
@UseGuards(AuthGuard)
@ApiAuthHeaders()
export class TimeOffRequestsController {
  constructor(private readonly timeOffRequestService: TimeOffRequestService) {}

  @Post('time-off-requests')
  @Roles(UserRole.EMPLOYEE, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a time-off request and reserve local balance',
    description:
      'Send the same Idempotency-Key header (Authorize dialog or parameter) or the same requestBody.idempotencyKey to replay the original response without creating a duplicate request.',
  })
  @ApiIdempotencyKeyHeader()
  @ApiOkResponse({ type: CreateTimeOffRequestResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Insufficient local balance or idempotency mismatch' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  create(
    @Body() dto: CreateTimeOffRequestDto,
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    const { idempotencyKey: bodyKey, ...createDto } = dto;
    const resolvedKey = resolveIdempotencyKey(idempotencyKey, bodyKey);
    return this.timeOffRequestService.createRequest(user, createDto, resolvedKey);
  }

  @Get('time-off-requests/:requestId')
  @Roles(
    UserRole.EMPLOYEE,
    UserRole.MANAGER,
    UserRole.SYSTEM_ADMIN,
    UserRole.SYSTEM_INTEGRATION,
  )
  @ApiOperation({ summary: 'Get time-off request details and status history' })
  @ApiParam({ name: 'requestId', example: 'req_abc123' })
  @ApiOkResponse({ type: TimeOffRequestDetailResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('requestId') requestId: string, @CurrentUser() user: AuthUser) {
    return this.timeOffRequestService.getRequest(requestId, user);
  }

  @Post('time-off-requests/:requestId/cancel')
  @Roles(UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending time-off request and release reserved balance' })
  @ApiParam({ name: 'requestId', example: 'req_abc123' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: TimeOffRequestTransitionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  cancel(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.cancelRequest(
      requestId,
      user,
      idempotencyKey,
    );
  }

  @Get('managers/:managerId/time-off-requests')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List pending time-off requests for a manager' })
  @ApiParam({ name: 'managerId', example: 'mgr_001' })
  @ApiOkResponse({ type: [TimeOffRequestSummaryDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  listPending(
    @Param('managerId') managerId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.timeOffRequestService.listPendingForManager(managerId, user);
  }

  @Post('time-off-requests/:requestId/approve')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve request, validate HCM balance, and submit to HCM' })
  @ApiParam({ name: 'requestId', example: 'req_abc123' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: TimeOffRequestTransitionResponseDto })
  @ApiAcceptedResponse({
    type: TimeOffRequestTransitionResponseDto,
    description: 'HCM submission pending retry',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Insufficient HCM balance or invalid transition' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  @ApiResponse({ status: 200, type: TimeOffRequestTransitionResponseDto })
  approve(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.approveRequest(
      requestId,
      user,
      idempotencyKey,
    );
  }

  @Post('time-off-requests/:requestId/reject')
  @Roles(UserRole.MANAGER, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending time-off request' })
  @ApiParam({ name: 'requestId', example: 'req_abc123' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: TimeOffRequestTransitionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  reject(
    @Param('requestId') requestId: string,
    @Body() dto: RejectTimeOffRequestDto,
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.timeOffRequestService.rejectRequest(
      requestId,
      user,
      dto.reason,
      idempotencyKey,
    );
  }
}
