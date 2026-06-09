CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  hcm_employee_id TEXT UNIQUE NOT NULL,
  manager_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  hcm_location_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  hcm_balance REAL NOT NULL DEFAULT 0,
  reserved_balance REAL NOT NULL DEFAULT 0,
  available_balance REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'DAYS',
  hcm_version TEXT NULL,
  last_hcm_sync_at TEXT NULL,
  reconciliation_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  UNIQUE (employee_id, location_id),
  CHECK (hcm_balance >= 0),
  CHECK (reserved_balance >= 0)
);

CREATE TABLE IF NOT EXISTS time_off_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  amount REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'DAYS',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL,
  manager_id TEXT NULL,
  hcm_transaction_id TEXT NULL,
  idempotency_key TEXT NULL,
  failure_reason TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  UNIQUE (employee_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS request_status_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NULL,
  reason TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES time_off_requests(id)
);

CREATE TABLE IF NOT EXISTS hcm_sync_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NULL,
  completed_at TEXT NULL,
  error_message TEXT NULL,
  result_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_balances_employee ON balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON time_off_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_manager ON time_off_requests(manager_id);
CREATE INDEX IF NOT EXISTS idx_status_history_request ON request_status_history(request_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status);
