import { ApiProperty } from '@nestjs/swagger';
import { ActorType, BalanceUnit, RequestStatus } from '../../../domain/enums';

export class CreateTimeOffRequestResponseDto {
  @ApiProperty({ example: 'req_abc123' })
  requestId!: string;

  @ApiProperty({ enum: RequestStatus, example: RequestStatus.PENDING_MANAGER_APPROVAL })
  status!: RequestStatus;

  @ApiProperty({ example: 8 })
  availableBalanceAfterReservation!: number;
}

export class TimeOffRequestTransitionResponseDto {
  @ApiProperty({ example: 'req_abc123' })
  requestId!: string;

  @ApiProperty({ enum: RequestStatus, example: RequestStatus.APPROVED })
  status!: RequestStatus;

  @ApiProperty({ example: 'hcm_tx_req_abc123', required: false, nullable: true })
  hcmTransactionId?: string | null;
}

export class RequestStatusHistoryDto {
  @ApiProperty({ example: 'hist_001' })
  id!: string;

  @ApiProperty({ example: 'req_abc123' })
  requestId!: string;

  @ApiProperty({ enum: RequestStatus, nullable: true })
  fromStatus!: RequestStatus | null;

  @ApiProperty({ enum: RequestStatus })
  toStatus!: RequestStatus;

  @ApiProperty({ enum: ActorType })
  actorType!: ActorType;

  @ApiProperty({ example: 'mgr_001', nullable: true })
  actorId!: string | null;

  @ApiProperty({ example: null, nullable: true })
  reason!: string | null;

  @ApiProperty({ example: '2026-02-10T12:00:00.000Z' })
  createdAt!: string;
}

export class TimeOffRequestSummaryDto {
  @ApiProperty({ example: 'req_abc123' })
  id!: string;

  @ApiProperty({ example: 'emp_123' })
  employeeId!: string;

  @ApiProperty({ example: 'loc_001' })
  locationId!: string;

  @ApiProperty({ example: 2 })
  amount!: number;

  @ApiProperty({ enum: BalanceUnit })
  unit!: BalanceUnit;

  @ApiProperty({ example: '2026-02-10' })
  startDate!: string;

  @ApiProperty({ example: '2026-02-11' })
  endDate!: string;

  @ApiProperty({ enum: RequestStatus })
  status!: RequestStatus;

  @ApiProperty({ example: 'mgr_001', nullable: true })
  managerId!: string | null;

  @ApiProperty({ example: null, nullable: true })
  hcmTransactionId!: string | null;

  @ApiProperty({ example: null, nullable: true })
  idempotencyKey!: string | null;

  @ApiProperty({ example: null, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ example: '2026-02-10T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-02-10T12:05:00.000Z' })
  updatedAt!: string;
}

export class TimeOffRequestDetailResponseDto extends TimeOffRequestSummaryDto {
  @ApiProperty({ type: [RequestStatusHistoryDto] })
  statusHistory!: RequestStatusHistoryDto[];
}
