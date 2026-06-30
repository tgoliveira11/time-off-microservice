import { ApiProperty } from '@nestjs/swagger';
import { ReconciliationIssueType, ReconciliationSeverity } from '../../../domain/enums';

export class BatchImportResponseDto {
  @ApiProperty({ example: 'job_batch_001' })
  jobId!: string;

  @ApiProperty({ example: 'COMPLETED' })
  status!: string;

  @ApiProperty({ example: 42 })
  importedBalances!: number;

  @ApiProperty({ example: 0 })
  reconciliationRequired!: number;
}

export class ReconciliationIssueDto {
  @ApiProperty({ example: 'emp_123' })
  employeeId!: string;

  @ApiProperty({ example: 'loc_001' })
  locationId!: string;

  @ApiProperty({ enum: ReconciliationIssueType })
  issueType!: ReconciliationIssueType;

  @ApiProperty({ enum: ReconciliationSeverity })
  severity!: ReconciliationSeverity;

  @ApiProperty({ example: 'Local reserved balance exceeds HCM balance' })
  details!: string;
}

export class ReconciliationResponseDto {
  @ApiProperty({ example: 'job_recon_001' })
  jobId!: string;

  @ApiProperty({ example: 'COMPLETED' })
  status!: string;

  @ApiProperty({ type: [ReconciliationIssueDto] })
  issues!: ReconciliationIssueDto[];
}
