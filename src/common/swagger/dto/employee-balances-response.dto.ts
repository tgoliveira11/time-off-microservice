import { ApiProperty } from '@nestjs/swagger';
import { BalanceUnit } from '../../../domain/enums';

export class EmployeeBalanceDto {
  @ApiProperty({ example: 'loc_001' })
  locationId!: string;

  @ApiProperty({ example: 10 })
  hcmBalance!: number;

  @ApiProperty({ example: 2 })
  reservedBalance!: number;

  @ApiProperty({ example: 8 })
  availableBalance!: number;

  @ApiProperty({ enum: BalanceUnit, example: BalanceUnit.DAYS })
  unit!: BalanceUnit;

  @ApiProperty({ example: '2026-02-10T12:00:00.000Z', nullable: true })
  lastHcmSyncAt!: string | null;

  @ApiProperty({ example: false })
  reconciliationRequired!: boolean;
}

export class EmployeeBalancesResponseDto {
  @ApiProperty({ example: 'emp_123' })
  employeeId!: string;

  @ApiProperty({ type: [EmployeeBalanceDto] })
  balances!: EmployeeBalanceDto[];
}

export class BalanceRefreshResponseDto {
  @ApiProperty({ example: 'emp_123' })
  employeeId!: string;

  @ApiProperty({ example: 'loc_001' })
  locationId!: string;

  @ApiProperty({ example: 10 })
  hcmBalance!: number;

  @ApiProperty({ example: 0 })
  reservedBalance!: number;

  @ApiProperty({ example: 10 })
  availableBalance!: number;

  @ApiProperty({ example: 'HCM_REALTIME' })
  source!: string;

  @ApiProperty({ example: '2026-02-10T12:00:00.000Z', nullable: true })
  lastHcmSyncAt!: string | null;
}
