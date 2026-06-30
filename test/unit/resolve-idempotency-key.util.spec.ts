import { resolveIdempotencyKey } from '../../src/common/http/resolve-idempotency-key.util';

describe('resolveIdempotencyKey', () => {
  it('prefers the header over the body field', () => {
    expect(resolveIdempotencyKey('header-key', 'body-key')).toBe('header-key');
  });

  it('falls back to the body field when header is missing', () => {
    expect(resolveIdempotencyKey(undefined, 'body-key')).toBe('body-key');
  });

  it('trims whitespace and ignores empty values', () => {
    expect(resolveIdempotencyKey('  header-key  ', ' body-key ')).toBe('header-key');
    expect(resolveIdempotencyKey('   ', 'body-key')).toBe('body-key');
    expect(resolveIdempotencyKey(undefined, undefined)).toBeUndefined();
  });
});
