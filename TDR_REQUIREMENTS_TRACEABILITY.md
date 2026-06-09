# TDR Requirements Traceability Matrix

**Project:** Time-Off Microservice  
**TDR:** Time-Off Microservice Technical Requirement Document  
**Implementation path:** `/Users/thiago.oliveira/Projects/time-off-microservice`  
**API style:** REST (NestJS)  
**Last verified:** 194/194 canonical SQLite tests passing (44 suites); 16 memory/offline tests (3 suites); coverage thresholds pass — see `COVERAGE_PROOF.md`

This document maps each TDR requirement to the REST API(s) that satisfy it, the supporting implementation layer, and the automated tests that verify the behavior.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **API** | Direct REST endpoint exposure |
| **Service** | Application/domain service (no dedicated public endpoint) |
| **Infra** | Persistence, middleware, or background mechanism |
| **Mock** | Mock HCM endpoint (test/dev only) |

---

## 1. Functional Goals (TDR §3.1)

| # | TDR Requirement | API(s) | Supporting Implementation | Verified By |
|---|-----------------|--------|---------------------------|-------------|
| F1 | Allow employees to view available time-off balances by employee and location | `GET /employees/:employeeId/balances` | `BalanceService.getEmployeeBalances`, `BalanceRepository` | `test/integration/time-off-request.integration.spec.ts`, `test/e2e/time-off.e2e-spec.ts` |
| F2 | Allow employees to create time-off requests | `POST /time-off-requests` | `TimeOffRequestService.createRequest` | Integration + E2E + regression tests |
| F3 | Allow employees to cancel time-off requests | `POST /time-off-requests/:requestId/cancel` | `TimeOffRequestService.cancelRequest` | `test/integration/regression.integration.spec.ts` |
| F4 | Allow employees to view time-off requests | `GET /time-off-requests/:requestId` | `TimeOffRequestService.getRequest`, `StatusHistoryRepository` | E2E happy-path test |
| F5 | Allow managers to approve pending requests | `POST /time-off-requests/:requestId/approve` | `TimeOffRequestService.approveRequest`, HCM client | Integration + E2E + regression tests |
| F6 | Allow managers to reject pending requests | `POST /time-off-requests/:requestId/reject` | `TimeOffRequestService.rejectRequest` | Integration test (reject releases balance) |
| F7 | Allow managers to list pending requests | `GET /managers/:managerId/time-off-requests` | `TimeOffRequestService.listPendingForManager` | Covered by manager approval flow tests |
| F8 | Validate time-off requests against local available balance before submission | `POST /time-off-requests` → **409** when insufficient | `BalanceCalculatorService.assertSufficientBalance`, transactional reservation in `BalanceRepository.reserveBalance` | Integration test (insufficient balance at request time) |
| F9 | Validate requests with HCM before/during final approval | `POST /time-off-requests/:requestId/approve` (calls HCM real-time lookup) | `HcmClientService.getRealtimeBalance` inside `approveRequest` | E2E test (insufficient balance at approval) |
| F10 | Submit approved time-off requests to HCM | `POST /time-off-requests/:requestId/approve` (calls HCM submission) | `HcmClientService.submitTimeOff` with `externalRequestId` | E2E happy path + contract tests |
| F11 | Import full balance corpus from HCM batch endpoints | `POST /system/hcm/balances/batch-import` | `BatchImportService.runBatchImport` → `GET /mock-hcm/balances/batch` | Integration + E2E + regression tests |
| F12 | Support real-time HCM balance lookup | `POST /employees/:employeeId/locations/:locationId/balances/refresh` | `BalanceService.refreshBalance` → `GET /mock-hcm/employees/:employeeId/locations/:locationId/balance` | `test/integration/regression.integration.spec.ts` |
| F13 | Reconcile local projected balances against HCM authoritative data | `POST /system/reconciliation/run` | `ReconciliationService.runReconciliation` | `test/integration/regression.integration.spec.ts` |
| F14 | Maintain full request lifecycle history and audit trail | `GET /time-off-requests/:requestId` (includes `statusHistory`) | `request_status_history` table, `StatusHistoryRepository`, `AuditService` / `audit_logs` | E2E happy path |
| F15 | Prevent duplicate requests and duplicate HCM submissions | `POST /time-off-requests`, `/approve`, `/reject`, `/cancel` with `Idempotency-Key` header | `IdempotencyService`, `idempotency_records`, HCM `externalRequestId` | Integration idempotency test + contract duplicate test + regression double-approval test |
| F16 | Handle invalid dimensions, insufficient balances, stale balances, HCM downtime, inconsistent HCM responses | See §4 (Failure Handling Matrix) | `HcmErrorMapperService`, `RetryClassifierService`, reconciliation + failed statuses | E2E, contract, integration, regression tests |

