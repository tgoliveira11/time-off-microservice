# Security & Infrastructure Review

**Project:** Time-Off Microservice  
**Review date:** 2026-06-09  
**Scope:** Application code, REST APIs, SQLite persistence, HCM integration, npm dependencies, deployment posture  
**Reviewers (perspective):** Application Security + Infrastructure / Platform Engineering  
**Automated tests at review time:** 194/194 canonical SQLite tests passing (see `COVERAGE_PROOF.md`); 16 memory/offline tests via `npm run test:memory`  
**npm audit (all deps):** 24 vulnerabilities (3 low, 14 moderate, 7 high)  
**npm audit (prod only):** 11 vulnerabilities (8 moderate, 3 high)

---

## Executive Summary

The codebase is **appropriate for a TDR take-home / dev environment** but is **not production-ready from a security or infrastructure standpoint** without significant hardening.

**Strengths:** parameterized SQL, input validation via `ValidationPipe`, role-based guards, service-layer authorization for most flows, transactional balance updates, idempotency support, audit logging.

**Critical gaps:** spoofable mock authentication, unauthenticated Mock HCM + test mutation endpoints, no transport/security headers/rate limits, runtime npm vulnerabilities in the Express/Nest stack, and several authorization gaps (cancel IDOR, global idempotency scope).

**Overall rating**

| Environment | Rating | Notes |
|-------------|--------|-------|
| Local dev / assignment demo | Acceptable with awareness | Mock auth by design (TDR) |
| Staging | Not ready | Block mock routes, add real auth |
| Production | Not ready | Full remediation required |

---

## Findings Summary

| Severity | Count | Must fix before production |
|----------|-------|----------------------------|
| Critical | 4 | Yes |
| High | 6 | Yes |
| Medium | 8 | Recommended |
| Low / Info | 6 | As capacity allows |

---

## Detailed Findings

