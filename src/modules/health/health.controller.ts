import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PersistenceInfoService } from '../../database/persistence-info.service';
import { MockHcmService } from '../mock-hcm/mock-hcm.service';
import { Public } from '../../common/auth/public.decorator';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly persistenceInfo: PersistenceInfoService,
    private readonly mockHcmService: MockHcmService,
  ) {}

  @Get()
  check() {
    const mode = this.persistenceInfo.getMode();
    return {
      status: 'ok',
      persistenceMode: mode,
      database:
        mode === 'memory'
          ? 'memory'
          : this.persistenceInfo.isHealthy()
            ? 'ok'
            : 'error',
      hcmMock: this.mockHcmService.isHealthy() ? 'ok' : 'error',
    };
  }
}
