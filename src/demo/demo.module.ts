import { Global, Module } from '@nestjs/common';
import { DemoDatasetService } from './demo-dataset.service';

@Global()
@Module({
  providers: [DemoDatasetService],
  exports: [DemoDatasetService],
})
export class DemoModule {}
