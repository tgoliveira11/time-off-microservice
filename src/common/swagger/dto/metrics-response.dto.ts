import { ApiProperty } from '@nestjs/swagger';

export class MetricsResponseDto {
  @ApiProperty({ example: 0 })
  requestsCreatedTotal!: number;

  @ApiProperty({ example: 0 })
  requestsApprovedTotal!: number;

  @ApiProperty({ example: 0 })
  requestsRejectedTotal!: number;

  @ApiProperty({ example: 0 })
  requestsCancelledTotal!: number;

  @ApiProperty({ example: 0 })
  hcmLookupSuccessTotal!: number;

  @ApiProperty({ example: 0 })
  hcmLookupFailureTotal!: number;

  @ApiProperty({ example: 0 })
  hcmSubmissionSuccessTotal!: number;

  @ApiProperty({ example: 0 })
  hcmSubmissionFailureTotal!: number;

  @ApiProperty({ example: 0 })
  hcmTimeoutTotal!: number;

  @ApiProperty({ example: 0 })
  hcmDuplicateSubmissionTotal!: number;

  @ApiProperty({ example: 0 })
  batchImportSuccessTotal!: number;

  @ApiProperty({ example: 0 })
  batchImportFailureTotal!: number;

  @ApiProperty({ example: 0 })
  reconciliationRunsTotal!: number;

  @ApiProperty({ example: 0 })
  reconciliationIssuesTotal!: number;

  @ApiProperty({ example: 0 })
  idempotencyReplayTotal!: number;

  @ApiProperty({ example: 0 })
  idempotencyMismatchTotal!: number;

  @ApiProperty({
    example: 'Process-local counters; values reset on application restart.',
  })
  note!: string;
}
