import {
  buildApproveRequestScope,
  buildBatchImportScope,
  buildCreateRequestScope,
  hashCreateRequestPayload,
  hashPayload,
} from '../../src/common/idempotency/idempotency-scope.util';

describe('Idempotency scope utilities', () => {
  it('hashes create payloads deterministically', () => {
    const payload = {
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-11',
    };
    expect(hashCreateRequestPayload(payload)).toBe(hashCreateRequestPayload(payload));
  });

  it('builds distinct create scopes per employee', () => {
    const payload = {
      employeeId: 'emp_1',
      locationId: 'loc_1',
      amount: 2,
      unit: 'DAYS',
      startDate: '2026-02-10',
      endDate: '2026-02-11',
    };

    const scopeA = buildCreateRequestScope('emp_1', 'key-1', payload);
    const scopeB = buildCreateRequestScope('emp_2', 'key-1', {
      ...payload,
      employeeId: 'emp_2',
    });

    expect(scopeA).not.toBe(scopeB);
    expect(scopeA).toContain('create-request');
    expect(scopeA).toContain('emp_1');
    expect(scopeA).toContain('key-1');
    expect(scopeA).toContain(hashPayload(payload));
  });

  it('builds distinct approve scopes per manager and request', () => {
    const scopeA = buildApproveRequestScope('req_1', 'mgr_1', 'key-1');
    const scopeB = buildApproveRequestScope('req_2', 'mgr_1', 'key-1');
    const scopeC = buildApproveRequestScope('req_1', 'mgr_2', 'key-1');

    expect(scopeA).not.toBe(scopeB);
    expect(scopeA).not.toBe(scopeC);
  });

  it('builds batch import scope by system actor', () => {
    const scope = buildBatchImportScope('system', 'batch-key');
    expect(scope).toBe('batch-import:system:batch-key');
  });

  it('hashes payloads deterministically', () => {
    const first = hashPayload({ b: 2, a: 1 });
    const second = hashPayload({ a: 1, b: 2 });
    expect(first).toBe(second);
  });
});
