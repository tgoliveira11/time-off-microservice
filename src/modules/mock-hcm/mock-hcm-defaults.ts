import {
  DEMO_BALANCE,
  DEMO_EMPLOYEE_ID,
  DEMO_LOCATION_ID,
} from '../../demo/demo-dataset.constants';
import { MockBalance } from './mock-hcm.service';

export const DEFAULT_MOCK_HCM_BALANCE: MockBalance = {
  employeeId: DEMO_EMPLOYEE_ID,
  locationId: DEMO_LOCATION_ID,
  balance: DEMO_BALANCE,
  unit: 'DAYS',
  version: 'v1',
};

export const DEFAULT_MOCK_HCM_SEED = {
  balances: [DEFAULT_MOCK_HCM_BALANCE],
};
