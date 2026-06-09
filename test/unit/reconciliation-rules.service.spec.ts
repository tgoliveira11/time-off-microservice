import { ReconciliationRulesService } from '../../src/domain/reconciliation-rules.service';
import { ReconciliationIssueType } from '../../src/domain/enums';

describe('ReconciliationRulesService', () => {
  const service = new ReconciliationRulesService();

  it('detects reserved exceeds hcm balance', () => {
    const issue = service.evaluateReservedExceedsHcm(
      'emp_1',
      'loc_1',
      5,
      8,
    );
    expect(issue?.type).toBe(
      ReconciliationIssueType.LOCAL_RESERVED_EXCEEDS_HCM_BALANCE,
    );
  });

  it('returns null when reserved is valid', () => {
    const issue = service.evaluateReservedExceedsHcm(
      'emp_1',
      'loc_1',
      10,
      2,
    );
    expect(issue).toBeNull();
  });
});