---

## 2. Non-Functional Goals (TDR §3.2)

| # | TDR Requirement | Primary API Surface | Supporting Implementation | Verified By |
|---|-----------------|---------------------|---------------------------|-------------|
| NF1 | Reliability — resilient to temporary HCM failures | `POST /time-off-requests/:requestId/approve` | Exponential backoff in `HcmClientService`; statuses `FAILED_HCM_SUBMISSION`, `APPROVED_PENDING_HCM` | Contract tests (transient/duplicate handling) |
| NF2 | Data integrity — no double balance consumption | `POST /time-off-requests`, `/approve` | SQLite or in-memory transactions via `TransactionManagerPort`, idempotency, conditional repository updates | Regression + integration + memory persistence tests |
| NF3 | Observability — log and trace important operations | All write APIs + `GET /metrics` | `CorrelationMiddleware`, `StructuredEventLogger`, `MetricsService`, `AuditService` | `test/integration/observability.integration.spec.ts` |
| NF4 | Testability — rigorous automated tests + mock HCM | All APIs + Mock HCM | `test/` suite (unit, integration, E2E, contract, regression, observability, memory) | `npm test` — **194 tests** (canonical SQLite); `npm run test:memory` — **16 tests** (offline) |
| NF5 | Maintainability — modular NestJS structure | N/A (architecture) | Layered modules: `domain/`, `modules/`, `database/`, `common/` | Code structure review |
| NF6 | Security — authorization and role enforcement | All authenticated APIs | `AuthGuard`, `EmployeeAccessGuard`, `@Roles()` decorator | Integration unauthorized manager test; E2E cross-employee access test |
| NF7 | Idempotency — repeated calls must not duplicate side effects | All write APIs listed in §3 | `Idempotency-Key` header + `IdempotencyRepository` | Integration + regression tests |
| NF8 | Defensive design — do not blindly trust HCM as only safeguard | `POST /time-off-requests/:requestId/approve` | Local validation first, HCM validation at approval, reconciliation jobs | E2E insufficient-at-approval test |

---

## 3. TDR API Design → Implemented Endpoints (TDR §11)

### 3.1 Employee APIs

| TDR Endpoint | Implemented Endpoint | Match | Notes |
|--------------|---------------------|-------|-------|
| `GET /employees/:employeeId/balances` | `GET /employees/:employeeId/balances` | ✅ Exact | Returns `hcmBalance`, `reservedBalance`, `availableBalance`, `unit`, `lastHcmSyncAt` |
| `POST /employees/:employeeId/locations/:locationId/balances/refresh` | `POST /employees/:employeeId/locations/:locationId/balances/refresh` | ✅ Exact | Preserves local reservations; updates HCM projection |
| `POST /time-off-requests` | `POST /time-off-requests` | ✅ Exact | Supports `Idempotency-Key`; reserves balance; status → `PENDING_MANAGER_APPROVAL` |
| `GET /time-off-requests/:requestId` | `GET /time-off-requests/:requestId` | ✅ Exact | Returns request + status history + HCM transaction ID when present |
| `POST /time-off-requests/:requestId/cancel` | `POST /time-off-requests/:requestId/cancel` | ✅ Exact | Releases reservation for non-approved requests |

### 3.2 Manager APIs

