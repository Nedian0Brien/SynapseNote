# RFC 0001 database resource and abuse limits

Status: implemented public-beta boundary.

This document is the authoritative inventory for L-016. Limits are enforced at
the earliest practical typed boundary and fail closed; clients must not treat a
truncated result as complete. Deployment-level reverse-proxy limits may be
stricter, but may not weaken these application limits.

## Shared ingress

| Boundary | Limit | Refusal or bounded behavior | Evidence |
| --- | --- | --- | --- |
| JSON HTTP request body | 1 MiB and 30 seconds | HTTP 413 or 408 before schema/domain work | `http/request-validation.ts` |
| Imported/canonical manifest | 1 MiB, 100 YAML aliases, depth 128, 50,000 YAML nodes | Source-diagnostic refusal before JS conversion/schema activation | `database/manifest.ts`, `database/schema.test.ts` |
| Generic local upload | one file, 100 MiB, 10 fields, 2 KiB per field | HTTP 413 and tempfile removal | `api-extension.ts`, `upload-errors.ts` |
| Public Form upload | one file per request, 25 MiB, configured maximum 1–20 files per question | HTTP 413; Form authorization/rate checks run before multipart parsing | `api-extension.ts`, `database-data-plane.ts` |

## Public entry points

Public shares are exact-target random bearer grants stored only as hashes.
Public Form submissions additionally enforce the configured 10–86,400 second
window and 1–1,000 submissions per remote-address hash (default 10 per minute).
Upload attempts consume a separately persisted window derived from that rate
and the per-question file count. The ledger has bounded capacity and refuses
new attempts when it cannot safely track another window. Honeypot, minimum
completion time, exact question projection, close time, duplicate field,
submission idempotency, and retention checks provide independent abuse layers.
Restart does not reset the rate windows.

Evidence: `database-form-state-store.ts`, `database-data-plane.ts`,
`database-form-retention.ts`, `database-data-plane.test.ts`, and the upload
limits above.

## Agent entry points

An authenticated agent session may begin at most 600 Data Plane HTTP requests
per 60-second fixed window and hold at most 8 in flight. The limiter tracks at
most 10,000 session keys and refuses new keys at capacity. A refusal is HTTP
429 `urn:ok:error:too-many-requests` with `Retry-After`. User principals are
not charged to this agent budget, and public Forms use their durable public
budget instead.

The following domain limits apply after admission:

| Work | Limit |
| --- | --- |
| Exact query/aggregation | 500 rows per page, 2 group levels, 100 calculations, 1,000 memberships per record, 500 groups |
| Lexical retrieval | 16 terms, 500 retained hits, 8 evidence spans per hit |
| Context relation traversal | depth 3, 500 total related rows, 50 rows per relation |
| Context Pack | 100,000 requested tokens, 50,000 reserve tokens, saved Agent View maximum 500 rows |
| Formula | depth 64, 2,048 AST nodes, 100,000 evaluation steps, 10,000 list values, 100,000 output nodes |
| Rollup | 10,000 relation targets and 10,000 projected values |
| Agent write delegation | schema-bounded actions/records/egress plus immutable exact plan, revision and idempotency guards |
| Durable background task recovery | default 10 and configurable maximum 200 concurrent tasks |

Evidence: `database-entry-point-limits.ts`, `database-data-plane-api.ts`,
`database/query.ts`, `database/formula*.ts`, `database/rollup.ts`,
`database-context-pack.ts`, `database-task-service.ts`, and their focused tests.

The MCP database profile reaches the same HTTP/Data Plane contracts. Sandboxed
deployment additionally removes generic writers; direct filesystem access is
outside this application boundary as documented in the threat model.

## Automation entry points

Automation execution is single-flight per service instance and protected by a
cross-process file lock. Each definition has at most 20 actions, 100 mutation
operations per applicable action, 100 recipients/properties, 100 generated
events, and 10 retry attempts. Loop ancestry holds at most 16 automation IDs.
Only the newest 1,000 events and 1,000 runs are retained; external payloads are
connection-policy bounded to at most 10,000,000 bytes, use idempotency receipts,
and cannot follow redirects. Repeating templates create only the latest missed
occurrence, preventing unbounded catch-up.

Evidence: `database-automation.ts`, `database-connection-executor.ts`,
`database-template-scheduler.ts`, `database/schema.ts`, and their focused tests.

## Browser offline queue

The browser persists at most 100 supported record-property write intents in
IndexedDB. Each encoded entry is limited to 1 MiB, contains at most the
server-schema maximum of 10,000 record mutations and 100 operations or
preconditions per record, and must carry non-empty exact property
preconditions. Reconciliation is sequential and stops at the first renewed
transport failure. After 10 failed attempts an item becomes blocked instead of
retrying indefinitely. Queueing schema/lifecycle/egress actions is refused.

Evidence: `database-offline-mutation-queue.ts` and
`database-offline-mutation-queue.test.ts`.

## Operational interpretation

- `413` means the caller must reduce bytes, shape depth, fan-out, or requested
  work; retrying the same input is incorrect.
- `429` means the caller should honor `Retry-After`, reduce parallelism, and
  reuse one stable agent session rather than minting new session IDs.
- Pagination, Context Pack completeness, relation omission receipts, and query
  truncation metadata are security-relevant. Consumers must preserve them.
- Process-local agent limits protect one SynapseNote server. A multi-instance
  public deployment must also configure a shared edge limiter; this does not
  replace the durable per-Form application checks.

Changing any ceiling requires a focused boundary test and an update here. A new
public route, agent tool, import parser, executable expression, background
worker, or external adapter cannot pass release review until it is represented
in this inventory.
