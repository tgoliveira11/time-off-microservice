import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { BalanceUnit } from '../../../domain/enums';

export class CreateTimeOffRequestDto {
  @ApiProperty({ example: 'emp_123', description: 'Employee requesting time off' })
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: 'loc_001', description: 'Location for balance deduction' })
  @IsString()
  locationId!: string;

  @ApiProperty({ example: 2, description: 'Amount of time off requested' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: BalanceUnit, example: BalanceUnit.DAYS })
  @IsEnum(BalanceUnit)
  unit!: BalanceUnit;

  @ApiProperty({ example: '2026-07-10', format: 'date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-07-11', format: 'date' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    example: 'sqlite-create-001',
    description:
      'Optional idempotency key for Swagger/clients that prefer the JSON body. Prefer the Idempotency-Key header in production integrations.',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