| TDR Endpoint | Implemented Endpoint | Match | Notes |
|--------------|---------------------|-------|-------|
| `GET /managers/:managerId/time-off-requests?status=PENDING_MANAGER_APPROVAL` | `GET /managers/:managerId/time-off-requests` | ✅ Exact* | Filters by `PENDING_MANAGER_APPROVAL` in service layer |
| `POST /time-off-requests/:requestId/approve` | `POST /time-off-requests/:requestId/approve` | ✅ Exact | HCM lookup + submission; supports `Idempotency-Key` |
| `POST /time-off-requests/:requestId/reject` | `POST /time-off-requests/:requestId/reject` | ✅ Exact | Body: `{ "reason": "..." }`; releases reservation |

### 3.3 System APIs

| TDR Endpoint | Implemented Endpoint | Match | Notes |
|--------------|---------------------|-------|-------|
| `POST /system/hcm/balances/batch-import` | `POST /system/hcm/balances/batch-import` | ✅ Exact | Returns `jobId`, `status`, `importedBalances`, `reconciliationRequired` |
| `POST /system/reconciliation/run` | `POST /system/reconciliation/run` | ✅ Exact | Returns `jobId`, `status`, `issues[]` |
| `GET /health` | `GET /health` | ✅ Exact | Returns `status`, `database`, `hcmMock` |

---

## 4. Mock HCM APIs (TDR §12)

| TDR Mock Endpoint | Implemented Endpoint | Match | Scenarios Supported |
|-------------------|---------------------|-------|---------------------|
| `GET /mock-hcm/employees/:employeeId/locations/:locationId/balance` | Same | ✅ | Success, 404 invalid dimension, 409 conflict, 500 transient, timeout |
| `POST /mock-hcm/time-off` | Same | ✅ | Success, 400 invalid dimensions, 409 insufficient/duplicate, 500 transient, timeout-after-accept |
| `GET /mock-hcm/balances/batch` | Same | ✅ | Full corpus, partial payload, corrupted payload |
| *(not in TDR, added for testing)* | `POST /mock-hcm/test/seed` | ➕ Extra | Seed mock state in tests |
| *(not in TDR, added for testing)* | `POST /mock-hcm/test/reset` | ➕ Extra | Reset mock state in tests |

---

## 5. Failure Handling Matrix (TDR §13)

| Failure Scenario | API Where It Surfaces | HTTP Status | Resulting Request Status / Behavior |
|------------------|----------------------|-------------|-------------------------------------|
| Insufficient local balance at request time | `POST /time-off-requests` | **409 Conflict** | No request persisted |
| Invalid payload / business rule | `POST /time-off-requests` | **400** / **422** | Validation error |
| Unauthorized employee access | `GET /employees/:id/balances`, `POST /time-off-requests`, `GET /time-off-requests/:id` | **403 Forbidden** | No data exposed |
| Insufficient HCM balance at approval | `POST /time-off-requests/:id/approve` | **409 Conflict** | `FAILED_HCM_VALIDATION`; reservation released |
| Invalid HCM employee/location at approval | `POST /time-off-requests/:id/approve` | **409 Conflict** | `FAILED_HCM_VALIDATION` |
| Transient HCM error at approval | `POST /time-off-requests/:id/approve` | **202 Accepted** (with failed status body) | `FAILED_HCM_SUBMISSION` (retry/reconcile later) |
| HCM timeout after accept (duplicate on retry) | `POST /time-off-requests/:id/approve` | **200 OK** | `APPROVED` via duplicate detection; no double consumption |
| Batch import: reserved > HCM balance | `POST /system/hcm/balances/batch-import` | **200 OK** | `reconciliationRequired` count > 0; affected requests marked |
| Local/HCM mismatch detected | `POST /system/reconciliation/run` | **200 OK** | Issues returned; balances flagged |
| Invalid dimension on balance refresh | `POST /employees/.../balances/refresh` | **422 Unprocessable Entity** | Balance marked reconciliation-required |

---

## 6. Security & Authorization (TDR §14)

