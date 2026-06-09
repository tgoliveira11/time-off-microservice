import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CorrelationService } from '../logging/correlation.service';
import { CorrelationMiddleware } from './correlation.middleware';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { StructuredEventLogger } from './structured-event-logger.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [CorrelationService, CorrelationMiddleware, MetricsService, StructuredEventLogger],
  exports: [CorrelationService, MetricsService, StructuredEventLogger],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
