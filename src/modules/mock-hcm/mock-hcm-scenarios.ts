export enum MockHcmBalanceLookupScenario {
  INVALID_DIMENSION = 'invalid_dimension',
  DIMENSION_CONFLICT = 'dimension_conflict',
  TRANSIENT_ERROR = 'transient_error',
  TIMEOUT = 'timeout',
}

export enum MockHcmSubmitScenario {
  INVALID_DIMENSION = 'invalid_dimension',
  DUPLICATE_FOREIGN = 'duplicate_foreign',
  TRANSIENT_ERROR = 'transient_error',
  TIMEOUT_AFTER_ACCEPT = 'timeout_after_accept',
  SUBMIT_TIMEOUT = 'submit_timeout',
}

export enum MockHcmBatchScenario {
  TIMEOUT = 'timeout',
  CORRUPTED = 'corrupted',
  PARTIAL = 'partial',
  MALFORMED = 'malformed',
  DUPLICATE_ROWS = 'duplicate_rows',
  NEGATIVE = 'negative',
  MISSING_EMPLOYEE = 'missing_employee',
}
