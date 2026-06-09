# Coverage Proof

## Command

```bash
npm run test:cov
```

## Environment

* Persistence mode: **SQLite** (default; canonical assignment path)
* Node.js: v25.3.0
* npm: 11.7.0
* OS: Darwin 25.5.0 arm64 (macOS)
* Date/time of run: 2026-06-09 16:34:30 -03 (via `npm run verify:sqlite`; reconfirmed after `npm ci`)

Dependencies were installed with `npm ci` (including optional `better-sqlite3`). If optional dependencies were skipped, use `npm install --include=optional`.

## Result

* Test Suites: **44 passed**, 44 total
* Tests: **194 passed**, 194 total
* Branches: **85.06%**
* Functions: **95.72%**
* Lines: **94.38%**
* Statements: **94.41%**

## Configured thresholds

* Branches: 85%
* Functions: 90%
* Lines: 90%
* Statements: 90%

## Status

**Passed.**

## Related commands (not official coverage proof)

| Command | Purpose | Requires SQLite |
|---------|---------|-----------------|
| `npm test` | Canonical SQLite test suite | Yes |
| `npm run test:memory` | Memory/offline-compatible tests only (16 tests) | No |
| `npm run verify:sqlite` | Build + canonical tests + coverage | Yes |
| `npm run verify:offline` | Build + memory tests | No |

The official assignment coverage proof must come from `npm run test:cov` in SQLite mode, not from `npm run test:memory`.
