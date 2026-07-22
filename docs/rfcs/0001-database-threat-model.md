# RFC 0001 database security threat model

Status: implementation-linked review for the file-native database public beta.

This document treats database content, imported definitions, public submissions,
and external responses as hostile input. It does not treat an LLM's obedience to
natural-language instructions as a security boundary. Authorization, data
disclosure, mutation, and egress decisions must be enforced by typed server code
before content reaches an agent or side-effecting adapter.

## Assets and trust boundaries

Protected assets are canonical Markdown and manifests, stable object identity,
permission and autonomy policy, local connection secrets, private record/body
content, audit integrity, public-share credentials, and availability of the
server and index.

The principal boundaries are:

1. public Form/share traffic into the HTTP server;
2. canonical files and imported manifests into parsers and indexes;
3. permission-scoped query results into Context Packs and an LLM;
4. an agent's desired state into plan, approval, commit, and undo;
5. reviewed database values into webhook or email delivery;
6. owner-only `.ok/local` secrets and receipts versus Git-backed content; and
7. a sandboxed agent process versus the server writer process; and
8. permission-filtered offline record intents persisted in browser IndexedDB
   versus a later branch/server epoch and current canonical schema.

The default attacker can author record text and links, submit a public Form,
provide a manifest for import, or control a configured remote webhook response.
They cannot edit owner-only connection policy or obtain a share/session bearer
unless that credential is separately compromised. An agent with unrestricted
filesystem access is outside the strict tool-policy boundary; the
`data-plane-only` deployment described in the main RFC is required for that
case.

## Security invariants

- Record strings, bodies, evidence snippets, filenames, imported labels, and
  remote responses are data, never executable instructions or policy.
- Hidden rows/properties/bodies cannot influence counts, ranking, formulas,
  snippets, relation traversal, errors, or cache keys visible to the caller.
- Formula execution never evaluates JavaScript, loads modules, reads files, or
  performs network I/O.
- Public ingress cannot directly write canonical files; it compiles one bounded,
  server-validated exact plan.
- External egress uses only owner-local connection references and revalidates
  host, network, recipient, byte, idempotency, and policy guards at delivery.
- Parsed manifests cannot select code, filesystem paths outside declared source
  folders, secrets, or unknown behavior through a text fallback.
- Every canonical agent mutation is stable-ID, revision, permission, plan-hash,
  verification, and audit bound.

## Required threat surfaces

### 1. Prompt injection in records and related content

Attack: a title, Text value, body, evidence snippet, Relation target, Form
response, or imported description tells the model to ignore policy, reveal
another record, call a tool, or approve a write.

Implemented controls:

- Context Packs keep the user goal, saved Agent View contract, schema, records,
  evidence, and bodies in separate typed fields. Record content never becomes an
  Agent View instruction.
- Permission and sensitivity filtering run before filtering, ranking, evidence,
  relation expansion, encoding, and token estimation. Hidden content therefore
  cannot become a prompt-injection side channel.
- Least-context projections, explicit disclosure levels, bounded relation
  expansion, stable evidence references, and the **What the agent saw**
  inspector make the exact untrusted input reviewable.
- A model cannot turn text into a mutation directly: writes require a typed
  desired state, immutable exact plan, current write guards, approval or bounded
  delegation, atomic verification, and an audit receipt.
- The `data-plane-only` deployment removes generic write tools and gives the
  built-in Codex process a read-only filesystem.

Evidence: `database-context-pack.ts`, `database-data-plane.ts`,
`database-context-pack.test.ts`, `database-data-plane.test.ts`,
`database-commit.ts`, and `mcp/tools/registry.test.ts`.

Residual risk: an LLM can still reason incorrectly after reading malicious text.
Clients must label pack content as untrusted data in their system policy and
must not synthesize approval tokens. High-risk or egress plans remain human
review gates. This is tested as a control-flow boundary, not claimed as a model
alignment guarantee.

### 2. Malicious formulas and derived values

Attack: a manifest supplies executable code, a recursive/cyclic expression,
pathological list/text expansion, invalid cross-record access, or a formula
that infers a hidden value.

Implemented controls:

- Formulas are a versioned closed AST (`synapse-formula-1`), not source code;
  unknown nodes, functions, operators, IDs, and extra fields fail validation.
- AST nodes/depth, arguments, bindings, parameters, output text, lists, result
  depth, dependency depth, and evaluation work are bounded.
