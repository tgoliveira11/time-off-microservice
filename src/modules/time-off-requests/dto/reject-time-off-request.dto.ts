import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectTimeOffRequestDto {
  @ApiProperty({ example: 'Insufficient team coverage for requested dates' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
