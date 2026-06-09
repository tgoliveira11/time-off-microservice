import { Module } from '@nestjs/common';
import { HcmClientService } from './hcm-client.service';
import { HttpHcmClient } from './http-hcm.client';
import { HCM_CLIENT } from './hcm-client.interface';
import {
  HcmErrorMapperService,
  RetryClassifierService,
} from '../../domain/hcm-error-mapper.service';

@Module({
  providers: [
    HcmErrorMapperService,
    RetryClassifierService,
    HttpHcmClient,
    {
      provide: HCM_CLIENT,
      useExisting: HttpHcmClient,
    },
    HcmClientService,
  ],
  exports: [HcmClientService, HcmErrorMapperService, RetryClassifierService],
})
export class HcmModule {}
