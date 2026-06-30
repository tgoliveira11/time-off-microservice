import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PersistenceInfoService } from '../../database/persistence-info.service';
import { MockHcmService } from '../mock-hcm/mock-hcm.service';
import { Public } from '../../common/auth/public.decorator';
import { HealthResponseDto } from '../../common/swagger/dto/health-response.dto';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly persistenceInfo: PersistenceInfoService,
    private readonly mockHcmService: MockHcmService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check for API, persistence, and mock HCM' })
  @ApiOkResponse({ type: HealthResponseDto })
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