| TDR Rule | Enforced On | Mechanism |
|----------|-------------|-----------|
| Employees view/create only own data | `GET /employees/:employeeId/balances`, `POST /time-off-requests`, `GET /time-off-requests/:id`, `POST .../cancel` | `EmployeeAccessGuard` + `AuthGuard` |
| Managers act only on direct reports | `GET /managers/:managerId/time-off-requests`, `POST .../approve`, `POST .../reject` | Manager relationship check in `TimeOffRequestService.assertManagerCanAct` |
| System APIs require integration role | `POST /system/hcm/balances/batch-import`, `POST /system/reconciliation/run` | `@Roles(SYSTEM_INTEGRATION, SYSTEM_ADMIN)` |
| Mock HCM not publicly exposed in production | `GET/POST /mock-hcm/*` | `@Public()` for dev/test; documented as non-production in README |
| Audit logs record actor type and ID | All write APIs | `AuditService` → `audit_logs` table |
| Authorization before state changes | All write APIs | Guards run before controller delegates to service |

**Auth headers (mock, per TDR non-goals):**

```
X-User-Id: <user-id>
X-User-Role: EMPLOYEE | MANAGER | SYSTEM_ADMIN | SYSTEM_INTEGRATION
```

---

## 7. Request Lifecycle (TDR §8) — API Trigger Map

| Status Transition | Triggered By API |
|-------------------|------------------|
| → `PENDING_MANAGER_APPROVAL` | `POST /time-off-requests` |
| `PENDING_MANAGER_APPROVAL` → `APPROVED_PENDING_HCM` | `POST /time-off-requests/:id/approve` (start) |
| `APPROVED_PENDING_HCM` → `APPROVED` | `POST /time-off-requests/:id/approve` (HCM success) |
| `PENDING_MANAGER_APPROVAL` → `REJECTED` | `POST /time-off-requests/:id/reject` |
| `SUBMITTED` / `PENDING_MANAGER_APPROVAL` → `CANCELLED` | `POST /time-off-requests/:id/cancel` |
| `APPROVED_PENDING_HCM` → `FAILED_HCM_VALIDATION` | `POST /time-off-requests/:id/approve` (HCM rejects) |
| `APPROVED_PENDING_HCM` → `FAILED_HCM_SUBMISSION` | `POST /time-off-requests/:id/approve` (transient HCM error) |
| → `RECONCILIATION_REQUIRED` | `POST /system/hcm/balances/batch-import`, `POST /system/reconciliation/run` |

---

## 8. Data Model (TDR §10) — Persistence (No Direct API)

| TDR Table | Implemented | Accessed Via |
|-----------|-------------|--------------|
| `employees` | ✅ | Batch import upsert; seed data; auth/manager checks |
| `locations` | ✅ | Batch import upsert; request creation |
| `balances` | ✅ | `GET /employees/:id/balances`, refresh, request reservation |
| `time_off_requests` | ✅ | All time-off request APIs |
| `request_status_history` | ✅ | `GET /time-off-requests/:id` |
| `hcm_sync_jobs` | ✅ | Batch import + reconciliation responses (`jobId`) |
| `outbox_events` | ✅ | Written on request creation (infra; no public read API) |
| `audit_logs` | ✅ | Written on all major actions (infra; no public read API) |
| `idempotency_records` | ✅ | All idempotent write APIs |

---

## 9. Observability (TDR §15)

| TDR Requirement | Implementation | API Correlation |
|-----------------|----------------|-----------------|
| Log request created | `AuditService` + Logger | `POST /time-off-requests` |
| Log balance reserved | `AuditService` | `POST /time-off-requests` |
| Log request approved | `AuditService` | `POST .../approve` |
| Log HCM submission started/succeeded/failed | `HcmClientService` Logger + audit on approve | `POST .../approve` |
| Log batch import started/completed | `BatchImportService` Logger + audit | `POST /system/hcm/balances/batch-import` |
| Log reconciliation issues | `ReconciliationService` Logger + audit | `POST /system/reconciliation/run` |
| Correlation IDs | `CorrelationService` (AsyncLocalStorage) | All layers |

