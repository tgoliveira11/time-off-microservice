import { Injectable } from '@nestjs/common';
import {
  fetchHcmWithTimeout,
  encodeHcmPathSegment,
} from './hcm-fetch.util';
import {
  HcmBatchBalanceResponse,
  HcmBalanceResponse,
  HcmClient,
  HcmSubmissionRequest,
  HcmSubmissionResponse,
} from './hcm-client.interface';
import {
  HcmClientError,
  HcmErrorMapperService,
} from '../../domain/hcm-error-mapper.service';

@Injectable()
export class HttpHcmClient implements HcmClient {
  constructor(private readonly errorMapper: HcmErrorMapperService) {}

  private get baseUrl(): string {
    return process.env.HCM_BASE_URL ?? 'http://localhost:3000/mock-hcm';
  }

  async getRealtimeBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse> {
    const response = await fetchHcmWithTimeout(
      `${this.baseUrl}/employees/${encodeHcmPathSegment(employeeId)}/locations/${encodeHcmPathSegment(locationId)}/balance`,
      this.errorMapper,
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      throw this.errorMapper.mapHttpStatus(response.status, body);
    }

    return (await response.json()) as HcmBalanceResponse;
  }

  async submitTimeOff(
    request: HcmSubmissionRequest,
  ): Promise<HcmSubmissionResponse> {
    const response = await fetchHcmWithTimeout(
      `${this.baseUrl}/time-off`,
      this.errorMapper,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      throw this.errorMapper.mapHttpStatus(response.status, body);
    }

    return (await response.json()) as HcmSubmissionResponse;
  }

  async getBatchBalances(): Promise<HcmBatchBalanceResponse> {
    const response = await fetchHcmWithTimeout(
      `${this.baseUrl}/balances/batch`,
      this.errorMapper,
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      throw this.errorMapper.mapHttpStatus(response.status, body);
    }

    return (await response.json()) as HcmBatchBalanceResponse;
  }
}
