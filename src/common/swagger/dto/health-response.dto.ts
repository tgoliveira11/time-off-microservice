import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'sqlite', enum: ['sqlite', 'memory'] })
  persistenceMode!: string;

  @ApiProperty({ example: 'ok', description: 'ok | memory | error' })
  database!: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'error'] })
  hcmMock!: string;
}
