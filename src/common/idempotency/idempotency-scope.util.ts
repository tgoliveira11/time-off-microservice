import { createHash } from 'crypto';
import { AuthUser } from '../auth/auth.types';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function buildIdempotencyScope(parts: string[]): string {
  return parts.filter(Boolean).join(':');
}

export function hashCreateRequestPayload(payload: {
  employeeId: string;
  locationId: string;
  amount: number;
  unit: string;
  startDate: string;
  endDate: string;
}): string {
  return hashPayload(payload);
}

export function buildCreateRequestScope(
  employeeId: string,
  idempotencyKey: string,
  payload: unknown,
): string {
  return buildIdempotencyScope([
    'create-request',
    employeeId,
    idempotencyKey,
    hashPayload(payload),
  ]);
}

export function buildApproveRequestScope(
  requestId: string,
  managerId: string,
  idempotencyKey: string,
): string {
  return buildIdempotencyScope([
    'approve-request',
    requestId,
    managerId,
    idempotencyKey,
    hashPayload({ requestId }),
  ]);
}

export function buildRejectRequestScope(
  requestId: string,
  managerId: string,
  idempotencyKey: string,
  payload: unknown,
): string {
  return buildIdempotencyScope([
    'reject-request',
    requestId,
    managerId,
    idempotencyKey,
    hashPayload(payload),
  ]);
}

export function buildCancelRequestScope(
  requestId: string,
  actorId: string,
  actorRole: string,
  idempotencyKey: string,
): string {
  return buildIdempotencyScope([
    'cancel-request',
    requestId,
    actorId,
    actorRole,
    idempotencyKey,
    hashPayload({ requestId }),
  ]);
}

export function buildBatchImportScope(
  systemActorId: string,
  idempotencyKey: string,
): string {
  return buildIdempotencyScope([
    'batch-import',
    systemActorId,
    idempotencyKey,
  ]);
}

export function actorIdentity(user: AuthUser): string {
  return `${user.role}:${user.id}`;
}
