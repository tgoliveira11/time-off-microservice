import { IsString, MinLength } from 'class-validator';

export class RejectTimeOffRequestDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
