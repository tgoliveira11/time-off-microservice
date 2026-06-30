import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { DemoDatasetService } from '../../demo/demo-dataset.service';
import { PersistenceInfoService } from '../../database/persistence-info.service';

@ApiTags('SQLite')
@Controller('sqlite')
@Public()
export class SqliteController {
  constructor(
    private readonly demoDatasetService: DemoDatasetService,
    private readonly persistenceInfo: PersistenceInfoService,
  ) {}

  @Post('test/seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed local persistence demo dataset',
    description:
      'Creates the default local demo entities when missing: manager mgr_001, employee emp_123, location loc_001, and balance projection (10 DAYS). Works with SQLite and in-memory persistence.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'seeded',
        persistenceMode: 'sqlite',
      },
    },
  })
  seed() {
    this.demoDatasetService.ensureDefaultDemoDataset();
    return {
      status: 'seeded',
      persistenceMode: this.persistenceInfo.getMode(),
    };
  }

  @Post('test/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset local persistence',
    description:
      'Wipes local application data: employees, balances, time-off requests, idempotency cache, audit/outbox, and process-local metrics. Does not affect mock HCM state.',
  })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'reset',
        persistenceMode: 'sqlite',
      },
    },
  })
  reset() {
    this.demoDatasetService.resetLocalData();
    return {
      status: 'reset',
      persistenceMode: this.persistenceInfo.getMode(),
    };
  }
}