| Severity | Location | Finding | Remediation |
|----------|----------|---------|-------------|
| **Critical** | `src/common/auth/auth.guard.ts:28-29` | **Authentication is header-spoofing only** (`X-User-Id`, `X-User-Role`). Any client can impersonate `SYSTEM_INTEGRATION`, `SYSTEM_ADMIN`, or any employee/manager. | Replace with OAuth2/OIDC JWT (or mTLS service-to-service for system APIs). Validate tokens at API gateway + service. Map claims to roles; never trust client-supplied identity headers. |
| **Critical** | `src/modules/mock-hcm/mock-hcm.controller.ts:12-57` | **Mock HCM is fully public** (`@Public()`). Includes `POST /mock-hcm/test/seed` and `POST /mock-hcm/test/reset` which mutate simulated HCM state without auth. | Disable `MockHcmModule` in production builds (`NODE_ENV=production`). Guard test routes behind env flag. Network-isolate mock service in test environments only. |
| **Critical** | `src/modules/hcm/http-hcm.client.ts:19-28` | **SSRF / URL injection risk** via `HCM_BASE_URL` and unencoded path params (`employeeId`, `locationId`). Misconfigured env could target internal metadata (`169.254.169.254`) or cloud APIs. | Allowlist HCM hostnames; use `URL` constructor + `encodeURIComponent` for path segments; block private IP ranges; require HTTPS in prod. |
| **Critical** | `package.json` (runtime) | **11 production npm vulnerabilities** including **high** in `multer` (DoS) and Express/`body-parser`/`qs` chain. `@nestjs/core` moderate injection advisory (GHSA-36xv-jgw5-4q75). | Upgrade to NestJS 11.x stack (`@nestjs/core@11.1.26+`, `@nestjs/platform-express@11.1.26+`). Run `npm audit` in CI; block deploy on high/critical. |
| **High** | `src/modules/time-off-requests/time-off-request.service.ts:193-206` | **IDOR on cancel:** `MANAGER` / `SYSTEM_ADMIN` can cancel **any** employee's request without verifying direct-report relationship (only `EMPLOYEE` role is restricted to self). | Reuse `assertManagerCanAct` or equivalent before cancel for managers; restrict system cancel to break-glass roles with audit. |
| **High** | `src/common/idempotency/idempotency.service.ts:12-27` | **Idempotency keys are global per scope**, not bound to `userId` or tenant. Client A's key can return Client B's cached approve/create response → wrong side effects or info leak. | Composite key: `scope + userId + idempotencyKey` (or tenant). Reject cross-actor cache hits. |
| **High** | `src/main.ts:24-25` | **Swagger UI exposed without authentication** at `/api`. Full API surface, schemas, and auth header names visible to unauthenticated users. | Disable Swagger in production or protect with SSO/VPN/basic auth. |
| **High** | Infrastructure | **No security middleware:** missing Helmet (CSP, HSTS, X-Frame-Options), explicit CORS policy, request body size limits, rate limiting, or WAF. | Add `helmet`, strict CORS, `@nestjs/throttler`, body parser limits. Terminate TLS at ingress (nginx/ALB/API gateway). |
| **High** | `src/database/database.service.ts:16-20` | **SQLite file stored on local disk** (`./data/time-off.db`) with default filesystem permissions; no encryption at rest; single-node only. | Encrypt volume (EBS/LUKS), restrict `chmod 600`, run as non-root user, plan migration to PostgreSQL for prod. |
| **High** | `package.json` (dev) | **24 total npm vulnerabilities** including dev-time **webpack SSRF** advisories (GHSA-8fgc-7cc6-rx7x, GHSA-38r7-794h-5758). Dev deps can affect CI/build pipelines. | Upgrade `@nestjs/cli` to 11.x; pin CI to `npm ci --ignore-scripts` where possible; use isolated build runners. |
| **Medium** | `src/modules/time-off-requests/time-off-requests.controller.ts:47-48` | **Managers allowed on cancel endpoint** at controller level without relationship guard at controller layer (service gap above). | Align controller `@Roles` with TDR intent; managers cancel only direct reports. |
| **Medium** | `src/common/auth/auth.guard.ts:47-48` | **`@Roles` not applied on all controllers** — endpoints without `@Roles` only require *any* authenticated header pair. Example: authenticated employee could hit system routes if guard misconfigured. | Apply `@Roles` on every non-public handler; default-deny policy. System controller is protected ✓. |
| **Medium** | `src/modules/hcm/http-hcm.client.ts:27-28` | **No mTLS or HCM credential** on outbound HCM calls. | Add client credentials, signed requests, or mTLS per HCM vendor requirements. |
| **Medium** | `src/modules/hcm/http-hcm.client.ts` | **No response schema validation** on HCM JSON — malformed/tr malicious responses could corrupt balances. | Validate HCM responses with Zod/class-validator; reject unexpected shapes. |
| **Medium** | `src/database/database.service.ts:48-62` | **`resetForTests()` ships in production code** — accidental call would wipe data. | Guard with `NODE_ENV === 'test'` or move to test-only module. |
| **Medium** | Logging / errors | **Potential information disclosure** via Nest default error bodies and audit logs containing internal metadata. | Central exception filter; sanitize client-facing errors; redact PII in logs. |
| **Medium** | CI/CD (missing) | **No dependency scanning, SAST, or image scanning** in pipeline. | Add `npm audit`, Dependabot/Renovate, Semgrep/CodeQL, Trivy for container images. |
| **Medium** | `src/modules/health/health.controller.ts:16-21` | **Health endpoint is public** and reveals component status (`database`, `hcmMock`). | Public liveness minimal (`/health/live` → `{status:"ok"}`); keep details on authenticated `/health/ready`. |
| **Low** | `src/main.ts:27-28` | **Binds all interfaces** (`0.0.0.0` default) on configurable `PORT` without documented network policy. | Bind `127.0.0.1` in dev; use private subnets + security groups in prod. |
| **Low** | `Idempotency-Key` header | **Optional on write APIs** — retries without key can duplicate operations under network failures. | Require idempotency key for all mutating endpoints in production. |
| **Low** | `uuid` v11 | **Non-cryptographic UUIDs** for entity IDs (acceptable here); predictable IDs enable enumeration. | Use UUIDv4/v7; consider non-enumerable IDs for external APIs. |
| **Low** | Secrets management | **No `.env.example` or secrets vault integration**; config via raw env vars. | Use AWS Secrets Manager / Vault / K8s secrets; never commit `.env`. |
| **Low** | Observability | **No security monitoring** (failed auth spikes, reconciliation anomalies, HCM error rate alerts). | Wire audit logs + metrics to SIEM; alert on `403/401` bursts and batch import failures. |
| **Info** | TDR alignment | Mock auth is **explicit TDR non-goal** for real auth — acceptable for assignment, not for prod. | Document boundary in deployment guide. |
| **Info** | SQL injection | Repositories use **prepared statements** throughout — good practice. | Maintain; add static analysis rule. |
| **Info** | Input validation | **Global ValidationPipe** with `whitelist`, `forbidNonWhitelisted` — good. | Add max length decorators on string DTO fields. |

