import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class MockHcmSeedBalanceDto {
  @ApiProperty({ example: 'emp_123' })
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: 'loc_001' })
  @IsString()
  locationId!: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  balance!: number;

  @ApiProperty({ example: 'DAYS' })
  @IsString()
  unit!: string;

  @ApiProperty({ example: 'v1' })
  @IsString()
  version!: string;
}

export class MockHcmSeedDto {
  @ApiPropertyOptional({
    type: [MockHcmSeedBalanceDto],
    description:
      'Balances to upsert in mock HCM. When omitted or empty, seeds the default mock balance emp_123@loc_001 (10 DAYS).',
    example: [
      {
        employeeId: 'emp_123',
        locationId: 'loc_001',
        balance: 10,
        unit: 'DAYS',
        version: 'v1',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MockHcmSeedBalanceDto)
  balances?: MockHcmSeedBalanceDto[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Optional scenario map keyed by employee:location, submit:requestId, or batch',
    example: { batch: 'timeout' },
  })
  @IsOptional()
  @IsObject()
  scenarios?: Record<string, string>;
}
