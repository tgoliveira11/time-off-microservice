import { StateTransitionService } from '../../src/domain/state-transition.service';
import { RequestStatus } from '../../src/domain/enums';

describe('StateTransitionService extended', () => {
  const service = new StateTransitionService();

  it('allows cancellation from submitted and pending states', () => {
    expect(service.canCancel(RequestStatus.SUBMITTED)).toBe(true);
    expect(service.canCancel(RequestStatus.PENDING_MANAGER_APPROVAL)).toBe(true);
    expect(service.canCancel(RequestStatus.APPROVED)).toBe(true);
    expect(service.canCancel(RequestStatus.REJECTED)).toBe(false);
  });

  it('allows approved pending hcm transitions', () => {
    expect(
      service.canTransition(
        RequestStatus.APPROVED_PENDING_HCM,
        RequestStatus.FAILED_HCM_SUBMISSION,
      ),
    ).toBe(true);
  });
});
