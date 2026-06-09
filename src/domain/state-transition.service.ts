import { RequestStatus } from './enums';

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.DRAFT]: [RequestStatus.SUBMITTED],
  [RequestStatus.SUBMITTED]: [
    RequestStatus.PENDING_MANAGER_APPROVAL,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.PENDING_MANAGER_APPROVAL]: [
    RequestStatus.REJECTED,
    RequestStatus.APPROVED_PENDING_HCM,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.APPROVED_PENDING_HCM]: [
    RequestStatus.APPROVED,
    RequestStatus.FAILED_HCM_VALIDATION,
    RequestStatus.FAILED_HCM_SUBMISSION,
    RequestStatus.RECONCILIATION_REQUIRED,
  ],
  [RequestStatus.APPROVED]: [RequestStatus.CANCELLED],
  [RequestStatus.REJECTED]: [],
  [RequestStatus.CANCELLED]: [],
  [RequestStatus.FAILED_HCM_VALIDATION]: [RequestStatus.RECONCILIATION_REQUIRED],
  [RequestStatus.FAILED_HCM_SUBMISSION]: [
    RequestStatus.APPROVED,
    RequestStatus.RECONCILIATION_REQUIRED,
  ],
  [RequestStatus.RECONCILIATION_REQUIRED]: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(from: RequestStatus, to: RequestStatus) {
    super(`Invalid state transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class StateTransitionService {
  canTransition(from: RequestStatus, to: RequestStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  assertTransition(from: RequestStatus, to: RequestStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  isTerminal(status: RequestStatus): boolean {
    return [
      RequestStatus.REJECTED,
      RequestStatus.CANCELLED,
      RequestStatus.APPROVED,
      RequestStatus.FAILED_HCM_VALIDATION,
      RequestStatus.RECONCILIATION_REQUIRED,
    ].includes(status);
  }

  canCancel(status: RequestStatus): boolean {
    return [
      RequestStatus.SUBMITTED,
      RequestStatus.PENDING_MANAGER_APPROVAL,
      RequestStatus.APPROVED,
    ].includes(status);
  }
}
