import { HcmClientError, HcmErrorMapperService, HcmErrorType, RetryClassifierService } from '../../src/domain/hcm-error-mapper.service';
import { HcmClientService } from '../../src/modules/hcm/hcm-client.service';
import { HcmClient } from '../../src/modules/hcm/hcm-client.interface';
import { MetricsService } from '../../src/common/observability/metrics.service';
import { StructuredEventLogger } from '../../src/common/observability/structured-event-logger.service';
import { CorrelationService } from '../../src/common/logging/correlation.service';

describe('HcmClientService retry behavior', () => {
  const errorMapper = new HcmErrorMapperService();
  const retryClassifier = new RetryClassifierService();
  const metricsService = new MetricsService();
  const eventLogger = new StructuredEventLogger(new CorrelationService());

  function createService(client: jest.Mocked<HcmClient>): HcmClientService {
    return new HcmClientService(
      client,
      errorMapper,
      retryClassifier,
      metricsService,
      eventLogger,
    );
  }

  it('retries transient HCM failures before succeeding', async () => {
    const client = {
      getRealtimeBalance: jest.fn(),
      submitTimeOff: jest.fn(),
      getBatchBalances: jest.fn(),
    };
    client.getRealtimeBalance
      .mockRejectedValueOnce(
        new HcmClientError(HcmErrorType.TRANSIENT, 'temporary', 500, true),
      )
      .mockResolvedValueOnce({ balance: 10, unit: 'DAYS', version: 'v1' });

    const service = createService(client);
    const balance = await service.getRealtimeBalance('emp_1', 'loc_1');

    expect(balance.balance).toBe(10);
    expect(client.getRealtimeBalance).toHaveBeenCalledTimes(2);
  });

  it('does not auto-retry timeout errors', async () => {
    const client = {
      getRealtimeBalance: jest.fn(),
      submitTimeOff: jest.fn(),
      getBatchBalances: jest.fn(),
    };
    client.submitTimeOff.mockRejectedValue(
      new HcmClientError(HcmErrorType.TIMEOUT, 'timed out', undefined, true),
    );

    const service = createService(client);

    await expect(
      service.submitTimeOff({
        employeeId: 'emp_1',
        locationId: 'loc_1',
        amount: 1,
        unit: 'DAYS',
        externalRequestId: 'req_1',
      }),
    ).rejects.toMatchObject({ type: HcmErrorType.TIMEOUT });

    expect(client.submitTimeOff).toHaveBeenCalledTimes(1);
  });

  it('maps unknown thrown errors before retry classification', async () => {
    const client = {
      getRealtimeBalance: jest.fn(),
      submitTimeOff: jest.fn(),
      getBatchBalances: jest.fn(),
    };
    client.getBatchBalances.mockRejectedValue(new Error('socket hang up'));

    const service = createService(client);

    await expect(service.getBatchBalances()).rejects.toMatchObject({
      type: HcmErrorType.TRANSIENT,
    });
  });
});
