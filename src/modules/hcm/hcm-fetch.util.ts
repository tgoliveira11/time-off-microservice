import {
  HcmClientError,
  HcmErrorMapperService,
  HcmErrorType,
} from '../../domain/hcm-error-mapper.service';

export async function fetchHcmWithTimeout(
  url: string,
  errorMapper: HcmErrorMapperService,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.HCM_TIMEOUT_MS ?? 5000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw errorMapper.mapTimeout();
    }
    if (error instanceof HcmClientError) {
      throw error;
    }
    throw new HcmClientError(
      HcmErrorType.TRANSIENT,
      (error as Error).message,
      undefined,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function encodeHcmPathSegment(value: string): string {
  return encodeURIComponent(value);
}
