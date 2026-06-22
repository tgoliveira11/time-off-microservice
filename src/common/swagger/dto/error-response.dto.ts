import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: 'Missing authentication headers' })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized', required: false })
  error?: string;
}