---

## Infrastructure Review

### Deployment architecture (current)

```
Internet → NestJS (single process) → SQLite file
                ↓
         fetch → HCM_BASE_URL (configurable)
                ↓
         /mock-hcm (same process, public)
```

### Recommended production architecture

```
Internet → WAF / API Gateway (TLS, JWT, rate limit)
              ↓
         NestJS pods (stateless, non-root, read-only FS except tmp)
              ↓
         PostgreSQL (HA, encrypted, backups)
              ↓
         Private network → HCM (HTTPS + mTLS)
         
(Mock HCM: NOT deployed in prod)
```

### Infrastructure checklist

| Control | Current | Recommended |
|---------|---------|-------------|
| TLS in transit | Not enforced in app | Terminate at gateway; HSTS |
| Encryption at rest | None (SQLite file) | RDS/EBS encryption |
| Secrets | Plain env vars | Vault / Secrets Manager |
| Least privilege IAM | N/A | Task role per service |
| Network segmentation | None | Private subnets; no public DB |
| Container hardening | N/A | Distroless/non-root, no shell |
| Backups & DR | None | PITR backups, restore tests |
| Horizontal scaling | SQLite limits writes | PostgreSQL + connection pool |
| Health probes | `/health` public | K8s liveness/readiness split |
| Log aggregation | stdout only | Centralized JSON logs |
| Dependency scanning | Manual | CI gate on audit/SBOM |

---

## npm / Supply Chain Analysis

### Direct runtime dependencies

| Package | Version | Risk notes |
|---------|---------|------------|
| `@nestjs/common` | 10.4.22 | Moderate transitive issues; upgrade path to 11.1.26 |
| `@nestjs/core` | 10.4.22 | GHSA-36xv-jgw5-4q75 (moderate injection) — fixed in 11.1.18+ |
| `@nestjs/platform-express` | 10.4.22 | Pulls vulnerable `express`, `body-parser`, `multer`, `qs` |
| `@nestjs/swagger` | 8.1.1 | Transitive `lodash`, `js-yaml` advisories |
| `better-sqlite3` | 11.10.0 | Native addon — supply chain + build reproducibility risk |
| `class-validator` | 0.14.4 | Keep updated; validate all external input |
| `uuid` | 11.1.1 | Low risk |

### Dev dependencies (CI/build risk)

| Package | Risk |
|---------|------|
| `@nestjs/cli@10.4.9` | High — webpack SSRF advisories |
| `jest`, `supertest` | Dev only — acceptable |

### Recommended npm actions