---

## 10. Test Strategy Coverage (TDR §16)

| TDR Test Type | Requirement | Test Location | Count |
|---------------|-------------|---------------|-------|
| Unit — state transitions | TDR §16.1 | `test/unit/state-transition*.spec.ts` | ✅ |
| Unit — balance calculation | TDR §16.1 | `test/unit/balance-calculator*.spec.ts` | ✅ |
| Unit — HCM error mapping | TDR §16.1 | `test/unit/hcm-error-mapper.service.spec.ts`, `domain-extended.spec.ts` | ✅ |
| Unit — reconciliation rules | TDR §16.1 | `test/unit/reconciliation-rules.service.spec.ts` | ✅ |
| Integration — SQLite + NestJS | TDR §16.2 | `test/integration/time-off-request.integration.spec.ts` | ✅ |
| E2E — full flows | TDR §16.3 | `test/e2e/time-off.e2e-spec.ts` | ✅ |
| Contract — HCM client | TDR §16.4 | `test/contract/hcm-client.contract-spec.ts` | ✅ |
| Regression — double approval, batch conflicts | TDR §16.5 | `test/integration/regression.integration.spec.ts` | ✅ |
| Coverage report | TDR §16.6 / §18.2 | `npm run test:cov` → `coverage/` | ✅ |

### TDR §16.3 E2E Flows → API Mapping

| TDR E2E Scenario | APIs Exercised |
|------------------|----------------|
| Happy path | `GET /employees/.../balances` → `POST /time-off-requests` → `POST .../approve` → `GET .../requestId` |
| Insufficient balance at request time | `POST /time-off-requests` → **409** |
| Insufficient balance at approval time | `POST /time-off-requests` → `POST .../approve` → **409** |
| Work anniversary bonus | `POST /system/hcm/balances/batch-import` → `GET /employees/.../balances` |
| Timeout after HCM accepts | `POST .../approve` (mock scenario + idempotent retry) |
| Invalid employee/location dimension | `POST .../approve` with invalid HCM dimension |
| Unauthorized manager | `POST .../approve` → **403** |
| Employee cannot access other's request | `GET /time-off-requests/:id` → **403** |

---

## 11. Acceptance Criteria (TDR §18)

### 11.1 Functional Acceptance Criteria

| # | TDR Criterion | Satisfied By |
|---|---------------|--------------|
| AC-F1 | Employees can view balances | `GET /employees/:employeeId/balances` |
| AC-F2 | Employees can create requests | `POST /time-off-requests` |
| AC-F3 | Requests reserve local balance | `POST /time-off-requests` (transactional reservation) |
| AC-F4 | Managers approve/reject pending requests | `POST .../approve`, `POST .../reject` |
| AC-F5 | Approval validates with HCM | `POST .../approve` → HCM real-time lookup |
| AC-F6 | HCM insufficient balance blocks approval | `POST .../approve` → **409**, `FAILED_HCM_VALIDATION` |
| AC-F7 | Batch import updates balances | `POST /system/hcm/balances/batch-import` |
| AC-F8 | Batch import preserves reservations | Same API; regression test |
| AC-F9 | Reconciliation identifies mismatches | `POST /system/reconciliation/run` |
| AC-F10 | Duplicate client calls do not duplicate effects | Idempotency on all write APIs |
| AC-F11 | Audit history available per request | `GET /time-off-requests/:requestId` |
| AC-F12 | Mock HCM supports happy path + failures | `/mock-hcm/*` endpoints |

### 11.2 Technical Acceptance Criteria

