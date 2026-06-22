import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';
import { MetricsResponseDto } from '../swagger/dto/metrics-response.dto';

@ApiTags('observability')
@Controller('metrics')
@Public()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Process-local operational counters' })
  @ApiOkResponse({ type: MetricsResponseDto })
  getMetrics() {
    return {
      ...this.metricsService.snapshot(),
      note: 'Process-local counters; values reset on application restart.',
    };
  }
}
