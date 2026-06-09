import { IsDateString, IsEnum, IsNumber, IsPositive, IsString } from 'class-validator';
import { BalanceUnit } from '../../../domain/enums';

export class CreateTimeOffRequestDto {
  @IsString()
  employeeId!: string;

  @IsString()
  locationId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsEnum(BalanceUnit)
  unit!: BalanceUnit;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
