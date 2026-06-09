import { StateTransitionService, InvalidStateTransitionError } from '../../src/domain/state-transition.service';
import { RequestStatus } from '../../src/domain/enums';

describe('StateTransitionService', () => {
  const service = new StateTransitionService();

  it('allows draft to submitted', () => {
    expect(
      service.canTransition(RequestStatus.DRAFT, RequestStatus.SUBMITTED),
    ).toBe(true);
  });

  it('allows pending manager approval to approved pending hcm', () => {
    expect(
      service.canTransition(
        RequestStatus.PENDING_MANAGER_APPROVAL,
        RequestStatus.APPROVED_PENDING_HCM,
      ),
    ).toBe(true);
  });

  it('rejects rejected to approved', () => {
    expect(
      service.canTransition(RequestStatus.REJECTED, RequestStatus.APPROVED),
    ).toBe(false);
  });

  it('throws on invalid transition', () => {
    expect(() =>
      service.assertTransition(RequestStatus.CANCELLED, RequestStatus.APPROVED),
    ).toThrow(InvalidStateTransitionError);
  });

  it('identifies terminal statuses', () => {
    expect(service.isTerminal(RequestStatus.APPROVED)).toBe(true);
    expect(service.isTerminal(RequestStatus.PENDING_MANAGER_APPROVAL)).toBe(
      false,
    );
  });
});
