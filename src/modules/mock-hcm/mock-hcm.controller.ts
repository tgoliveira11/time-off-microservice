import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MockHcmService, MockBalance } from './mock-hcm.service';
import { Public } from '../../common/auth/public.decorator';

@Controller('mock-hcm')
@Public()
export class MockHcmController {
  constructor(private readonly mockHcmService: MockHcmService) {}

  @Get('employees/:employeeId/locations/:locationId/balance')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Query('scenario') scenario?: string,
  ): MockBalance {
    return this.mockHcmService.getBalance(employeeId, locationId, scenario);
  }

  @Post('time-off')
  submitTimeOff(
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: string;
      externalRequestId: string;
    },
    @Query('scenario') scenario?: string,
  ) {
    return this.mockHcmService.submitTimeOff(body, scenario);
  }

  @Get('balances/batch')
  getBatchBalances(
    @Query('scenario') scenario?: string,
  ): { balances: unknown[] } {
    return this.mockHcmService.getBatchBalances(scenario);
  }

  @Post('test/seed')
  seed(@Body() body: Record<string, unknown>) {
    this.mockHcmService.seed(body);
    return { status: 'seeded' };
  }

  @Post('test/reset')
  reset() {
    this.mockHcmService.reset();
    return { status: 'reset' };
  }
}