```bash
# 1. Assess breaking upgrade (recommended for prod)
npm install @nestjs/common@11 @nestjs/core@11 @nestjs/platform-express@11 @nestjs/swagger@11

# 2. Re-run audit
npm audit --omit=dev

# 3. Add to CI (fail on high+)
npm audit --audit-level=high --omit=dev

# 4. Enable automated updates
# Dependabot or Renovate on package.json + lockfile
```

**Note:** `npm audit fix --force` may introduce breaking Nest 11 migrations — plan upgrade with regression test run (`npm test`).

---

## API Security Matrix

| API | Auth | AuthZ status | Primary risk |
|-----|------|--------------|--------------|
| `GET /health` | Public | OK (minimal) | Info disclosure |
| `GET /employees/:id/balances` | Header mock | EmployeeAccessGuard ✓ | Spoofed identity |
| `POST .../balances/refresh` | Header mock | EmployeeAccessGuard ✓ | Spoofed identity + HCM SSRF |
| `POST /time-off-requests` | Header mock | Service check ✓ | Spoofed employee |
| `GET /time-off-requests/:id` | Header mock | Service check ✓ | IDOR if headers spoofed |
| `POST .../cancel` | Header mock | **Partial** — manager IDOR | Unauthorized cancel |
| `POST .../approve` | Header mock | assertManagerCanAct ✓ | Spoofed manager |
| `POST .../reject` | Header mock | assertManagerCanAct ✓ | Spoofed manager |
| `GET /managers/:id/time-off-requests` | Header mock | managerId match ✓ | Spoofed manager |
| `POST /system/.../batch-import` | Header mock | SYSTEM_INTEGRATION role | **Full system compromise if headers spoofed** |
| `POST /system/reconciliation/run` | Header mock | SYSTEM_INTEGRATION role | Same |
| `GET/POST /mock-hcm/*` | **None** | N/A | **Critical — state manipulation** |
| `GET /api` (Swagger) | **None** | N/A | API enumeration |

---

## What's implemented well (security-positive)

1. **Parameterized SQL** in all repositories — no string-concatenated user input in queries.
2. **DTO validation** with `class-validator` + strict `ValidationPipe`.
3. **Transactional writes** for balance reservation/release — reduces race/consistency attacks.
4. **Manager approval checks** verify direct-report relationship before approve/reject.
5. **Employee balance access** guarded by `EmployeeAccessGuard`.
6. **Audit trail** for major mutations (supports forensics).
7. **HCM defensive validation** at approval time (reduces stale-balance abuse).
8. **Idempotency infrastructure** present (needs user scoping hardening).
9. **No hardcoded secrets** found in source.
10. **`.gitignore`** excludes `.env` and `*.db`.

---

## Prioritized remediation roadmap

### P0 — Before any shared/staging deployment

1. Disable `MockHcmModule` and Swagger in non-dev environments.
2. Put API behind gateway with real authentication (JWT).
3. Upgrade Nest/Express stack to resolve high npm advisories.
4. Fix cancel IDOR for managers.
5. Scope idempotency keys to authenticated principal.

### P1 — Before production

6. Add Helmet, CORS, rate limiting, request size limits.
7. HCM URL allowlist + path encoding + HTTPS/mTLS.
8. Validate all HCM responses.
9. Migrate SQLite → PostgreSQL; encrypt data at rest.
10. CI: `npm audit`, SBOM, SAST on every PR.

### P2 — Hardening

11. Security monitoring and alerting on audit logs.
12. Penetration test focused on IDOR, HCM integration, and system APIs.
13. Remove or gate `resetForTests()` from production bundles.
14. Require `Idempotency-Key` on all writes.

---

## Conclusion

The implementation **meets TDR functional/security intent for a mock-auth assignment** and demonstrates solid domain-level integrity controls. It **does not yet meet production security or infrastructure standards** due to spoofable authentication, exposed mock/test surfaces, missing edge protections, npm vulnerabilities in the runtime web stack, and a few authorization gaps.

**Recommendation:** Treat current artifact as **dev/demo only**. Execute the P0/P1 roadmap before connecting to real employee data or production HCM systems.
