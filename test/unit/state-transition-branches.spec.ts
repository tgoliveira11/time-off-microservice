import { StateTransitionService } from '../../src/domain/state-transition.service';
import { RequestStatus } from '../../src/domain/enums';

describe('StateTransitionService branches', () => {
  const service = new StateTransitionService();

  it('returns false for unknown source statuses', () => {
    expect(
      service.canTransition('UNKNOWN' as RequestStatus, RequestStatus.APPROVED),
    ).toBe(false);
  });

  it('identifies terminal and cancellable states', () => {
    expect(service.isTerminal(RequestStatus.APPROVED)).toBe(true);
    expect(service.isTerminal(RequestStatus.PENDING_MANAGER_APPROVAL)).toBe(false);
    expect(service.canCancel(RequestStatus.APPROVED)).toBe(true);
    expect(service.canCancel(RequestStatus.REJECTED)).toBe(false);
  });
});