| # | TDR Criterion | Status | Evidence |
|---|---------------|--------|----------|
| AC-T1 | Built with NestJS | ✅ | `package.json`, `src/main.ts` |
| AC-T2 | Uses SQLite | ✅ | Optional `better-sqlite3`; lazy-loaded only in SQLite mode; default `PERSISTENCE_MODE=sqlite` |
| AC-T3 | REST API documented | ✅ | Swagger at `/api` |
| AC-T4 | Unit, integration, E2E, contract tests | ✅ | `test/` — 50 tests passing |
| AC-T5 | Coverage report generated | ✅ | `npm run test:cov` |
| AC-T6 | Critical domain logic high coverage | ✅ | Domain module unit tests |
| AC-T7 | Mock HCM part of test suite | ✅ | `MockHcmModule` + contract tests |
| AC-T8 | Repeatable schema setup | ✅ | `src/database/schema.sql` |
| AC-T9 | Runnable locally with instructions | ✅ | `README.md` |
| AC-T10 | README with architecture + trade-offs | ✅ | `README.md` |

---

## 12. TDR Non-Goals — Intentionally Out of Scope

| TDR Non-Goal | Notes |
|--------------|-------|
| Full HR policy engine | Not implemented |
| Complex accrual calculation | Not implemented |
| Replace HCM as source of truth | HCM remains authoritative; local projection only |
| Payroll calculations | Not implemented |
| Production distributed DB | SQLite only (per assignment) |
| Real authentication providers | Mock header auth only |
| Frontend UI | API-only service |

---

## 13. Complete API Inventory (Quick Reference)

### Production-facing REST APIs

| Method | Path | Role(s) | TDR Section |
|--------|------|---------|-------------|
| GET | `/health` | Public | §11.3 |
| GET | `/employees/:employeeId/balances` | EMPLOYEE, MANAGER, SYSTEM_ADMIN | §11.1 |
| POST | `/employees/:employeeId/locations/:locationId/balances/refresh` | EMPLOYEE, MANAGER, SYSTEM_ADMIN | §11.1 |
| POST | `/time-off-requests` | EMPLOYEE, SYSTEM_ADMIN | §11.1 |
| GET | `/time-off-requests/:requestId` | EMPLOYEE, MANAGER, SYSTEM_ADMIN | §11.1 |
| POST | `/time-off-requests/:requestId/cancel` | EMPLOYEE, MANAGER, SYSTEM_ADMIN | §11.1 |
| GET | `/managers/:managerId/time-off-requests` | MANAGER, SYSTEM_ADMIN | §11.2 |
| POST | `/time-off-requests/:requestId/approve` | MANAGER, SYSTEM_ADMIN | §11.2 |
| POST | `/time-off-requests/:requestId/reject` | MANAGER, SYSTEM_ADMIN | §11.2 |
| POST | `/system/hcm/balances/batch-import` | SYSTEM_INTEGRATION, SYSTEM_ADMIN | §11.3 |
| POST | `/system/reconciliation/run` | SYSTEM_INTEGRATION, SYSTEM_ADMIN | §11.3 |

### Mock HCM APIs (test/dev)

| Method | Path | TDR Section |
|--------|------|-------------|
| GET | `/mock-hcm/employees/:employeeId/locations/:locationId/balance` | §12.1 |
| POST | `/mock-hcm/time-off` | §12.2 |
| GET | `/mock-hcm/balances/batch` | §12.3 |

### Documentation

| Resource | URL |
|----------|-----|
| Swagger UI | `http://localhost:3000/api` |
| OpenAPI JSON | Generated by `@nestjs/swagger` at runtime |

---

## 14. Persistence architecture (SQLite default + optional memory)

| Requirement | Implementation | Verified by |
|-------------|----------------|-------------|
| SQLite default / canonical | `PERSISTENCE_MODE=sqlite` (default); schema via `DatabaseService`; requires optional `better-sqlite3` | All sqlite integration/e2e tests (`npm test`) |
| Optional in-memory mode | `PERSISTENCE_MODE=memory`; repository ports + memory adapters; **does not require** `better-sqlite3` | `npm run test:memory` (16 tests) |
| Auto fallback | `PERSISTENCE_MODE=auto` probes SQLite, falls back with warning | `test/unit/persistence-mode.spec.ts` |
| Repository ports | `EmployeeRepositoryPort`, `BalanceRepositoryPort`, etc. in `src/database/ports/` | Service layer injects port tokens |
| Transaction manager | `TransactionManagerPort` — SQLite + memory snapshot/rollback | Memory transaction rollback test |
| Conditional updates (memory) | `reserveBalanceIfAvailable`, conditional transitions | Unit + memory integration tests |