- Evaluation dispatches through a pure function registry without `eval`, dynamic
  `Function`, filesystem, module, or network capabilities.
- Dependency graphs reject cycles and evaluate against a frozen,
  permission-scoped snapshot. Permission-filtered dependencies do not produce
  visible derived values.
- Invalid and oversized results become typed problems rather than coerced text.

Evidence: `formula.ts`, `formula-evaluator.ts`, `formula-functions.ts`,
`formula-result.ts`, `formula.test.ts`, `formula-functions.test.ts`,
`formula-performance.test.ts`, and permission-leak tests in
`database-data-plane.test.ts`.

Residual risk: aggregate work across many otherwise-valid formulas remains an
availability concern. The request/work ceilings and refusal behavior are pinned
in the resource and abuse limit inventory; benchmark validation remains P-001
through P-003 and P-012.

### 3. Malicious links and Files values

Attack: path traversal, credential-bearing URLs, `file:`/script schemes,
untrusted HTML/SVG execution, missing-file confusion, or a remote asset used as
an implicit server-side fetch/SSRF primitive.

Implemented controls:

- Local Files values are normalized content-root-relative paths with no empty,
  dot, parent, absolute, backslash, or NUL segments. External values accept only
  credential-free HTTP(S) URLs.
- Context packing returns typed file values and availability receipts; it does
  not fetch an external Files URL or inline its response.
- Duplicate file identities are rejected and local file state is rechecked at
  projection time.
- Direct HTML and SVG asset rendering is isolated with a CSP sandbox, opaque
  origin/network restrictions, and explicit content handling.
- Database record parsing validates typed URL/Files values and keeps invalid raw
  input diagnosable instead of executing or silently coercing it.

Evidence: `files.ts`, `files.test.ts`, `record.ts`,
`asset-serve-middleware.ts`, `asset-serve-middleware.test.ts`, and
`database-context-pack.test.ts`.

Residual risk: opening an external URL discloses the viewer's network metadata
to that origin. The UI must keep external navigation explicit; remote fetching
must never be added to indexing or packing without the same DNS/host controls as
webhooks.

### 4. Public Forms and uploads

Attack: spam floods, replay, oversized or mismatched uploads, hidden-property
writes, conditional-question bypass, duplicate creation, honeypot evasion, or
retained personal data beyond the declared period.

Implemented controls:

- A public token resolves to one exact Form target/projection. Only its declared
  questions map to stable property IDs; server-side required, conditional,
  duplicate, type, and source checks run before planning.
- Honeypot input is discarded without a canonical write. Submission and upload
  rate windows are hashed, bounded, persisted across restart, and return typed
  refusal.
- Submission IDs produce deterministic recovery identity and idempotent exact
  plans, preventing uncertain-retry duplicates.
- Upload count/type/size policy is part of the saved Form configuration and the
  public request cannot widen it.
- Close state and `delete_after` retention are server enforced through a
  revision-bound verified deletion transaction.
- Public share credentials are random one-time values; only their SHA-256
  digests are persisted, and rotation/revocation/expiry fail closed.

Evidence: `database-data-plane.ts`, `database-form-state-store.ts`,
`database-form-retention.ts`, `database-permission-store.ts`, and their focused
tests, plus `DatabaseForm.dom.test.tsx` and `PublicDatabaseSharePage.dom.test.tsx`.

Residual risk: distributed abuse can evade one local rate window and malware can
be stored as an allowed opaque file. Cross-entry-point request, byte, count, and
concurrency ceilings are pinned in the resource inventory; content scanning is
deployment policy, not an implicit promise of this local-first core.

### 5. Webhooks, email, and external actions

Attack: secret exfiltration, SSRF/DNS rebinding, redirect to a private service,
host confusion, unreviewed record/body disclosure, recipient injection,
oversized egress, or duplicate delivery after restart.

Implemented controls:

- Manifests contain only stable connection IDs. Credentials and headers live in
  owner-only `.ok/local` connection state and never enter Markdown, Git, logs,
  Context Packs, plans, or receipts.
- Delivery requires HTTPS, an exact hostname allowlist, DNS resolution, and
  blocks loopback, link-local, private, multicast, IPv6-local, and mapped-private
  addresses unless the owner explicitly enables private networking.
- Fetch uses `redirect: manual`, so an allowlisted endpoint cannot redirect the
  request to a new host.
