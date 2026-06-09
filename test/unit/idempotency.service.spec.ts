import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { IdempotencyRepository } from '../../src/database/repositories/idempotency.repository';

describe('IdempotencyService', () => {
  const repository = {
    find: jest.fn(),
    save: jest.fn(),
  };
  const service = new IdempotencyService(
    repository as unknown as IdempotencyRepository,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null when idempotency key is missing', () => {
    expect(service.getCached('scope', undefined)).toBeNull();
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('returns cached payload when present', () => {
    repository.find.mockReturnValue({ requestId: 'req_1' });
    expect(service.getCached('scope', 'key-1')).toEqual({ requestId: 'req_1' });
  });

  it('skips save when idempotency key is missing', () => {
    service.save('scope', undefined, { ok: true });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('persists response when idempotency key is provided', () => {
    service.save('scope', 'key-1', { ok: true });
    expect(repository.save).toHaveBeenCalledWith('scope', 'key-1', { ok: true });
  });
});
