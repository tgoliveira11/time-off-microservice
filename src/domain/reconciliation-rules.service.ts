import {
  ReconciliationIssueType,
  ReconciliationSeverity,
} from './enums';

export interface ReconciliationIssue {
  type: ReconciliationIssueType;
  employeeId: string;
  locationId: string;
  severity: ReconciliationSeverity;
  details?: string;
}

export class ReconciliationRulesService {
  evaluateReservedExceedsHcm(
    employeeId: string,
    locationId: string,
    hcmBalance: number,
    reservedBalance: number,
  ): ReconciliationIssue | null {
    if (reservedBalance > hcmBalance) {
      return {
        type: ReconciliationIssueType.LOCAL_RESERVED_EXCEEDS_HCM_BALANCE,
        employeeId,
        locationId,
        severity: ReconciliationSeverity.HIGH,
        details: `Reserved ${reservedBalance} exceeds HCM balance ${hcmBalance}`,
      };
    }
    return null;
  }

  evaluateBalanceMismatch(
    employeeId: string,
    locationId: string,
    localHcmBalance: number,
    remoteHcmBalance: number,
    reservedBalance: number,
  ): ReconciliationIssue | null {
    const expectedAvailable = Math.max(0, remoteHcmBalance - reservedBalance);
    const localAvailable = Math.max(0, localHcmBalance - reservedBalance);

    if (
      localHcmBalance !== remoteHcmBalance &&
      localAvailable !== expectedAvailable
    ) {
      return {
        type: ReconciliationIssueType.LOCAL_HCM_BALANCE_MISMATCH,
        employeeId,
        locationId,
        severity: ReconciliationSeverity.MEDIUM,
        details: `Local HCM ${localHcmBalance} vs remote ${remoteHcmBalance}`,
      };
    }
    return null;
  }
}
