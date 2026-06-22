import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MockHcmService, MockBalance } from './mock-hcm.service';
import { Public } from '../../common/auth/public.decorator';
import {
  MockHcmBalanceLookupScenario,
  MockHcmBatchScenario,
  MockHcmSubmitScenario,
} from './mock-hcm-scenarios';
import { MockHcmSeedDto } from './dto/mock-hcm-seed.dto';
import { DEFAULT_MOCK_HCM_BALANCE } from './mock-hcm-defaults';

@ApiTags('MockHcm')
@Controller('mock-hcm')
@Public()
export class MockHcmController {
  constructor(private readonly mockHcmService: MockHcmService) {}

  @Get('employees/:employeeId/locations/:locationId/balance')
  @ApiOperation({
    summary: 'Mock HCM real-time balance lookup',
    description:
      'Returns the seeded balance for the employee/location pair. Seed mock data first via POST /mock-hcm/test/seed (empty body seeds emp_123@loc_001 by default).',
  })
  @ApiParam({ name: 'employeeId', example: 'emp_123' })
  @ApiParam({ name: 'locationId', example: 'loc_001' })
  @ApiQuery({
    name: 'scenario',
    required: false,
    enum: MockHcmBalanceLookupScenario,
    description: 'Optional fault-injection scenario for balance lookup',
  })
  @ApiOkResponse({
    description: 'Current HCM balance for employee/location',
    schema: {
      example: DEFAULT_MOCK_HCM_BALANCE,
    },
  })
  @ApiNotFoundResponse({
    description: 'Employee/location not seeded in mock HCM',
    schema: {
      example: {
        message: 'Invalid employee/location combination',
        error: 'Invalid employee/location combination',
      },
    },
  })
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Query('scenario') scenario?: MockHcmBalanceLookupScenario,
  ): MockBalance {
    return this.mockHcmService.getBalance(employeeId, locationId, scenario);
  }

  @Post('time-off')
  @ApiOperation({ summary: 'Mock HCM time-off submission' })
  @ApiQuery({
    name: 'scenario',
    required: false,
    enum: MockHcmSubmitScenario,
    description: 'Optional fault-injection scenario for submission',
  })
  @ApiOkResponse({ description: 'Submission accepted by mock HCM' })
  submitTimeOff(
    @Body()
    body: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: string;
      externalRequestId: string;
    },
    @Query('scenario') scenario?: MockHcmSubmitScenario,
  ) {
    return this.mockHcmService.submitTimeOff(body, scenario);
  }

  @Get('balances/batch')
  @ApiOperation({ summary: 'Mock HCM batch balance corpus' })
  @ApiQuery({
    name: 'scenario',
    required: false,
    enum: MockHcmBatchScenario,
    description: 'Optional fault-injection scenario for batch import corpus',
  })
  @ApiOkResponse({ description: 'Batch balance rows from mock HCM' })
  getBatchBalances(
    @Query('scenario') scenario?: MockHcmBatchScenario,
  ): { balances: unknown[] } {
    return this.mockHcmService.getBatchBalances(scenario);
  }

  @Post('test/seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed mock HCM balances and scenarios',
    description:
      'Upserts mock HCM state only. An empty body seeds the default mock balance emp_123@loc_001 (10 DAYS). For local employees/balances, use POST /sqlite/test/seed.',
  })
  @ApiBody({
    type: MockHcmSeedDto,
    required: false,
    examples: {
      defaultDemo: {
        summary: 'Default mock HCM balance (also applied when body is empty)',
        value: {
          balances: [DEFAULT_MOCK_HCM_BALANCE],
        },
      },
      withScenario: {
        summary: 'Demo balance plus batch timeout scenario',
        value: {
          balances: [DEFAULT_MOCK_HCM_BALANCE],
          scenarios: { batch: 'timeout' },
        },
      },
    },
  })
  @ApiOkResponse({
    schema: { example: { status: 'seeded' } },
  })
  seed(@Body() body: MockHcmSeedDto = {}) {
    this.mockHcmService.seed(body as Record<string, unknown>);
    return { status: 'seeded' };
  }

  @Post('test/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset mock HCM state',
    description:
      'Clears mock HCM balances, submissions, and scenarios only. Does not affect local persistence. Use POST /sqlite/test/reset to wipe the local database.',
  })
  @ApiOkResponse({
    schema: { example: { status: 'reset' } },
  })
  reset() {
    this.mockHcmService.reset();
    return { status: 'reset' };
  }
}
