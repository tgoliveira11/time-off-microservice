# Time-Off Microservice

NestJS REST microservice for ExampleHR time-off request lifecycle, local balance projection, and defensive HCM integration.

**Repository:** https://github.com/tgoliveira11/time-off-microservice

**Technical requirements (TDR):** [`docs/Time-Off-Microservice-Technical-Requirement-Document.pdf`](docs/Time-Off-Microservice-Technical-Requirement-Document.pdf)

This is a **take-home assignment implementation**. It is production-shaped in structure, but several concerns (auth, HCM, ops) are intentionally simplified or simulated.

## Architecture

```
API Layer (Controllers, Guards, DTOs)
    ↓
Application Services (TimeOffRequest, Balance, BatchImport, Reconciliation)
    ↓
Domain Layer (State transitions, balance rules, HCM error mapping, batch validation)
    ↓
Persistence (SQLite repositories, in-memory adapters, transactions, audit/outbox/idempotency)
    ↓
HCM Integration (HTTP client + in-process mock HCM server)
```

### REST vs GraphQL

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API style | **REST** | Workflow/command-oriented domain with explicit resources, status transitions, and idempotent write semantics |
| Database | **SQLite (default)** | Assignment requirement; short transactions for integrity |
| Offline persistence | **Optional in-memory** | Reviewer/offline environments without native SQLite bindings |
| Balance model | Local projection + HCM authority | Fast reads with HCM validation at approval and batch sync |
| HCM submission timing | Manager approval | HCM only receives final approved requests |
| Auth | Mock headers | `X-User-Id`, `X-User-Role` for test/demo only |

## Prerequisites

- Node.js 20+
- npm 10+
- **SQLite mode (default):** optional native dependency `better-sqlite3` (installed via `npm ci` or `npm install --include=optional`)

## SQLite mode dependency requirements

SQLite is the **default and canonical** persistence mode for this assignment.

SQLite mode requires the optional native dependency `better-sqlite3`. In a normal development environment, install dependencies with:

```bash
npm ci
```

If optional dependencies were skipped or the SQLite native dependency is missing, install optional dependencies explicitly:

```bash
npm install --include=optional
```

Depending on your OS and Node version, `better-sqlite3` may require native build tooling when a prebuilt binary is not available.

Examples:

* macOS: Xcode Command Line Tools
* Linux: Python, make, g++, and Node headers availability
* Windows: Visual Studio Build Tools