SQLite remains the default and canonical persistence implementation required by the assignment. In-memory mode preserves domain behavior but is not production persistence and loses data on restart.

---

## 15. Observability

| Capability | Implementation | Verified by |
|------------|----------------|-------------|
| Correlation ID | `CorrelationMiddleware` reads/generates `X-Correlation-Id` | `test/integration/observability.integration.spec.ts` |
| Structured event logs | `StructuredEventLogger` for request/HCM/batch/reconciliation events | Observability integration tests + service instrumentation |
| Metrics endpoint | `GET /metrics` JSON counters (process-local) | Observability integration tests |
| Metrics counters | requests/HCM/batch/reconciliation/idempotency totals | Observability integration tests |

---

## 16. Known limitations

| Limitation | Status |
|------------|--------|
| HCM cancellation / reversal for approved requests | **Out of scope** — local `CANCELLED` transition only; no HCM reversal API |
| SQLite concurrency | Conditional SQL updates; not production-grade under high write contention |
| In-memory persistence | Optional offline/demo only; not TRD canonical deliverable |
| Metrics | In-process counters; reset on restart |
| Outbox | Records written; no background dispatcher |

Approved request cancellation against HCM is intentionally out of scope for this take-home implementation. The current service models local cancellation behavior, but a production implementation should add an HCM cancellation/reversal endpoint, a cancellation-pending-HCM state, idempotent reversal submission, retry handling, and reconciliation for reversal failures.

---

## 17. Test suite and coverage summary

| Command | Result (latest local) |
|---------|------------------------|
| `npm test` | **194 passed / 194 total** (44 suites) — canonical SQLite |
| `npm run test:memory` | **16 passed / 16 total** (3 suites) — offline; no SQLite |
| `npm run test:cov` | Thresholds pass — official coverage proof; see `COVERAGE_PROOF.md` |
| `npm run verify:offline` | `build` + `test:memory` — no `better-sqlite3` required |
| `npm run verify:sqlite` | `build` + `npm test` + `test:cov` — authoritative assignment validation |

| Metric | Threshold | Latest |
|--------|-----------|--------|
| Branches | 85% | 85.06% |
| Functions | 90% | 95.72% |
| Lines | 90% | 94.38% |
| Statements | 90% | 94.41% |

The official assignment coverage proof must come from `npm run test:cov` in SQLite mode, not from `npm run test:memory`.

Key test files for corrected behaviors:

- Idempotency mismatch → `409`: `test/integration/idempotency-mismatch.integration.spec.ts`
- Duplicate HCM + balance lookup failure → `RECONCILIATION_REQUIRED`: `test/integration/duplicate-hcm-submission.integration.spec.ts`
- Timeout-after-accept + stable `externalRequestId`: `test/integration/hcm-timeout-after-accept.integration.spec.ts`
- Status history `fromStatus`: `test/integration/approval-status-history.integration.spec.ts`
- Batch payload validation → `422`: `test/integration/batch-import-validation.integration.spec.ts`
- Memory persistence: `test/integration/memory-persistence.integration.spec.ts`
- Observability: `test/integration/observability.integration.spec.ts`

---

## 18. Summary

**All TDR functional requirements (§3.1), API design endpoints (§11), mock HCM endpoints (§12), and acceptance criteria (§18.1) are implemented and mapped to concrete REST APIs.**

Non-API concerns (transactions, audit, idempotency, outbox, state machine, retry logic, optional memory adapters, observability) are implemented in the service/domain/persistence layers and verified by the automated test suite documented above.

**Test command (canonical):** `npm test` (194 tests, SQLite)  
**Coverage command (official proof):** `npm run test:cov`  
**Offline tests:** `npm run test:memory` (16 tests)  
**Verification:** `npm run verify:sqlite` (authoritative) / `npm run verify:offline` (restricted env)  
**Offline demo:** `npm run start:offline`