- Email recipient domains, projected property IDs, body inclusion, and egress
  bytes are reviewed and revalidated immediately before delivery.
- Pending/succeeded delivery receipts bind a hashed idempotency key to the exact
  connection/kind/payload fingerprint, preventing a retry from changing or
  duplicating the effect.
- Internal mutation commits and verifies before ordered external delivery; an
  external failure cannot pretend the internal transaction failed or replay it.

Evidence: `database-connection-executor.ts`,
`database-connection-executor.test.ts`, `database-button.ts`,
`database-button-executor.ts`, `database-automation.ts`, and their focused
tests.

Residual risk: an explicitly allowed public host can itself proxy to a private
service or retain disclosed data. Connection creation and `allowPrivateNetwork`
are owner trust decisions and remain high-risk review items.

### 6. Imported manifests and schemas

Attack: malformed YAML, aliases or oversized structures, duplicate IDs/keys,
unknown versions/types, relation cycles, unsafe source folders, hidden
automation egress, or prompt-like descriptions treated as policy.

Implemented controls:

- Parsing produces source-located diagnostics and validates one strict,
  versioned canonical schema. Unknown property/view types remain explicit and
  unsupported rather than falling back to Text behavior.
- Stable ID/key uniqueness, exactly one Title, relation targets/cardinality,
  computed dependencies, Agent View policies, automation scope, template/form
  references, and normalized source folders are validated before activation.
- Existing-folder and CSV/TSV imports are preview-first. They enumerate blockers,
  lossy conversions, target paths, and exact record identities before an
  immutable plan can commit.
- Manifest writes preserve comments/order, use atomic replacement, then reload
  and verify the canonical snapshot. Schema migration has an explicit matrix;
  unknown future versions are byte-preserved but unavailable.
- Descriptions, aliases, and vocabulary influence discovery only. They cannot
  grant permission, select a connection secret, approve a plan, or become an
  Agent View instruction without occupying the typed instruction field.

Evidence: `manifest.ts`, `schema.ts`, `migration.ts`, `diagnostics.ts`,
`database-store.ts`, `database-plan.ts`, `database-task-service.ts`, and their
schema/golden/store/plan/import tests.

Residual risk: schema validation still scales with a manifest up to its fixed
byte/node ceiling. Manifests from untrusted repositories remain preview-first;
the resource inventory pins byte, YAML alias, depth, and node refusal bounds.

### 7. Browser offline write queue

Attack: sensitive values remain in browser storage, a stale intent replays on a
different branch/server, an old schema is restored over a newer one, divergent
same-property edits silently win, or an unbounded queue exhausts storage.

Implemented controls:

- Only typed record-property mutations with exact prior-value/presence
  preconditions are queueable. Schema, lifecycle, egress, permission, public,
  Button, Verification, and automation actions fail offline instead.
- Queue entries are bound to stable database/source IDs, branch, server epoch,
  actor, and one durable idempotency key. Environment mismatch becomes a
  visible blocked entry and never executes.
- Reconciliation discards the stale definition, fetches the current schema,
  rebuilds only record operations, and uses the normal planner's optimistic
  rebase/conflict rules. Every current exact plan still requires UI review.
- IndexedDB records are strict runtime-validated, limited to 100 entries and 1
  MiB each, processed sequentially, and retained on transport failure. The UI
  exposes counts, blocked state, retry, and confirmed deletion.

Evidence: `database-offline-mutation-queue.ts`,
`database-offline-mutation-queue.test.ts`, `database-cell-mutation.ts`, and the
offline queue coverage in `DatabaseTableDialog.dom.test.tsx`.

Residual risk: queued record values are plaintext within the browser profile
and remain until committed, converged, or explicitly discarded. Device/profile
security and browser-origin isolation are trusted; shared or compromised OS
profiles can disclose them. Users can discard queued writes, and release privacy
copy must describe this retention before L-017 approval.

## Review and release gates

L-015 is complete when every required surface above has an owner, concrete
control, evidence, and stated residual risk. It does not waive the following
separate gates:

- L-016 records the implemented rate, byte, count, depth, fan-out, concurrency,
  and retry ceilings in the linked resource and abuse limit inventory.
- L-017 must run the security/privacy review, resolve or explicitly accept every
  residual risk, and record separate public-beta and GA sign-off.
- Any new executable expression, public ingress, external fetch, secret type,
  import format, or agent disclosure path must update this document and add a
  focused negative test before release.
