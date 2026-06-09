import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MockHcmModule } from '../mock-hcm/mock-hcm.module';

@Module({
  imports: [MockHcmModule],
  controllers: [HealthController],
})
export class HealthModule {}