If you are in a restricted/offline environment where `better-sqlite3` cannot be downloaded or compiled, use the memory/offline mode instead (see [Offline / Memory Mode](#offline--memory-mode)). Memory mode does **not** replace the SQLite requirement for the canonical assignment deliverable.

## Setup (clean clone — SQLite mode)

```bash
git clone <repo-url> time-off-microservice
cd time-off-microservice
npm ci
npm run build
npm run start:dev
```

The service listens on `http://localhost:3000` by default.

## Persistence modes

SQLite remains the **default and canonical** persistence implementation required by the assignment. The optional in-memory mode exists to make the application runnable in restricted/offline review environments where native SQLite dependencies cannot be installed or compiled. It preserves the same application-level domain behavior but is not intended for production and does not replace the SQLite implementation.

| Mode | How to run | Notes |
|------|------------|-------|
| SQLite (default) | `npm run start:dev` | Canonical TRD mode; data in `./data/time-off.db` |
| SQLite (explicit) | `npm run start:dev:sqlite` | Same as default |
| In-memory | `npm run start:dev:memory` | Data lost on restart |
| Offline demo | `npm run start:offline` | In-memory + seeded demo data + in-process mock HCM |

### Environment variables (persistence)

| Variable | Values | Default | Behavior |
|----------|--------|---------|----------|
| `PERSISTENCE_MODE` | `sqlite`, `memory`, `auto` | `sqlite` | Selects persistence backend |
| `SEED_MEMORY_DATA` | `true` / unset | unset | When `memory` + `true`, seeds offline demo dataset |

`PERSISTENCE_MODE=auto` tries SQLite first; if initialization fails, falls back to in-memory with a warning log. SQLite failures are **not** silently ignored unless `auto` is explicitly set.

`better-sqlite3` is an **optional dependency**. It is loaded only when `PERSISTENCE_MODE=sqlite` (or when `auto` successfully selects SQLite). Memory/offline mode does not import, initialize, or require `better-sqlite3`.

## Offline / Memory Mode

SQLite is the default and canonical persistence mode required by the assignment.

For restricted environments where the native `better-sqlite3` dependency cannot be compiled or downloaded, the service can run in memory mode:

```bash
npm ci --ignore-scripts
npm run build
npm run start:offline
```

Memory mode does not load `better-sqlite3`. It preserves the same application-level domain behavior for review/demo purposes, but it is not production persistence and data is lost on restart.

Memory-only tests:

```bash
npm run test:memory
```

Full SQLite validation still requires a normal environment with native dependency support:

```bash
npm ci
npm test
npm run test:cov
```

### Offline demo (`npm run start:offline`)

Seeded entities (when `PERSISTENCE_MODE=memory` and `SEED_MEMORY_DATA=true`):

| Entity | ID | Notes |
|--------|-----|-------|
| Employee | `emp_123` | Reports to `mgr_001` |
| Manager | `mgr_001` | |
| Location | `loc_001` | |
| Balance | `emp_123` @ `loc_001` | 10 DAYS available (local projection) |
| Mock HCM balance | `emp_123` @ `loc_001` | 10 DAYS (seeded in mock HCM for approval flow) |

Example headers:

```bash
curl -H "X-User-Id: emp_123" -H "X-User-Role: EMPLOYEE" http://localhost:3000/employees/emp_123/balances
curl -H "X-User-Id: mgr_001" -H "X-User-Role: MANAGER" http://localhost:3000/managers/mgr_001/time-off-requests
```

Example create request:

```bash
curl -X POST http://localhost:3000/time-off-requests \
  -H "Content-Type: application/json" \
  -H "X-User-Id: emp_123" -H "X-User-Role: EMPLOYEE" \
  -d '{"employeeId":"emp_123","locationId":"loc_001","amount":1,"unit":"DAYS","startDate":"2026-07-01","endDate":"2026-07-01"}'
```

The mock HCM runs in the same process at `/mock-hcm` — no internet or separate service required.

### Database setup / migrations

There is no separate migration runner for this assignment.

- SQLite schema is applied automatically on startup from `src/database/schema.sql` via `DatabaseService.onModuleInit()`.
- Default database file: `./data/time-off.db`
- Override with `DATABASE_PATH=/path/to/time-off.db`

To reset locally, stop the app and delete the SQLite file, then restart.

## Mock HCM server

The mock HCM runs **in the same NestJS process** under `/mock-hcm` (no separate process required).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/mock-hcm/employees/:employeeId/locations/:locationId/balance` | Real-time balance lookup |
| POST | `/mock-hcm/time-off` | Approved time-off submission |
| GET | `/mock-hcm/balances/batch` | Batch balance corpus |
| POST | `/mock-hcm/test/seed` | Seed mock balances/scenarios |
| POST | `/mock-hcm/test/reset` | Reset mock HCM state |

Scenario support includes `timeout`, `timeout_after_accept`, `transient_error`, `invalid_dimension`, malformed batch payloads, and duplicate submission behavior.

```bash
export HCM_BASE_URL=http://localhost:3000/mock-hcm
export HCM_TIMEOUT_MS=5000
npm run start:dev
```

## REST API documentation

- Swagger UI: [http://localhost:3000/api](http://localhost:3000/api)
- Health check: [http://localhost:3000/health](http://localhost:3000/health)
- Metrics (process-local): [http://localhost:3000/metrics](http://localhost:3000/metrics)

### Correlation ID

All HTTP requests support `X-Correlation-Id`:

- If the client sends the header, the same value is echoed on the response.
- If missing, the service generates a UUID and returns it.
- Correlation IDs are attached to structured logs for key lifecycle and HCM events.

Metrics counters are **process-local** and reset on application restart. See `GET /metrics` for current values.

### Authentication (mock)

| Header | Example | Roles |
|--------|---------|-------|
| `X-User-Id` | `emp_123` | Any user ID |
| `X-User-Role` | `EMPLOYEE` | `EMPLOYEE`, `MANAGER`, `SYSTEM_ADMIN`, `SYSTEM_INTEGRATION` |

### Write HTTP status codes

| Code | Meaning |
|------|---------|
| `200 OK` | Completed successful state transition |
| `202 Accepted` | Accepted locally; HCM processing/retry still pending |
| `409 Conflict` | Insufficient balance, invalid transition, idempotency mismatch, duplicate HCM mismatch, reconciliation required |
| `422 Unprocessable Entity` | Valid JSON with invalid business input |
| `503 Service Unavailable` | HCM outage when operation cannot complete inline |

`POST /system/reconciliation/run` returns **`200 OK`** on success (explicit `@HttpCode`).

## Test commands

### Offline memory-mode tests

```bash
npm run test:memory
```

Runs the memory/offline-compatible test suite (**16 tests**, 3 suites). This mode does **not** require SQLite or `better-sqlite3`.

### Canonical SQLite test suite

```bash
npm test
```

Runs the full canonical test suite using SQLite persistence (**194 tests**, 44 suites). This requires `better-sqlite3`.

### Official coverage proof

```bash
npm run test:cov
```

Runs the full coverage suite against the canonical SQLite implementation. This requires SQLite and `better-sqlite3`. See [`COVERAGE_PROOF.md`](COVERAGE_PROOF.md) for the latest verified output.

The official coverage proof for the assignment must come from `npm run test:cov`, not only from `npm run test:memory`.

### Additional test targets

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:contract
```

## Verification commands

For restricted/offline environments (no SQLite native dependency):

```bash
npm run verify:offline
```

Runs `npm run build && npm run test:memory`. Does not require `better-sqlite3`.

For the **canonical assignment validation** (SQLite + official coverage):

```bash
npm run verify:sqlite
```

Runs `npm run build && npm test && npm run test:cov`. Requires `better-sqlite3`.

`verify:sqlite` is the authoritative validation path for the assignment because SQLite is the required persistence mode.

## Final verification (canonical SQLite quality gate)

Run from a clean environment with native dependency support:

```bash
npm ci
npm install --include=optional   # only if optional deps were skipped
npm run build
npm test
npm run test:cov
```

Or use the bundled script:

```bash
npm run verify:sqlite
```

Expected results (latest verified run — see [`COVERAGE_PROOF.md`](COVERAGE_PROOF.md)):

| Check | Expected |
|-------|----------|
| Build | succeeds |
| Canonical SQLite tests (`npm test`) | **194 passing**, 44 suites |
| Memory/offline tests (`npm run test:memory`) | **16 passing**, 3 suites (separate; not official coverage proof) |
| Coverage thresholds | all pass |

| Metric | Threshold | Latest |
|--------|-----------|--------|
| Branches | 85% | **85.06%** |
| Functions | 90% | **95.72%** |
| Lines | 90% | **94.38%** |
| Statements | 90% | **94.41%** |

Coverage collection focuses on domain, services, repositories, and HCM integration code. Excluded from coverage (with reason):

| Excluded path | Reason |
|---------------|--------|
| `src/main.ts` | Application bootstrap only |
| `src/common/logging/correlation.service.ts` | Thin AsyncLocalStorage helper (covered via observability integration tests) |
| `src/database/persistence-mode.ts` | Bootstrap/env probe utility |
| `src/modules/mock-hcm/**` | Simulated external HCM server |
| `src/**/*.module.ts` | Nest wiring only |

## Runtime scripts

```bash
npm run start:dev          # SQLite (default)
npm run start:dev:sqlite   # explicit SQLite
npm run start:dev:memory   # in-memory persistence
npm run start:offline      # memory + seeded demo data
```

## Idempotency behavior

Idempotency records are scoped by operation, actor, resource, and payload hash.

**Create request rules:**

| Case | Result |
|------|--------|
| Same employee + same key + same payload | Returns original cached response (`200 OK`) |
| Same employee + same key + different payload | `409 Conflict`: `Idempotency key reused with different payload` |
| Different employees + same key | Fully isolated (separate scopes) |

Authorization is always checked **before** returning a cached idempotency response.

## HCM timeout, retry, and timeout-after-accept strategy

### Timeouts

All HCM HTTP calls use shared `fetchHcmWithTimeout()` with `AbortController` and `HCM_TIMEOUT_MS`.

### Inline retry vs business retry

| Error type | Marked retryable? | Inline auto-retry in `HcmClientService`? | Why |
|------------|-------------------|---------------------------------------------|-----|
| `TRANSIENT` (5xx/network) | Yes | **Yes** | Safe to retry immediately |
| `TIMEOUT` | Yes | **No** | HCM may have accepted the operation before the client timed out |

`TIMEOUT` is marked retryable for **classification and business-level retry**, not for immediate inline resubmission. Inline retry of timeouts could double-consume HCM balance.

### Timeout-after-accept flow

1. Approval submits to HCM with stable `externalRequestId` (= local `requestId`).
2. If HCM accepts but the client times out, the request moves to `FAILED_HCM_SUBMISSION` (`202 Accepted`).
3. Retry uses the same `externalRequestId`.
4. If HCM returns duplicate for that ID, the service treats it as idempotent success when the transaction matches.
5. If duplicate is confirmed but balance lookup fails, the request is marked `RECONCILIATION_REQUIRED` without inventing balances.
6. Status history records the **actual** previous status (e.g. `FAILED_HCM_SUBMISSION -> APPROVED`).

## Batch import behavior

Two distinct failure classes:

### Payload validation failures (fail the job safely)

Malformed corpus, missing required fields, duplicate rows in the same batch, invalid units, negative balances, or corrupted HCM responses cause the sync job to be marked **failed** and the API returns **`422 Unprocessable Entity`**. No balance rows are updated and no requests are marked `RECONCILIATION_REQUIRED` for these payload-level errors.

### Business conflicts during valid batch processing

When the batch payload is valid but business conflicts exist:

- `reservedBalance > imported hcmBalance` → affected balance/request marked `RECONCILIATION_REQUIRED`
- local employee/location combinations missing from the HCM corpus → marked `RECONCILIATION_REQUIRED`
- reservations are preserved; `availableBalance` is recalculated from HCM balance minus reserved amount

## Reconciliation behavior

`POST /system/reconciliation/run` compares local projections against HCM real-time balances and records issues. It returns **`200 OK`** on success. It does not auto-mutate request state beyond audit/sync job records.

Administrative request status overrides use `forceUpdateStatusForSystemReconciliation()` in the repository — an explicit escape hatch for batch-import reconciliation fallback, not for normal lifecycle transitions.

## SQLite limitations

SQLite is used intentionally for the assignment, but it is **not** a production-grade concurrency engine for this workload:

- No true row-level locking equivalent to PostgreSQL `SELECT ... FOR UPDATE`
- Concurrent writers can race despite short transactions
- Integrity is enforced with conditional SQL updates and affected-row checks
- Under high concurrency, expect more `409 Conflict` responses rather than silent corruption

Production would use PostgreSQL (or similar) with explicit locking and background workers.

## In-memory mode limitations

- Data is lost on restart.
- Not a replacement for SQLite in the TRD deliverable.
- Uses snapshot/rollback transaction simulation (not SQLite WAL semantics).
- Intended for offline/demo/reviewer environments only.

## Known limitation: HCM cancellation/reversal

Approved request cancellation against HCM is intentionally **out of scope** for this take-home implementation.

The service documents **local cancellation** behavior where applicable (including releasing reservations for pending requests and transitioning approved requests to `CANCELLED` locally), but a production implementation should add:

- an HCM cancellation/reversal endpoint;
- a cancellation-pending-HCM state;
- idempotent reversal submission;
- retry handling;
- reconciliation for reversal failures;
- audit and status history for HCM reversal attempts.

No document or API should be read as implementing full HCM cancellation/reversal.

## Request lifecycle

`DRAFT → SUBMITTED → PENDING_MANAGER_APPROVAL → APPROVED_PENDING_HCM → APPROVED`

Failure / exception paths: `FAILED_HCM_VALIDATION`, `FAILED_HCM_SUBMISSION`, `RECONCILIATION_REQUIRED`, `REJECTED`, `CANCELLED`.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `./data/time-off.db` | SQLite file path |
| `HCM_BASE_URL` | `http://localhost:3000/mock-hcm` | HCM client base URL |
| `HCM_TIMEOUT_MS` | `5000` | HCM request timeout in milliseconds |
| `PERSISTENCE_MODE` | `sqlite` | `sqlite`, `memory`, or `auto` |
| `SEED_MEMORY_DATA` | unset | Set `true` with memory mode to seed offline demo data |

## Known limitations (assignment scope)

| Area | Implemented | Simulated / limited |
|------|-------------|---------------------|
| Authentication | Header-based mock auth + role guards | No OAuth/JWT |
| HCM | HTTP client + in-process mock | No real HRIS integration |
| Async processing | Outbox records written | No background worker |
| Batch import | On-demand system endpoint | No scheduled cron |
| Observability | Structured logs, correlation ID middleware, `GET /metrics` | No distributed tracing backend |
| HCM cancellation | Local cancel for pending/non-HCM-reversed flows | No HCM reversal/cancellation API |
| Security | Validation + role checks | Mock HCM endpoints are public for testing |

## What is real vs simulated

**Real:** REST API, validation, domain rules, SQLite persistence, transactions, audit logs, idempotency store, conditional balance updates, status history, sync jobs, HCM error mapping, timeout handling, batch validation, reconciliation reporting.

**Simulated:** HCM system, identity/authentication, outbox delivery, enterprise ops tooling.
