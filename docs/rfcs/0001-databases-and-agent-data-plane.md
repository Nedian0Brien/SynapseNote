# RFC 0001: File-native databases and the Agent Data Plane

- Status: Draft
- Last updated: 2026-07-20
- Owners: SynapseNote maintainers

Implementation tracking: [Full implementation checklist](./0001-databases-implementation-checklist.md)

Capability tracking: [Notion parity matrix](./0001-notion-parity-matrix.md)

Operations: [Migration recovery and downgrade runbook](./0001-database-recovery-and-downgrade.md)

Client guide: [Agent Data Plane examples](./0001-agent-client-examples.md)

Security review: [Database threat model](./0001-database-threat-model.md)

Resource boundary: [Database resource and abuse limits](./0001-database-resource-and-abuse-limits.md)

Release gate: [Database security and privacy review](./0001-database-security-privacy-release-review.md)

Public TypeScript: [Database v1 type and versioning contract](#public-types-and-versioning)

## Implemented foundation

The current implementation includes strict v1 manifests, typed Markdown record
materialization, deterministic exact queries, atomic manifest persistence, and a
rebuildable live record index. Its first Agent Data Plane slice is available at
both HTTP and MCP boundaries:

- `GET /api/databases/catalog?q=...` returns compact ranked database cards and
  preserves ambiguous candidates;
- `POST /api/databases/describe` expands one stable database/source with its
  contract, property semantics, constraints, relations, views, allowed
  operations, manifest revision, database-specific schema revision, and index
  state; callers may pass `ifSchemaRevision` and receive a compact
  `notModified` response;
- `POST /api/databases/find` compiles a bounded natural-language request into
  an inspectable typed query, canonicalizes option labels to stable IDs, and
  refuses execution when property resolution or value coercion is ambiguous;
- `POST /api/databases/retrieve` explicitly selects lexical, semantic, or
  hybrid retrieval and returns permission exclusions, semantic model/privacy/
  freshness receipts, deterministic reciprocal-rank-fusion contributions, and
  visible degradation state;
- `POST /api/databases/query` executes exact typed filters, sorts, projections,
  and cursor pagination against a revision-bound index snapshot;
- `POST /api/databases/record` resolves one record by stable ID in constant
  index-lookup time, applies the same row/property permission filter as query,
  and returns its canonical path, values, and exact revision without scanning
  query pages;
- `POST /api/databases/pack` turns an exact query into a goal-bound context
  artifact with an explicit token estimate, reserve, overflow cursor, omitted
  counts, and object-row or columnar/dictionary encoding;
- `POST /api/databases/plan` creates, reads, and discards ephemeral desired-state
  drafts, then compiles a draft into an immutable snapshot-bound plan without
  writing project files. Complete desired-state arrays provide create, update,
  and dependency-checked removal for sources, properties, views, templates,
  and automations; revision-bound record writes use the same endpoint;
- `POST /api/databases/commit` atomically commits an exactly approved,
  snapshot-bound database create/schema-update/record-upsert plan, verifies its
  postconditions, and returns a transaction receipt and undo token;
- `POST /api/databases/undo` previews intervening snapshot/file conflicts and
  atomically reverses an unchanged create or update transaction;
- `POST /api/databases/repair` previews and applies bounded, approval-gated
  canonical/index repairs;
- `POST /api/databases/task` previews migrations and launches, lists, gets,
  cancels, retries, resumes, and revision-safely rolls back bounded durable
  import/migration/bulk work;
- the read-only MCP `data` tool exposes the same
  `catalog → describe → find/query/pack` progression without requiring MCP
  resources or subscriptions, while the separate MCP `data_plan` tool exposes
  only non-canonical draft and planning operations and the approval-gated MCP
  `data_commit` tool exposes atomic execution and `data_undo` separates
  conflict preview from approval-gated reversal; `data_repair` handles reviewed
  repairs and approval-gated `data_task` launches and controls durable work.

All three result families expose stable IDs. Query results explicitly report
matched and returned counts, completeness, cursor, truncation cause, snapshot
revision, manifest revision, index revision, and index state. Context packs keep
schema labels single-copy, omit null/irrelevant fields, and bind continuation
cursors to both the request and snapshot. The initial deterministic `find`
compiler supports property aliases, typed equality/comparison/contains clauses,
sorting, limits, and residual free-text matching over declared text properties;
its interpretation and warnings are always returned. Lexical results include
evidence and explanation traces, while packs require an explicit `records`,
`evidence`, or `full_body` disclosure level. Permissions, broader language
understanding, delegated autonomy, and the editable database UI remain
subsequent phases and must not be inferred from this implemented slice.

Catalog cards carry a database-specific `schemaRevision`. Agents should cache a
successful description under that revision and send it back as
`ifSchemaRevision`; an unchanged response contains only revision and stable
database/source identity, avoiding repeated schema tokens.

Together these endpoints form the version-1 CRUD and migration surface.
Catalog, describe, and record provide stable-ID reads. Plan plus commit create
or update databases and every manifest-owned resource, and remove individual
resources by omitting their stable IDs from an exact desired state after
dependency review. `create_database_deletion_draft` is the explicit
last-source/database deletion operation: it requires the exact catalog snapshot
revision, freezes the complete manifest object graph and every indexed record
revision, and returns a high-risk plan requiring `delete_database` approval.
Commit removes the manifest and all frozen records atomically, verifies both
canonical and indexed absence, and returns an undo token that restores their
exact bytes if no intervening path was created. The operation is also available
through MCP `data_plan`; execution still occurs only through approval-gated
`data_commit`. Task `preview_migration` and revision-bound migration start
complete the migration endpoint without introducing a second write engine.

Every exact query also carries a stable `queryId` derived from database/source
identity and the normalized typed query, plus a `recordRevisions` receipt for
the returned page. Supplying that receipt as `deltaSince` returns explicit
added-or-changed, unchanged, removed, and absent-from-page ID sets. Removal is
reported only when both receipts are complete; otherwise absence is classified
as page-scoped rather than silently presented as deletion. Context packs carry
stable `pack_…` IDs and per-record revisions as well.

## Summary

SynapseNote will add Notion-class databases as a typed, queryable layer over the
existing Markdown workspace. Markdown files remain the canonical records and
Git remains a valid synchronization and history substrate. Database manifests,
indexes, views, and agent operations must not create a second proprietary source
of truth.

The same database engine will serve people and agents. Agents receive a
first-class data plane for discovering databases, understanding schemas,
querying records, packing evidence into a token budget, planning changes,
committing them atomically, verifying the result, and undoing reversible work.

```text
discover -> describe -> query -> pack -> plan -> commit -> verify -> undo/continue
```

## Goals

1. Represent a database as Markdown records plus a versioned manifest with
   stable database, source, property, option, and record identities.
2. Support typed properties, filters, sorts, relations, formulas, views,
   templates, and automations without making Markdown unreadable or trapping
   data in an opaque store.
3. Let an agent find the correct database and records without guessing labels
   or inferring a schema from sample rows.
4. Return the smallest sufficient, source-backed context within an explicit
   token budget.
5. Let agents create and edit every database object through the same command
   engine used by the UI, with dry runs, idempotency, optimistic concurrency,
   audit receipts, verification, and undo.
6. Preserve the standalone clone experience. A clone without a running server
   still contains every canonical definition and record.

## Non-goals

- A SQL-compatible public interface in the first release.
- Storing canonical record values only in an index or server database.
- Treating unrestricted shell access as subject to SynapseNote tool policy.
- Sending whole databases or whole documents to a model by default.
- Silently selecting an ambiguous database, coercing a property, or truncating
  a result.

## Product model

The logical hierarchy is:

```text
Database
  Data source
    Property schema
    Markdown records
  Views
```

- A **record** is a Markdown or MDX document with database identity in
  frontmatter. Its body remains normal prose and may be edited outside
  SynapseNote.
- A **data source** defines what one record means, where its files live, and how
  stable properties map to human-readable frontmatter keys.
- A **database** groups one or more compatible data sources and their views.
- A **view** is a saved projection, filter, sort, grouping, and presentation;
  it never owns record values.

## Canonical storage

Database definitions live in versioned YAML files under:

```text
.ok/databases/<database-key>.yml
```

An initial definition has this shape:

```yaml
version: 1
id: db_customer_feedback
key: customer-feedback
name: Customer feedback
description: Canonical feedback captured from customers
contract:
  purpose: Track actionable reports from customer interactions
  canonicality: canonical
  vocabulary: [customer, feedback, report]
  defaultTimePropertyId: prop_received_at
  freshness:
    expectation: daily
    maxAgeSeconds: 86400
  sensitivity: internal
sources:
  - id: ds_feedback
    key: feedback
    name: Feedback
    recordMeaning: One report from one customer interaction
    folder: feedback
    includeSubfolders: true
    properties:
      - id: prop_title
        key: title
        name: Title
        type: title
        required: true
      - id: prop_status
        key: status
        name: Status
        type: select
        aliases: [workflow state]
        semantics:
          constraints:
            unique: false
          inferencePolicy: agent_suggest
          sensitivity: inherit
          format:
            style: badge
          defaultValue: new
        options:
          - id: opt_status_new
            key: new
            name: New
          - id: opt_status_done
            key: done
            name: Done
      - id: prop_received_at
        key: received_at
        name: Received at
        type: date
views:
  - id: view_feedback_table
    key: open-feedback
    name: Open feedback
    sourceId: ds_feedback
    layout:
      type: table
      configuration:
        rowHeight: compact
    where:
      propertyId: prop_status
      operator: eq
      value: opt_status_new
    sort:
      - propertyId: prop_title
        direction: asc
    groups:
      - propertyId: prop_status
        direction: asc
        hideEmpty: false
    projection:
      propertyIds: [prop_title, prop_status]
      body: preview
```

Manifest parsing returns all available structured diagnostics with a stable
diagnostic code, schema path, and one-based line and column. Malformed YAML,
unsupported manifest versions, invalid properties, and relation-target errors
remain distinguishable; the server preserves these locations while exposing
only the manifest basename, never an absolute path.

Views are canonical saved queries, not record owners. Every view has a stable
ID and key, exactly one source, a known layout plus versioned configuration,
the same nested typed filter grammar used by exact queries, deterministic sorts,
up to two grouping levels, an ordered property/body projection, and ordered
conditional color rules targeting the page or one stable property. All
property references are validated against the selected source. An optional
canonical favorite marker is presentation metadata and does not alter query or
permission semantics.

The reviewed view lifecycle creates a default Table view with a fresh stable ID
and collision-free key, renames without changing either identity, duplicates
the complete query and presentation under a new identity, reorders only the
selected source's entries, toggles the favorite marker, and deletes only after
explicit confirmation. Every operation is one manifest-only desired-state plan.
A view referenced by `defaultViewId` cannot be deleted until the source default
is changed or cleared.

The Table can select any saved view for its source and edit that view's filter
as a recursive AND, OR, and NOT tree. A companion settings editor persists the
ordered sort list, group and subgroup, ordered property/body projection, and
typed Table display configuration for wrapping, row height, and stable-property
widths. The same editor manages ordered conditional colors with recursive typed
conditions; the first matching rule for each target wins. The filter editor derives the operator list from the selected property,
preserves typed scalar or array values, and validates the complete tree against
the source and identity directory. Both editors submit one manifest-only view
revision through ordinary exact-plan review. Clearing a filter removes only
`where`; it preserves the stable view identity and every other saved-query and
display field or conditional color rule.

Conditional colors are evaluated only for the permission-scoped records in the
returned page. Every filter dependency and property target participates in
unknown-property and effective-read-scope checks; a denied dependency rejects
the query instead of exposing a color side channel. Query responses carry the
minimal ordered rule cards and per-record matched rule IDs, and pagination
merges only matches from the same snapshot. Desired-state agents may address
filter and target properties by stable key; the compiler resolves them to IDs
and preserves each rule ID through subsequent key-matched updates.

When a saved view is active, its ordered projection also bounds the Table
columns. This is presentation visibility only: it never expands or contracts
the effective read policy, which is applied before the saved projection on the
server.

Each source may name one canonical `defaultViewId`. Definition validation
requires that the stable view exists and belongs to that source, and ordinary
manifest planning preserves or clears the reference explicitly. The browser's
last-opened selection is a separate versioned local preference. A valid local
selection—including an explicit All records choice—takes precedence over the
canonical default without being written to the shared database definition.

MDX documents may embed a canonical `DatabaseView` block with this strict
versioned reference contract:

```yaml
version: 1
databaseId: db_projects
sourceId: ds_tasks
viewId: view_active
mode: inline # or full-page
```

The contract intentionally has no record or snapshot field and rejects unknown
fields. Both display modes resolve the stable source and saved-view identities,
describe the current schema, and execute a fresh saved-view query; therefore an
embedded view and the full database surface always read one canonical Markdown
record set. The saved projection and Table layout configuration are applied to
the live result. Database change events refresh the scoped block, while a
missing source or view fails closed with a broken-reference state. Opening the
full database from an embed carries the explicit stable view target and does
not let a browser-local last-opened preference replace it.

A multi-source database declares cross-source compatibility in directed
`sourceMappings`; compatibility is not inferred from labels or coincidentally
equal property keys. Each mapping identifies the stable origin and target
source IDs and a one-to-one set of stable property-ID pairs. Select, Status,
and Multi-select pairs may additionally map stable option IDs when the two
sources use different vocabularies. Validation rejects unknown identities,
duplicate source pairs, duplicate property or option targets, mismatched
property types, a missing Title→Title pair, and any required target property
that is neither mapped nor defaulted.

Agent-authored desired state expresses the same mapping with source, property,
and option keys; normalization resolves those keys to the immutable canonical
IDs and the resolution remains visible in the compiled manifest. Omitting the
mapping field during an unrelated update preserves existing mappings. Record
moves require the exact directed mapping, use its property and option pairs,
retain the record identity and body, and still pass the ordinary revision,
path, constraint, transaction, verification, and undo guards. The Table UI
lists every source in a database but offers Move only to explicitly compatible
targets and reports the mapped-property count. A reverse move requires its own
reverse mapping.

A record remains a readable Markdown file:

```md
---
_sn:
  database_id: db_customer_feedback
  source_id: ds_feedback
  record_id: rec_018f7f3d
title: Login flow is confusing
status: new
---

The customer could not find the passkey recovery action.
```

Property labels may change, while `property.id`, `property.key`, and the storage
key remain stable. Select option labels may also change while their IDs and keys
remain stable. The initial implementation ignores unrelated frontmatter so an
existing note can participate in a database without losing user metadata.
Record identity is carried only by `_sn.record_id`, never derived from a path or
title, so file renames, title edits, and source-folder moves preserve identity as
long as the source's stable ID is retained.

Derived indexes, embeddings, cached summaries, and query snapshots are
rebuildable local state. They must not be required to interpret a clone.

The first server index is memory-only and rebuilds deterministically from the
manifest revision and canonical Markdown files at startup. Content-watcher
create, edit, move, delete, and conflict events re-materialize only affected
paths. A serialized index coordinator queues file events that arrive during a
canonical rebuild and replays them afterward, so schema refreshes cannot lose a
concurrent record edit. Because `.ok/databases` is outside the content watcher,
a dedicated shallow manifest watcher reloads the store and index on manifest
create, edit, rename, and delete. Its callbacks are held across Git batches;
within-branch operations drain incremental record events before applying any
schema refresh, while every cross-branch checkout performs a full canonical
rebuild before the branch-switch notification is published. Atomic agent
transactions route through the same coordinator. Typed value lookups use
property and record IDs; duplicate IDs, invalid
typed values, malformed or missing metadata, symlinks, and unresolved conflicts
are excluded from lookups and surfaced as path-relative diagnostics. Rebuilding
clears all prior derived state, so correctness never depends on a surviving
cache. Index status exposes its state, schema and snapshot revisions, record and
diagnostic counts, rebuild progress, freshness timestamps, and a content-free
last error. A read-only consistency audit builds a fresh canonical projection
and reports missing, stale, or changed record IDs plus diagnostic drift without
mutating the live index.

The live index also maintains a rebuildable Unicode lexical posting list for
every string-valued property and Markdown body. Retrieval selects the declared
title/text property IDs for a request and may explicitly include or exclude the
body; unrelated indexed fields cannot become matches merely because they are
present in the cache. Terms are segmented as Unicode letters, numbers,
underscore, and hyphen, normalized with NFKC, and compared using locale-aware
lowercasing. Multi-term retrieval uses deterministic AND semantics, ranks title
evidence above other selected properties and body evidence, then breaks ties by
canonical path and stable record ID.

Each lexical hit reports `matched_by`, score, record revision, and up to eight
extractive evidence entries. An entry carries a content-bound `ev_` reference,
the canonical path and record ID, property ID when applicable, exact start/end
offsets, snippet bounds, and matched terms. Offsets use UTF-16 code units so
JavaScript slicing and editor selection APIs resolve the same range. Evidence
references intentionally change when the record revision or addressed range
changes, preventing stale excerpts from being treated as current. Lexical
indexes and references are derived state and are rebuilt from canonical files.

Every lexical result also carries a deterministic explanation trace. The trace
names the `lexical_and` strategy, effective database/source/property/body scope,
per-term counts computed only inside that effective permission scope,
title/property/body ranking weights, and the path/record-ID tie breakers. A hit
exposes the corresponding score breakdown beside its evidence. An empty result
distinguishes an empty token set, a term absent from the effective scope, and
terms that exist individually but never occur together on one record. This
makes “why found” and “why not found” actionable without exposing unrelated or
permission-denied record content through corpus statistics.

### Existing-folder onboarding preview

Before any existing file is changed, the server produces a deterministic,
read-only onboarding preview. Every discovered file-like path is classified as
`include`, `exclude`, `modify`, or `reject`, with stable reason codes and exact
planned changes. Missing record identity and required properties are previewed
as modifications; malformed frontmatter, conflicting identity, symlinks, and
invalid typed values are rejected. Unsupported extensions and disallowed
subfolders are explicitly excluded. Paths are content-root-relative, scan
limits report `complete: false`, and preview generation never writes record
bytes.

Onboarding uses eager identity assignment: after the user or agent accepts a
complete preview, every included record receives stable `_sn` metadata in the
same reviewed operation. A partially onboarded source must not be presented as
complete. Files created later may receive identity in their create transaction,
but a read path never invents or persists an ID as a side effect.

### Stable-ID lifecycle

- IDs are generated from collision-resistant UUIDs and validated before write.
- A collision makes every ambiguous object invalid until explicitly repaired;
  arrival order never chooses a winner.
- Database, source, property, option, view, and record IDs survive label, key,
  title, path, and source-folder changes.
- Deletion retires an ID. The eventual transaction receipt records a tombstone
  containing the ID, object kind, deletion revision, and actor, without record
  content unless an authorized backup policy explicitly retains it.
- Retired IDs are never reused, including after restore, import, branch merge,
  or clone. Restoring an object restores its original ID only when its tombstone
  and current workspace state prove that identity is unambiguous.
- Copy and duplicate operations always mint new IDs; move and rename operations
  retain existing IDs.

### Multi-file Git transaction and undo receipts

Database writes use one immutable plan, one project write lock, and one shadow
Git commit as the atomic history boundary. A successful commit produces a
versioned `DatabaseTransactionReceipt` (`version: 1`) with:

- stable `mut_` and `plan_` IDs, the plan hash, and a one-way hash of the
  idempotency key;
- a deterministic content-free intent summary, the executing server tool name
  and runtime version, and the stable database/source IDs in scope;
- actor kind/principal/session and an offset-bearing commit timestamp;
- base and result Git object IDs plus database snapshot revisions;
- one normalized project-relative delta per created, updated, deleted, or
  renamed path;
- before/after byte counts, SHA-256 content digests, and Git blob IDs, never raw
  frontmatter, Markdown, credentials, approval tokens, or undo bearer tokens;
- typed postcondition results; and
- an `undo_` token ID bound to the result snapshot and the
  `git_three_way_reverse` strategy.

The receipt is deterministic newline-terminated JSON. Paths cannot overlap
within one receipt, rename source and target must differ, successful
verification cannot contain a failed check, and the undo expectation must equal
the committed result snapshot. The receipt is returned to the caller and kept
in the server's durable ignored runtime journal; it is not added to the content
commit, which would create a circular commit-ID dependency and unnecessary Git
noise. Git blobs and the shadow-repository commit retain the reversible bytes,
while the receipt contains only addressing and verification metadata.

The base snapshot is a project-wide shadow-Git checkpoint (`git add .` in the
isolated shadow worktree), not a per-file ad hoc backup. The database receipt
then narrows rollback authority to the exact manifest and record paths owned by
that reviewed transaction. Apply restores all of those paths as one locked
operation and rebuilds the manifest store and every derived record index; a
failure partway through restores the attempted rollback's own pre-state. This
keeps unrelated project files at their current bytes while still providing a
durable whole-project comparison point. Checkpoint plus local transaction
journal backup/restore tests cover process restart and workstation recovery.

Undo never rewrites Git history. The server resolves the receipt and bearer
token, compares every current path with the receipt's committed `after` state,
and prepares the inverse create/update/delete/rename set. If any path was
changed, removed, recreated, or occupied after the mutation—or the expected
snapshot no longer matches—the default result is a versioned refused
`DatabaseUndoReceipt` with per-path expected/observed digests and stable reason
codes. A clean inverse is committed as a new Git transaction and returns an
applied undo receipt with its result Git and snapshot revisions. Receipts never
silently merge ambiguous intervening edits.

### Compatibility, packaging, and portable state

Version 1 remains one YAML file per database. Version 2 will split independently
mergeable objects under `.ok/databases/<database-key>/`: `database.yml`, one
file per source under `sources/`, and one file per view under `views/`. Object
filenames use stable IDs while human keys remain fields, reducing rename and
concurrent-edit conflicts. A migration must write the complete v2 tree
atomically and retain a rollback receipt; mixed v1/v2 ownership is invalid.

Version 1 manifest edits reconcile a validated desired definition into the
existing YAML node tree instead of replacing the document with freshly
serialized YAML. Existing mapping order, comments, scalar presentation, and
stable-ID source/property/option/view nodes survive ordinary updates and key
renames; newly introduced fields append deterministically. The reconciled
document is parsed and schema-validated again before it is written atomically.

#### Git-readable diffs and semantic merge drivers

`ok init` adds two declarative entries to the project `.gitattributes` and
registers their commands only in the trusted clone-local Git config. A clone
cannot supply or change the executable command through committed files. The
same setup can be repaired explicitly with `ok database git-install`. If
SynapseNote is not installed or the local driver config is absent, Git treats
the unknown driver names as its ordinary text merge, so a standalone clone is
not locked into SynapseNote tooling.

The manifest driver parses and validates base, current, and incoming YAML,
then performs a three-way merge. Mappings merge by field and canonical object
sequences merge by stable `id`; ordered sequences without stable identities
remain atomic because silently unioning sort, projection, alias, or action
order would change behavior. Independent object/field changes converge, while
delete/modify and divergent same-field changes return Git conflict status.
The result is reconciled into a changed side's YAML tree so comments, mapping
order, and scalar presentation survive where unambiguous. Divergent
comment-only edits are conflicts rather than silent comment loss.

The record driver recognizes only Markdown carrying all three `_sn` database
identity fields; every other Markdown file delegates to `git merge-file`.
Database frontmatter merges by human-readable property key while identity is
immutable. Independent property and body-versus-property changes converge.
Because every record write updates shared attribution, concurrent
`last_edited_at`/`last_edited_by` values are treated as one pair and the pair
with the uniquely later valid timestamp wins. Equal/invalid timestamps with
different actors, identity drift, same-property divergence, delete/modify,
and simultaneous different body edits remain explicit conflicts.

On semantic refusal the driver prints content-free property/object paths,
invokes Git's text conflict rendering, and exits non-zero. If the text merger
would incorrectly report success for a semantic conflict, the driver writes a
whole-artifact diff3 marker and still exits non-zero. Thus conflicts remain
readable in ordinary Git tools and an invalid or ambiguous result is never
presented as a clean database artifact.

#### Partial Git transition detection and recovery

An external merge, rebase, cherry-pick, or revert can place cleanly merged
database files in the index while another manifest or record remains
unmerged. The server treats that working tree as one incomplete canonical
transition. It inspects Git operation markers plus staged, unstaged, and
unmerged paths; recognizes manifests by their `.ok/databases` ownership and
records by indexed path, current `_sn` identity, conflict stages, or the
operation's revision blobs. Ordinary non-database conflicts do not activate
the barrier, while an unreadable Git index fails closed.

When detected, the Git batch watcher retains the last complete in-memory
database snapshot and its buffered disk events instead of rebuilding from
partially applied files. Catalog, describe, query, context-pack, and planning
reads continue to return the existing `transaction_in_progress` barrier until
Git reaches a settled state and the canonical store/index rebuild completes.
The status contains only operation kind, repository-relative paths, and a
content-free SHA-256 revision.

Recovery is always explicit. `ok database git-recovery status` prints that
state as JSON. `ok database git-recovery abort --expected-revision <revision>`
re-inspects the state, rejects a stale revision, and invokes only the matching
Git abort command. It never guesses how to resolve an orphaned unmerged index;
that state is reported as `unresolved` with `canAbort: false`. After an abort,
the store and all derived record indexes rebuild before the barrier is
released. Deleted and renamed records are detected from revision blobs, so a
multi-record operation cannot evade the guard merely because one side removed
the current file.

Stable IDs are canonical data, never regenerated by a Git transition. Branch
checkout reloads the complete target manifest and record set, and switching
back restores the original branch's exact database, source, property, and
record IDs. Semantic merge and rebase operate on objects by those IDs and keep
identity fields immutable. Push, clone, pull, and other hosted-Git transport
copy the canonical files without a local identity rewrite; a clone without the
optional merge-driver command therefore retains the same IDs as its source.
Real branch-switch, semantic-rebase, bare-remote clone/push/pull fixtures pin
this continuity behavior.

The conflict corpus is deterministic across writer identities and transport
boundaries. Human/human, human/agent, and agent/agent fixtures make divergent
writes to the same record property and require the identical stable property
path plus `both_changed` reason; attribution timestamp selection never hides
the value conflict. A filesystem/CRDT fixture makes overlapping body changes
from one shared base and requires an explicit block conflict. A Git/CRDT
fixture presents diff3 marker bytes and requires refusal before those bytes can
enter the live document. Together these fixtures pin both conflict detection
and the boundary at which automatic reconciliation must stop.

The canonical manifest migration matrix starts with the following complete set
for currently supported versions:

| Source | Target | Canonical rule | Loss and source preservation |
| --- | --- | --- | --- |
| v1 | v1 | `database-manifest-v1-identity` | Lossless and byte-preserving; no write is needed. |
| unknown/future | v1 | Refuse as `unsupported_source_version`. | Preserve the input untouched for diagnostics or a newer binary. |
| v1 | unknown/future | Refuse as `unsupported_target_version`. | Never guess a target shape or serialize an implicit upgrade. |

Every newly supported manifest version must add a uniquely named directed
migration edge so every supported prior version has a composed path to the
current version. Each non-identity edge must define its stable-ID mapping,
unknown-object behavior, loss classification, post-migration validation,
fixture corpus, and reverse/rollback strategy before the version enters the
supported-version list. Migration planning is non-mutating; execution remains
the explicit `plan → preview → commit → verify` transaction described below.

Readers accept only versions and object types whose semantics they implement.
An unknown manifest, property, view, formula AST, or automation version is
preserved byte-for-byte and surfaced as unsupported; it is never coerced to a
known type or mutated. Newer-version databases stay visible in diagnostics but
are unavailable to query and write operations. Additive format changes require
an explicitly supported version, and downgrade requires an explicit, previewed,
lossless migration or refuses. The parser represents each unknown property or
view as an `unsupported` object containing its kind, declared type, schema path,
and raw mapping, so tooling can display or migrate it without inventing text
semantics.

Only canonical manifests, Markdown records, and explicitly provenance-bearing
summaries are portable. Embeddings, vector indexes, lexical indexes, query
snapshots, generated context packs, and model-specific caches are local derived
state under ignored runtime storage. Every semantic cache carries its provider,
model, dimensions, source hash, and schema revision and is discarded on any
mismatch; clone correctness never depends on it.

#### Optional semantic index and hybrid retrieval contract

Semantic retrieval is an optional derived service, never an implicit upgrade
to lexical search. Its operator-owned configuration identifies a provider ID,
exact model ID, vector dimensions, distance metric, and privacy mode. Privacy
is one of `local_only`, `remote_allowed`, or `blocked`; a remote provider may
receive canonical text only when the effective mode is explicitly
`remote_allowed`. Disabled, blocked, unavailable, or mismatched configuration
leaves lexical and typed queries fully usable.

Each source-local semantic snapshot records the database/source IDs, provider,
model, dimensions, schema revision, canonical index revision, projection of
stable property IDs, body inclusion, creation time, and a hash for every
embedded record input. Its public state is `disabled`, `building`, `ready`,
`stale`, or `error`, with content-free reason and freshness counts. A provider,
model, dimension, schema, projection, or source-hash mismatch is reported as
stale and never queried as if current. Vectors and model responses remain in
ignored local runtime storage and are never written to manifests, Markdown,
Git, logs, context packs, or audit receipts.

Semantic and hybrid requests are explicit. The trusted data plane resolves row
and property permissions first, then searches only the permitted record IDs
and permitted indexed projection. A semantic hit returns record identity,
model/snapshot receipts, cosine score, and the exact stable property IDs/body
flag used to embed it; it does not invent an extractive excerpt. Callers that
require quotations request lexical evidence or a context-pack evidence
expansion separately.

Hybrid ranking combines independently permission-scoped lexical and semantic
rank lists with deterministic reciprocal-rank fusion: `1 / (60 + rank)` for
each participating list, fixed lexical and semantic weights declared in the
request, descending fused score, then canonical path and record ID. The trace
returns requested/applied mode, weights, fusion constant, each component rank
and contribution, model/snapshot/freshness/privacy receipts, permission
exclusions, truncation, and any explicit degradation reason. It never exposes
corpus-wide counts or scores from denied rows. If semantic state is not ready,
`hybrid` either fails when `requireSemantic=true` or returns a visibly degraded
lexical result; it never silently labels lexical-only ranking as hybrid.

#### Reproducible benchmark corpus

Performance work uses one versioned deterministic corpus at exact `1k`, `50k`,
`500k`, and `1m` record scales rather than unrelated hand-built fixtures. Seed
`0x5a172026` produces the same random-access record at every scale, so a smaller
run is a stable prefix of a larger run. The canonical schema has 30 properties:
title and text, finite numeric measures, checkboxes, dates, Select and
Multi-select options, URL/email/phone, single and multi-person values, two
self-relations, created/edited metadata, two formulas, and one relation Rollup.
It also declares 50 mixed human/agent people and a sorted Table view.

The body distribution is 10% empty, 70% short (80–400 bytes), 18% medium
(1–4 KiB), and 2% long (8–16 KiB). Optional scalar values are independently
missing 15% of the time. Each relation is 20% empty, 55% 1–3 targets, 20% 4–8,
and 5% 9–20, with no self-edge and deterministic stable record IDs. Status,
priority, region, tags, people, due dates, completion, cost, risk, and progress
use fixed documented distributions rather than constant placeholders.

`bun run --filter @nedian0brien/synapsenote-server
benchmark:database:generate --scale 50k --out <empty-directory>` streams a
canonical manifest plus NDJSON records without retaining the corpus in memory.
The command accepts only the four declared scales, refuses a non-empty output
directory, and emits record count, file/byte count, and a SHA-256 corpus digest.
Tests validate all four schema/count contracts, deterministic random access,
distribution bounds, unique identities, relation/body ceilings, reproducible
materialization, and overwrite refusal. P-002, P-003, and P-012 consume this
same generator and must record the scale, seed, runtime, OS, architecture, and
corpus digest with every result.

The warm typed-query reference gate uses the `50k` corpus and all 30 declared
properties, with a three-clause typed filter, two stable sorts, five-property
projection, and a 100-record page. It performs five unmeasured warmups followed
by 30 samples and uses nearest-rank p95. The reference environment is the
supported local arm64 macOS runtime with Bun 1.3.13 or newer and Node 24 or
newer; every run records exact runtime and OS metadata so unlike environments
are not silently compared. On 2026-07-21, Bun 1.3.14/Node 24.3.0 on arm64
Darwin measured p50 18.829 ms, p95 22.513 ms, and p99 27.269 ms for 5,915
matches, passing the strict p95 `< 150 ms` gate. The raw version-1 result is
stored under `packages/server/benchmarks/baselines`, and
`bun run --filter @nedian0brien/synapsenote-server
benchmark:database:query` reruns the executable gate and exits nonzero on
failure.

The database lifecycle gate measures product paths independently of unrelated
HTTP, collaboration, and desktop startup. Canonical Markdown materialization is
unmeasured setup. Five fresh process-state samples use the shared corpus and
strict nearest-rank p95 budgets: 1k-manifest cold discovery `< 250 ms`, canonical
1k initial record-index rebuild `< 5,000 ms`, one-record incremental index
upsert `< 50 ms`, full 1k derived Formula/Rollup projection after a value change
`< 500 ms`, and a five-property columnar context pack over a typed 50k query
`< 150 ms`. `benchmark:database:lifecycle` reruns all five gates and exits
nonzero on failure. The reference run measured p95 15.306 ms, 2,647.149 ms,
3.160 ms, 39.502 ms, and 30.762 ms respectively.

View rendering remains an application DOM measurement rather than a server
substitute. The focused `DatabaseTable.performance.dom.test.tsx` gate mounts a
1,000-row, 30-property result through the real Table component five times,
asserts that row virtualization keeps fewer than 40 records in the DOM, and
requires p95 `< 500 ms`. The reference jsdom run measured p50 98.120 ms and p95
218.826 ms. Versioned raw reference results for server lifecycle and app view
render live under each package's `benchmarks/baselines` directory with exact
runtime and machine metadata.

Browser view growth is structurally bounded as well as measured. Table keeps a
5,000-record client snapshot, renders only the viewport plus six-row overscan,
and mounts at most the first 100 visible properties at once; a visible status
explains how to hide or reorder columns beyond that boundary. All card,
spatial, aggregate, and compact saved-view layouts keep at most 500 loaded
records, while their schema-defined group, card, day, interval, projection,
drill-through, and widget limits apply inside that snapshot. The final page is
automatically shortened to the remaining capacity, and a visible status asks
the user to narrow filters or switch saved views instead of accumulating an
unbounded result array. Focused unit and DOM tests pin every layout-class limit,
the Table's row window, and its wide-schema column ceiling.

Typed property queries consume a body-free record-index projection. They do not
open canonical Markdown files, parse bodies, or clone the indexed body strings
while applying permissions, Formula/Rollup projection, filters, sorts,
aggregation, conditional colors, and relation cards. The canonical body remains
available in the index for explicitly separate lexical evidence and `full_body`
context disclosure, so opting into those modes preserves exact body and
evidence revisions. Index tests pin both projections, while focused Data Plane
and HTTP tests prove ordinary typed queries and explicit full-body packs remain
independent.

Canonical database records share the editor's 512 KiB document-open boundary
and a public 64 KiB frontmatter boundary. Materialization fails before YAML
parsing when either UTF-8 byte limit is exceeded, preserves the file untouched,
and records the exact `document_too_large` or `frontmatter_too_large` diagnostic
in the source index. The error reports observed and allowed bytes and gives a
concrete migration: move large prose into the Markdown body (when frontmatter
alone is oversized), split it into linked documents or records, or store large
payloads as Files. Record-identity insertion uses the same exported
frontmatter constant, preventing write/read limits from drifting.

Long-running database work stays outside synchronous request and UI loops.
Initial index rebuild awaits each canonical file read and exposes live
discovered and processed counts; the 1k canonical-corpus test also requires
repeated event-loop heartbeats before completion. Import and migration run as
durable background tasks, check cancellation between targets, and await a
persisted checkpoint on every record or manifest. Bulk mutation awaits the
common atomic commit engine, automation awaits durable run/outbox transitions
between executions, and Git or schema refresh uses the index coordinator,
which coalesces rebuild requests and replays watcher events received during a
rebuild. Focused coordinator, task, automation, and canonical-corpus suites pin
these responsiveness and convergence boundaries.

Recovery is canonical-file-first and failure-injected. Restart converts orphaned
running tasks into retryable terminal state, resumes durable checkpoints and
outboxes without duplicate commits, and resolves persisted undo/idempotency
receipts. Atomic ENOSPC failures preserve the previous manifest; temporary
EACCES reads become an `unreadable_manifest` diagnostic and a later reload
recovers after access returns. Malformed files remain untouched and isolated as
diagnostics. Shared locks clear only age-qualified stale entries, while timeout
and warning failures remain explicit. The derived record index has no trusted
durable cache and deterministically rebuilds from canonical files after loss or
corruption. Injected rename failure preserves the original manifest, and the
transaction backup path restores exact manifests, records, index state, and
journals after interrupted multi-file work. Focused store, lock, task,
rollback, index, commit, and automation tests cover every failure class.

Query and pack cancellation is cooperative and end-to-end. MCP request signals
compose with the transport timeout, disconnected HTTP requests expose an abort
checkpoint to the Data Plane, and query, derived-value, aggregation, projection,
relation-evidence, and token-packing loops check that checkpoint at bounded
intervals before returning a result. Cancellation therefore returns no partial
query or pack. Durable tasks retain their persisted per-target cancellation
boundary and cannot be resurrected by a late handler result. Rebuild-time file
events use a bounded 1,000-event queue; overflow discards the incomplete replay
set and schedules one canonical follow-up rebuild so disk state wins. Change
subscriptions are capped at 256 live listeners and release capacity immediately
on unsubscribe. Focused core, Data Plane, MCP, task-runner, and coordinator tests
pin signal propagation, cancellation, queue convergence, and listener limits.

Determinism uses public versioned golden vectors rather than product-local
assertions. The existing query runner fixes filtering, natural Unicode sorting,
projection, aggregation, pagination, snapshot continuation, and empty-result
semantics. A Formula runner fixes the schema, records, clock, UTC time zone,
locale, permission revision, successful numeric outputs, and typed failure codes.
Core, browser request serialization, direct server, HTTP, MCP, and desktop package
tests consume those same vectors without rewriting expected results. The focused
`Database determinism` workflow runs the product-boundary tests unchanged on
Ubuntu, macOS, and Windows with the repository's pinned Bun version and Node 24;
any runtime or operating-system divergence fails the exact golden comparison.

`bun run check:database:regression` is the release-oriented aggregate gate. It
composes the warm typed-query and lifecycle latency benchmarks, the real DOM
Table render benchmark, the application size-limit build, and a deterministic
50k resource benchmark. The resource benchmark caps the versioned
`js-structural-v1` retained working-set estimate at 320 MiB, canonical index
JSONL at 128 MiB, and a five-property columnar agent pack at 7,500 estimated
tokens while requiring at least 90 records. The 2026-07-21 arm64 macOS baseline
measured 279,988,258 retained bytes, 112,730,652 index bytes, and 7,486 tokens
for 95 records. Bundle budgets are 550 kB for the main JS entry, 3.60 MB for all
JS, 60 kB for main CSS, and a dedicated 90 kB database-workspace chunk, all
gzip. The measured values were 524.36 kB, 3.44 MB, 57.02 kB, and 82.01 kB.
Every component remains independently runnable during development, so a change
can use the smallest relevant gate without repeating the aggregate suite.

Database operations have complete keyboard entry points. Table cells support
arrow navigation across the virtualized window, Shift+Arrow rectangular
selection, Enter editing, canonical copy/paste, and Context Menu or Shift+F10
actions. The action menu moves focus to its first enabled item, implements
Arrow/Home/End traversal, and restores the originating cell on Escape. Record
open, duplicate, archive/restore, move, and delete actions; property configure
and conversion actions; saved-view create, rename, reorder, favorite,
duplicate, configure, and delete actions; and database creation/import controls
are native labeled buttons, inputs, and selects. Board, Timeline, List, and
record-title interactions retain their focused keyboard transitions. Focused
DOM tests pin cell navigation, virtualized focus scrolling, menu focus return,
view management, row actions, and non-Table layout keyboard changes.

The virtualized Table exposes one named ARIA grid with logical row and column
counts, one-based row and column indices, row selection, gridcell selection,
and a roving cell tab stop. Arrow navigation updates both DOM focus and the
single tabbable cell, including when the target requires a virtual-window
scroll. Spacer rows are hidden from accessibility APIs, while caption, column
headers, record-selection controls, and action cells keep native semantics.
Board exposes a named region, labeled swimlanes and groups, semantic record
lists with position/set size for truncated groups, named cards, and a polite
atomic move announcement. Visual drag transitions and keyboard Select
transitions share the same mutation and announcement path. Focused DOM tests
assert roles, names, indices, roving focus, card positions, and live movement
text.

Database surfaces use the shared AA contrast tokens, three-pixel visible focus
rings, reduced-motion media rules, named native form controls, `aria-invalid`
and described error messages, and bordered/text-labeled warning and failure
states so meaning never depends on color alone. Charts attach a textual
category/series/value representation to each graphic while keeping every data
point available as a named drill-through button. Maps expose mapped and missing
locations as text, keep labeled marker and zoom controls, and make the canvas a
focus-visible keyboard surface with Arrow pan, plus/minus zoom, and Home reset.
Focused DOM contracts cover the chart descriptions, map description and
keyboard state changes, alerts, labels, and non-color names alongside the
repository accessibility suite.

The database workspace header and actions wrap in narrow desktop panes, its
catalog collapses above the main surface, content padding contracts on small
windows, and Table, Board, and Chart retain bounded two-axis scrolling instead
of shrinking or dropping canonical values. Map height scales down before the
desktop breakpoint. All database surfaces inherit rem-based browser zoom and
shared text wrapping; a database-scoped reduced-motion rule collapses animation
and transition time, while forced-colors rules restore system borders and
selection outlines for status, selected cells, pressed chart series, and open
map clusters. These rules complement the semantic grid/list/chart/map
alternatives and remain covered by the focused layout DOM suite and app type
check.

Database UI copy participates in the existing Lingui extraction and pseudo-
locale pipeline. Display formatting is deliberately separate from canonical
storage and query comparison: the app uses the active Lingui locale for Table
number and currency semantics and a shared display-only `Intl` layer for
numbers, currency, date/time, relative time, and natural label collation.
Feed, record history, Forms, Charts, and Maps use that layer; core continues to
serialize values and perform canonical sort with locale-neutral contracts.
Focused tests compare multiple locales and pin that display collation never
enters stored values or query ordering.

User-authored property names and Table values use automatic bidi direction,
bounded widths, wrapping or truncation with the complete value retained in the
accessible name/title, and Unicode-preserving string paths. Cell editors also
use automatic bidi direction and ignore Enter while an IME composition is
active, preventing a CJK composition from becoming an accidental commit.
Focused DOM coverage round-trips mixed CJK, skin-tone emoji, decomposed
combining marks, and Arabic. Canonical strings are never normalized on write;
the versioned core query comparator applies its documented NFKD transform only
to comparison keys and retains the original bytes and values.

All canonical record, bulk, schema, option, view, import, and migration writes
enter the same exact-plan review path. The review renders ghost before/after
values plus exact record/manifest/template counts, plan risk level and reasons,
and a recovery statement before an explicit Commit action; Discard leaves the
canonical snapshot untouched. Lossy conversions require their separate loss
approval, delete/archive/restore and queued-write discard retain named scope,
and successful reversible commits expose the returned durable undo token as
**Undo last change**. Permission revocation, which is an immediate owner-policy
write rather than a canonical plan, has its own confirmation naming principal,
role, database/workspace scope, immediate effect, and recreate-grant recovery.
Focused tests pin deletion preview/discard/commit, risk and scope copy, exact
undo, option impact preview, lossy conversion approval, and permission-revoke
confirmation.

Database records do not introduce a parallel page identity. Every record stays
the ordinary canonical Markdown/MDX document, and record opening converts its
path through the existing document-hash route. The normal editor activity pool
therefore owns tab reuse, source/WYSIWYG switching, graph and backlink
discovery, document search, and Timeline/history behavior. Database record
chrome is an additive property/title projection inside that same editor entry;
body editing remains TipTap/CodeMirror and history attribution continues
through the shared document providers. Focused navigation tests include nested,
spaced, CJK, and emoji paths; record-page tests pin title/property integration;
and realtime Table tests pin stable-ID refresh without replacing the active
document conventions.

#### Query resource ceilings

Every potentially multiplicative read stage has a deterministic ceiling. A
request that exceeds an input bound fails with recovery metadata; ordinary
result caps preserve exact matched/completeness or omitted counts.

| Stage | Ceiling | Observable behavior |
| --- | --- | --- |
| Lexical retrieval | 16 unique terms, exact top 500 retained hits, 8 evidence spans per hit | Too many terms returns `resource_limit`/HTTP 413 with `reduce_request`; retained-hit truncation reports exact `matched`, `returned`, and `isComplete`. |
| Semantic retrieval | 128 documents per provider batch, 500 fusion candidates, 100 returned hits | Rebuild batches are bounded and stale generations stop between batches; responses report candidate limit and semantic freshness. |
| Relation expansion | depth 3, 500 related records total, 50 records per relation | Returns depth, record, fan-out, missing, permission, cycle, and deduplication omission counts. |
| Formula | AST depth 64, 2,048 AST nodes, 100,000 evaluation steps, 10,000 list items, 100,000 text code units | Returns a typed `resource_limit` problem instead of partial evaluation. |
| Rollup | 10,000 visible relation targets and 10,000 projected values | Refuses resource exhaustion; incomplete upstream relation snapshots retain their explicit truncation cause. |
| Aggregation/query | 2 grouping levels, 100 calculations, 1,000 memberships per record, 500 returned groups, 500 records per page | Combinatorial membership overflow fails explicitly; groups and pages report independent truncation/completeness. |

These limits bound intermediate response/provider work and combinatorial
expansion. Corpus traversal remains proportional to the permission-scoped
source snapshot; latency and memory targets for the 50k–1m benchmark datasets
are tracked separately by P-001 through P-003 and P-012.

#### Feature flags and downgrade contract

Database feature flags control exposure and execution, never interpretation of
unknown data. They are local/operator policy and do not enter canonical
manifests:

| Flag | Default before its milestone | Scope | Disabled behavior |
| --- | --- | --- | --- |
| `databases.ui` | off until Table alpha | user/session | Hide creation/editing UI; keep diagnostics and canonical files untouched. |
| `databases.mutations` | off until safe-write gates pass | server/session | Keep read Data Plane available; refuse plan commit/undo before mutation with a typed capability error. |
| `databases.semantic_index` | off | project/local machine | Use deterministic lexical retrieval only; delete/ignore incompatible semantic caches. |
| `databases.automations` | off | project/server | Do not schedule or execute triggers; preserve definitions and expose paused/unsupported state. |
| `databases.write_version` | `1` | project/server | Emit only the selected fully supported canonical version; never upgrade on read. |

Turning a flag off is not a downgrade and never rewrites data. A real downgrade
is an explicit `plan → preview → commit → verify` migration to an older write
version. The preview lists every unsupported object and value, changed path,
lossy conversion, and unavailable behavior. It proceeds only when the migration
is lossless or the user separately approves every enumerated loss; otherwise it
refuses and leaves bytes untouched. The transaction creates a backup/shadow-Git
base checkpoint and undo receipt before replacing ownership. Mixed-version
ownership, implicit export-as-text, dropping unknown mappings, and enabling an
unknown version by feature flag are prohibited. Older binaries encountering a
newer version keep it diagnosable and byte-preserved but read/write unavailable.

The [Notion parity matrix](./0001-notion-parity-matrix.md) is reviewed against
official Notion database/property/view/automation documentation at least once
per monthly release cycle and whenever a Notion database capability changes.
Any detected addition or semantic change must update the matrix, map to one or
more checklist IDs, and add or revise acceptance tests before parity is claimed.

### Deletion, archive, trash, and purge semantics

Database ownership distinguishes four operations:

- **Archive** keeps the canonical object and stable ID queryable only when
  `include_archived` is explicit. For records it is a canonical record-state
  transition, not a file move; for options/templates/automations it prevents new
  use while preserving existing references.
- **Delete** removes the object from the active canonical graph in one planned,
  verified transaction and appends its stable ID, kind, deletion mutation,
  timestamp, and former owner to a versioned canonical tombstone registry. IDs
  are never reusable.
- **Trash** is the recoverable state represented by the deletion receipt,
  shadow-Git blobs/commits, and tombstone. SynapseNote does not keep a second
  mutable Markdown copy in a trash folder. The UI may project receipts as a
  trash list, but that projection is derived state.
- **Purge** expires local bearer tokens and derived previews after retention. It
  cannot erase shared Git history or free a stable ID for reuse. Purging content
  bytes requires a separate, explicitly destructive history-rewrite workflow
  outside normal database operations.

Every delete plan freezes affected IDs and inbound references. Object rules are:

| Object | Default delete behavior |
| --- | --- |
| Record | Remove its canonical Markdown file and tombstone `rec_…`; refuse or explicitly rewrite inbound relations. |
| View | Remove only the view definition; never delete source records. |
| Property | Preview every populated value, formula/rollup/view dependency, API projection, and frontmatter key. Require an explicit map, preserve-as-unowned-frontmatter, or discard decision. |
| Option | Refuse while referenced unless the plan maps, archives, or explicitly clears every value. Tombstone the `opt_…` ID. |
| Relation | Preview both directions and every dependent rollup/formula; paired relations change atomically. |
| Source | Refuse a non-empty source unless the same plan archives/moves/deletes all records and rewrites inbound relations/views. |
| Database | Freeze and preview all sources, records, views, templates, automations, relations, and public/integration references; delete them under one transaction. |
| Template/automation/button | Disable first when external or scheduled effects may still run; delete only after dependency and in-flight-run checks. |

Undo uses the normal conflict-previewed reverse transaction. It restores the
original IDs only when tombstones, current paths, schema ownership, and inbound
references remain unambiguous; otherwise it refuses with per-object conflicts.
Git merge of delete-versus-edit is never resolved by silently resurrecting or
discarding the record. Retention policy affects token/previews only, is shown to
the user, and cannot weaken canonical tombstone non-reuse.

### Formula language and canonical AST

SynapseNote formulas use **Synapse Formula 1**, a typed, pure expression
language whose user-facing syntax follows the familiar Notion Formula 2.0
model: property references, literals, arithmetic/comparison/logical operators,
ternaries, functions, lists, variables, `let`, lambdas, and method-style list or
text calls. This preserves the expected authoring model described by Notion's
[formula syntax reference](https://www.notion.com/en-gb/help/formula-syntax) and
[Formula 2.0 guide](https://www.notion.com/en-gb/help/guides/new-formulas-whats-changed),
including typed rich results and relation/list traversal. It is a documented
compatibility target, not permission to silently accept an unsupported Notion
function.

The language is not JavaScript, CEL, or an embedded host runtime. No formula can
perform I/O, network access, filesystem access, mutation, reflection, or dynamic
code evaluation. Time-dependent built-ins receive a transaction-frozen clock;
locale, timezone, and collation are explicit evaluation context. Evaluation
errors are typed values and diagnostics, never implicit empty strings or zeroes.

The editable source expression and canonical representation are separate:

- source text retains multiline formatting and comments for the editor;
- parsing resolves display-name references to stable property IDs;
- method syntax such as `Tags.length()` normalizes to a canonical `call` node
  with the receiver as its first argument;
- the canonical `synapse-formula-1` AST is authoritative for dependency
  analysis, hashing, migrations, evaluation, agent diffs, and Git comparison;
- renaming a property updates presentation text when safe but never changes its
  canonical `propertyId` dependency.

The core `synapse-formula-1` compiler now owns this boundary. Source uses
JSON-escaped strings, finite numbers, booleans, `null`, offset-bearing
`date("…")` literals, lists, unary and arithmetic/comparison/logical operators,
ternaries, calls, `let(name, value, …, body)`, and lambdas. `prop("key-or-id")`
resolves within the current source; `page.prop("key-or-id")` resolves against a
statically known related source. Method notation such as
`prop("tags").length()` parses to the same canonical call as
`length(prop("tags"))`. `and`/`or`/`not` are accepted alongside
`&&`/`||`/`!`; the deterministic formatter emits one canonical operator form.
Line and block comments are accepted as editable source trivia and never enter
the AST or hash.

Type checking maps the database schema to formula value types, carries the
target source through page/relation traversal, scopes sequential `let`
bindings, checks homogeneous lists, operator operands, ternary branches,
function arity/signatures, and the declared result type, and returns structured
path-addressed issues. Function signatures are injected explicitly: an unknown
function is rejected until it belongs to the H-007 library, rather than being
guessed or delegated to a host runtime. Syntax compilation enforces the same
AST node/depth limits as direct versioned-AST ingestion. Formatting a valid AST
and recompiling it preserves the canonical expression and stable property IDs.

AST version 1 contains only `literal`, `property`, `variable`, `list`, `unary`,
`binary`, `conditional`, `call`, `let`, and `lambda` nodes. Relation traversal
is a `property` node whose optional `record` expression identifies the related
page. Formula results declare one of `null`, `text`, `number`, `boolean`, `date`,
`person`, `page`, or `list`. Canonical JSON is key-sorted, whitespace-free, and
newline-terminated. Parsers reject unknown nodes/operators, malformed stable
IDs, non-finite numbers, ASTs deeper than 64 nodes of nesting, and ASTs larger
than 2,048 nodes.

These parser, formatter, schema-aware type checker, and canonical version-1 AST
serializer contracts complete H-006. Evaluation, the standard function
library, dependency/cycle analysis, incremental recomputation, typed runtime
errors, editor previews, and deterministic evaluation context are separate
layers rather than parser responsibilities.

The H-007 standard library is one shared registry of static signatures and pure
runtime implementations. The compiler includes these signatures by default;
callers may add explicitly named extensions without making unknown functions
valid. The initial stable function surface is:

- text and collection polymorphism: `length`, `concat`, `contains`,
  `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `substring`, `replace`,
  `replaceAll`, `split`, and `repeat`;
- finite numbers and explicit boolean conversion: `abs`, `ceil`, `floor`,
  `round`, `sqrt`, `pow`, `min`, `max`, `sum`, `average`, `empty`, and
  `toNumber`;
- deterministic dates: `now`, `today`, `dateAdd`, `dateSubtract`,
  `dateBetween`, `year`, `month`, `day`, `hour`, and `minute`;
- lists: `at`, `first`, `last`, `slice`, `reverse`, `unique`, `join`, `flat`,
  `map`, `filter`, `some`, `every`, `find`, `findIndex`, and `sort`;
- permission-projected Person and relation Page values: `id`, `name`, and
  `sourceId`.

`dateAdd`, `dateSubtract`, and `dateBetween` deliberately accept only elapsed
`milliseconds`, `seconds`, `minutes`, `hours`, `days`, or `weeks`; calendar
month/year arithmetic is not guessed. `now` is the transaction-frozen instant,
`today` uses the explicit IANA timezone, date parts use that timezone for
timestamps and preserve date-only civil values, and text case/sort use the
explicit locale. Higher-order list functions receive only evaluator-created
one- or two-parameter lambda closures (value and optional index); predicate
functions require a boolean result statically and at runtime. Page/Person
`name` reads only an already permission-projected title/name and returns a
typed missing-projection problem otherwise. No function resolves additional
records or identities itself. Text and list inputs and outputs are bounded at
100,000 characters and 10,000 items, numeric outputs must remain finite, and
all arity, type, domain, projection, and resource failures are structured.
This completes H-007; expression evaluation and persistence remain D-016 and
the dependency/runtime work in H-008–H-014.

H-008 uses one database-wide graph keyed only by stable computed-property IDs.
Formula dependencies are collected from every canonical `property` node,
including relation-record traversals nested inside calls, `let`, and lambdas;
Rollup supplies the same graph with explicit stable relation/target dependency
IDs. Raw properties remain visible dependencies but only Formula/Rollup nodes
participate in computed edges. Duplicate nodes, malformed IDs, missing Formula
ASTs, invalid Rollup edges, more than 10,000 computed nodes, or more than
100,000 dependency edges fail closed.

The graph records sorted direct dependencies, computed dependencies, and
reverse dependents. Tarjan strongly connected components identify self-cycles
and indirect Formula/Formula, Formula/Rollup, or Rollup/Rollup cycles. Normal
schema admission rejects any cycle with the complete graph and canonical cycle
path attached; inspection and repair may request surface mode, which returns
the cycles, every transitively blocked downstream property, and a deterministic
dependency-first order for unaffected nodes. No cycle is silently broken by
manifest order, property names, or last-write-wins behavior. This completes
H-008; incremental invalidation and execution use this graph in H-009.

H-009 separates an inspectable invalidation plan from execution. A change set
distinguishes property values that have already changed from Formula/Rollup
definitions or cached targets that must themselves be invalidated. Planning
finds only direct consumers and their transitive downstream slice, filters that
slice through the graph's deterministic dependency-first order, and surfaces
cycle-blocked properties without attempting them. During execution, an
evaluator reports whether the persisted value or persisted error state actually
changed; unchanged results stop propagation, while independent direct causes
remain dirty. Unrelated computed properties never enter the plan.

Concrete execution is scoped by stable source, record, and property IDs. A
same-source dependency automatically targets only the changed record. For
relation traversal and Rollup reverse edges, the host supplies a
permission-filtered resolver that returns the owning record IDs; the engine
deduplicates and evaluates those targets deterministically. Schema-wide
definition changes instead supply explicit invalidated record targets. At most
100,000 concrete targets may enter one run, invalid IDs and unavailable reverse
resolution fail structurally, cycle targets are reported rather than executed,
and adapter failures identify the exact target and already evaluated prefix.
The evaluator/rollup adapters stage their results inside the caller's database
transaction and return only whether the canonical value-or-error state changed,
so the scheduler neither invents persistence nor permits partial commits. This
completes H-009; expression evaluation, typed runtime errors, and Rollup
aggregation remain D-016, H-010, and H-011 respectively.

H-010 fixes the derived Formula cache and API boundary to one explicit result
union: `{ kind: "value", valueType, value }` or `{ kind: "error", problem }`.
There is no nullable convenience field whose absence can be confused with an
empty string, zero, false, or an empty list. Persistable values retain their
exact null, text, finite-number, boolean, date, Person, Page, or recursive-list
type; evaluator-only lambda closures are rejected at this boundary. Declared
and runtime value types must match.

Problems carry a stable code, bounded human message, optional AST path,
property ID, function name, argument index, and a typed nested cause. The v1
codes distinguish unsupported language/version, missing property/record,
permission denial, dependency failure, unknown variable/function, argument
count/type, invalid operands, division by zero, function domains, missing
permission projection, result-type mismatch, resource exhaustion, dependency
cycles, and redacted internal failures. Standard-function failures map without
losing function or argument identity; a downstream dependency failure retains
the stable property ID and complete typed cause.

Results serialize as canonical key-sorted JSON and therefore provide the exact
value-or-error fingerprint used by H-009: a changed error code, message, path,
or cause propagates, while an identical failure does not trigger downstream
work. Results are bounded to 100,000 nodes, depth 64, and 16 nested causes.
Typed evaluator failures cross the capture boundary unchanged; malformed
results become `result_type_mismatch`, resource failures remain
`resource_limit`, and unexpected exceptions become a content-free
`internal_error` rather than leaking adapter details or returning a fabricated
empty value. This completes H-010; the D-016 evaluator produces this union and
the H-012 UI renders its error branch explicitly.

H-011 accepts only an already permission-filtered relation snapshot carrying an
effective permission revision. The strict input contains visible target IDs and
their typed projected results; it has no field for denied target IDs or denied
counts, and aggregation refuses input without an `applied: true` permission
receipt. Thus hidden rows are removed before target counts, value counts,
uniqueness, percentages, or value aggregation, while the output remains bound
to the permission revision used to compute it.

The initial Rollup function set is `count_all`, `count_values`, `count_unique`,
`percent_empty`, `percent_not_empty`, `sum`, `average`, `min`, `max`,
`earliest`, `latest`, and `show_original`. A list-valued target declares its
item type and is flattened exactly one level in relation order. Missing values,
`null`, empty text, and empty lists are empty; zero and false are populated.
Value counts and uniqueness operate on flattened values, percentages use the
visible relation-target count and return 0–100, empty sum is zero, empty
average/min/max/earliest/latest/percentage is typed null, and empty
show-original is an empty list. Numeric and date functions reject incompatible
declared types before execution.

A relation-only count does not inspect a target property error. Every other
function preserves the first visible target error as a typed dependency error
with target property and record path; a mismatched runtime projection becomes
an `argument_type` result instead of being ignored or coerced. Duplicate target
IDs fail closed, numeric overflow is a domain error, at most 10,000 visible
targets and 10,000 flattened values enter one aggregation, and incomplete
relation snapshots return their partial result with explicit `complete: false`
and `relation_limit` or `unavailable_target` truncation. This completes H-011;
The permission-scoped unsaved-candidate editor preview, reviewed schema edit,
and explicit copy/export representation complete D-015.

H-014 makes the H-008/H-009 limits executable performance boundaries. Graph
SCC discovery and canonical cycle-path discovery are iterative, so a valid
10,000-property chain or one 10,000-property strongly connected component does
not consume the JavaScript call stack. Dependency-first ready work uses a
stable-ID binary min-heap rather than repeatedly sorting the full ready set,
and invalidation walks use offset queues rather than quadratic `shift` loops.

The core scale suite builds and fully recomputes a 10,000-node chain, builds a
10,000-node single-root fan-out and proves an unchanged root prunes all 9,999
downstream branches, surfaces a 10,000-node cycle with its closed 10,001-entry
path and every node blocked, and rejects dependency edge 100,001. Each scenario
has a conservative five-second test budget; normal local observations are tens
of milliseconds, leaving room for slower public CI while still catching an
accidental quadratic or recursive regression. This completes H-014.

The pure Synapse Formula 1 evaluator now executes the canonical AST against a
pre-authorized, transaction-frozen property resolver. It supports property and
related-page traversal, lists, sequential `let`, closures, higher-order list
functions, lazy conditionals, boolean short-circuiting, arithmetic/comparison,
and the shared H-007 function registry. The same explicit `now`, IANA timezone,
and locale reach every call. Null remains typed null, division by zero and
non-finite arithmetic are errors, JavaScript-compatible `round` ties toward
positive infinity (so `round(-1.5) == -1`), dependency errors retain their
cause, lambda work shares the 100,000-step transaction budget, and unsupported
AST versions fail without rewrite. The property editor uses the same frozen
timestamp and fixed UTC/`en` evaluation context, labels that context in its
preview, preserves typed null, and renders typed errors explicitly in both
previews and Table cells. Locale-aware date presentation remains separate from
evaluation and receives an explicit client locale and timezone. This completes
H-013.

Formula and Rollup are strict read-only manifest property variants. Formula
stores its editable source and canonical versioned AST together; Rollup stores
stable relation/target property IDs, function, and declared target type.
Desired-state planning preserves Formula source/AST and resolves agent-friendly
Rollup property keys to stable IDs. Record frontmatter, sample records, browser
cell mutations, and server mutation plans all reject attempts to write either
derived property.

Typed queries materialize a permission-scoped derived projection without
changing the canonical Markdown record. Successful homogeneous results receive
scalar or list values used by type-specific filters, sorting, grouping, and
calculations; the separate `computedResults` projection always preserves the
complete typed value or error, including null and unindexable mixed or nested
lists. Rollups receive only readable target records and properties plus a
permission-revision receipt.

The server retains at most 32 derived snapshots in an LRU keyed by database,
manifest/index revision, frozen evaluation time, and complete permission scope.
Query traces report the computed property IDs, hit/miss state, and permission
revision. Schema, record, relation-target, or permission changes select a new
cache entry. Delta row receipts hash canonical and computed results together,
so a relation-target edit invalidates an owning Rollup row even when the
owner's Markdown revision is unchanged. This completes E-015.

The core Formula editor analyzer supplies stable-ID-aware property and standard
function completions, canonical insertion text, resolved cross-relation
reference cards, source-located syntax diagnostics, path-addressed type
diagnostics, canonical formatting, and preview through that same evaluator and
frozen snapshot. Invalid source never produces a preview. The Table property
editor exposes those references and diagnostics, disables invalid changes, and
routes the canonical property definition through the reviewed plan/commit path.
Rollup relation, target, and aggregation selectors validate compatible types
and call the read-only `/api/databases/computed-preview` endpoint for every
unsaved candidate. That endpoint substitutes the candidate only in memory,
evaluates the exact record against the current index and all source permission
scopes, returns the frozen time and permission revision, and never mutates the
stored manifest or Markdown. Loading, missing-record, typed-error, permission,
and transport failures remain explicit. This completes H-012.

Formula and Rollup results share the typed query projection, read-only browser
and agent mutation rules, stable-ID schema planning, permission enforcement,
and JSON export. TSV and CSV copy/export serialize successful null as `null`
and failures as `#ERROR(code): message`, so interchange never turns a typed
failure into an empty cell; import rejects both property families as derived.
Together with the evaluator, complete Rollup function surface, dependency
graph, incremental recomputation, editor, query indexes, and API contracts,
this completes D-015 and D-016.

Formula AST versions evolve independently from the manifest version. An unknown
formula language or AST version is preserved as unsupported and cannot be
evaluated or rewritten. A migration must parse the old AST, emit the new AST,
type-check it against the same declared result, compare fixture results, and
retain a reversible receipt. The eventual evaluator limits cross-relation
dependency depth and detects cycles before execution; the Notion API's documented
[formula depth limitation](https://developers.notion.com/reference/update-property-schema-object)
is treated as an interoperability constraint rather than copied as an opaque
runtime failure.

The core package includes a versioned golden workspace containing database,
source, property, option, relation, and record objects for every v1 property
type. Its tests parse and materialize those files using core alone, making the
standalone-clone contract executable without a server or derived cache.

## Agent discovery contract

Every database and source carries a machine-readable contract:

- immutable ID and key;
- purpose and the meaning of one record;
- human description, aliases, and domain vocabulary;
- canonical-versus-mirror status;
- default time property and freshness expectation;
- sensitive properties and write policy;
- relation semantics.

The database-level portion is mandatory in v1: `purpose`, `canonicality`,
`vocabulary`, `freshness`, and `sensitivity` are explicit, and an optional
default time property must resolve to a declared Date property. This contract is
canonical data used by discovery and policy, not generated index metadata.

Every property carries an immutable ID, stable key, type, description, aliases,
constraints, sensitivity, and value-inference policy. An agent never infers this
contract from a handful of records.

Property semantics are canonical and typed. Defaults use the same readable
storage values as record frontmatter and are checked against the property type,
select options, relation cardinality, and record-ID syntax. The default policy
is `explicit_only` inference, inherited sensitivity, and no uniqueness or
format assumptions; agents may suggest or assign values only when the declared
policy permits it.

Every source has exactly one Title property. It is always required even when
`required` is omitted from YAML, cannot be unset, and uses the ordinary
revision-bound property mutation path for inline and bulk edits. A Title value
is presentation data rather than storage identity: changing it preserves the
record's stable ID, source ownership, and Markdown path. File renames and source
moves remain separate planned operations, so a title edit never acts as an
implicit slug or path migration.

An opened record resolves `_sn.database_id`, `_sn.source_id`, and
`_sn.record_id`, describes the current schema, and uses the source's single
Title property as the ordinary page H1. Table edits therefore update an open
page title through the same frontmatter subscription, while editing that H1
performs a stable-ID record lookup and submits a revision-bound database
mutation instead of renaming the Markdown file. Database-owned rows in the
normal visual property panel use the same bridge; their keys, types, and values
cannot be renamed, removed, reordered, or patched through the generic
frontmatter binding.

Text values use canonical Markdown-compatible inline markup and preserve
multiline source bytes after newline normalization. Stable references use
`synapsenote://person/<person-id>`, `synapsenote://record/<record-id>`, and
`synapsenote://document/<encoded-path>` link targets; ordinary HTTP, HTTPS, and
mailto links remain URL references. Labels are stored presentation data and are
never re-resolved from mutable names during projection. The shared core derives
deterministic plain text plus ordered UTF-16 source offsets and stable reference
metadata. Query filters, sorts, lexical indexing, Formula evaluation, text
length/regex constraints, and context packs consume that plain projection.
Context packs deliver plain text and separate reference metadata, so agents do
not spend tokens on repeated URI markup but can still address exact entities.

Table cells display the plain multiline projection and reopen the canonical
markup for editing. The editor inserts active readable people and readable
record references at the current selection, preserves ordinary Enter as a
newline, and uses Ctrl/Command+Enter or an explicit action to save. CSV, TSV,
JSON, Markdown, clipboard, and agent writes continue to carry the canonical
markup rather than the display projection, preserving exact stable references
across a standalone clone and import/export round trip. Malformed or unknown
links remain visible text and never fabricate a reference; no projector silently
truncates stored Text.

Created time and Last edited time are declared as the read-only
`created_time` and `last_edited_time` property variants. They cannot be
required, defaulted, constrained, inferred, imported, or supplied through a
record mutation, and a same-named record frontmatter key is treated as an
invalid forged derived value. Canonical creation writes `_sn.created_at` and
`_sn.last_edited_at` once with the transaction timestamp. Updates preserve
`created_at` and advance `last_edited_at`; a move preserves creation identity,
while a duplicate is a new record and receives a new creation timestamp. For a
legacy record without `created_at`, the index projects filesystem birth time
and the next reviewed rewrite retains that value. The live Last edited
projection is the later of canonical `last_edited_at` and filesystem mtime, so
an external Markdown edit is visible without allowing an editor to forge the
derived property. Both variants use strict ISO timestamps and the ordinary Date
filter, sort, calculation, Formula, permission, Table display, and canonical
CSV/TSV projection contracts.

Created by and Last edited by are the corresponding read-only `created_by`
and `last_edited_by` variants. Canonical `_sn.created_by` and
`_sn.last_edited_by` values retain `{ kind, principal_id }`, where `kind` is
`human`, `agent`, `sync`, `filesystem`, or `system`; query, Formula, clipboard,
and export surfaces use the compact unambiguous `kind|principal_id` key.
Creation stores the committing actor in both fields, later commits preserve the
creator and replace only the editor, moves keep the creator, and duplicates
start with the duplicating actor. A live outside Markdown update is attributed
to `filesystem|local`; canonical human, agent, and sync entry points pass their
authenticated commit actor unchanged. Legacy files without actor metadata use
filesystem provenance, and the next reviewed rewrite retains that creator.
Actor properties accept only equality/empty filters and universal counts,
project through the ordinary property permission boundary, render as kind plus
principal, and cannot be forged through record frontmatter or any browser,
import, or agent value mutation. Exact undo restores the prior content state's
attribution together with its bytes, while the undo receipt separately records
the actor who performed the reversal.

Verification remains in the parity scope because Notion exposes it for wiki
database pages, including writable verified/unverified state, automatic
verifier attribution, and optional expiry ([official page-property
contract](https://developers.notion.com/reference/page-property-values#verification)).
SynapseNote specifies it as an opt-in governed `verification` property for a
source rather than silently adding it to every database. Its canonical value is
`{ state: unverified | verified, verifiedAt, expiresAt?, evidenceRevision?,
note? }`; `verifiedBy` is immutable actor metadata set from the authenticated
commit actor, never caller input. Read projection may additionally derive
`expired` when the end instant has passed and `stale` when an
`evidenceRevision` no longer matches the current record revision. A
revision-bound verify, renew, or unverify action requires an explicit source
verification permission and a review showing actor, duration, evidence
revision, and affected record. Verification never grants read permission and
is removed with all other property data at the property-permission boundary.
Agent search and context packs rank or label verified records only when the
verification state, verifier, evidence revision, expiry, and current revision
are returned together; they must not turn the badge into an unsupported truth
claim. Runtime schema and materialization, evidence-stable revisions,
authenticated verify/renew/unverify planning, actor-bound commit verification,
HTTP/MCP/browser entry points, permission-safe projections, compact context
packs, conservative ranking, UI state badges, and expiry/staleness tests close
D-026. Expiry is derived at the read instant, so no background rewrite or
scheduler is required to keep the displayed state correct.

URL, Email, and Phone properties remain canonical strings but validate before
planning and again during record materialization. URL accepts only absolute
HTTP(S) addresses, Email requires a syntactically valid address, and Phone
accepts bounded dialable punctuation with 3–20 digits. Table cells display each
value without rewriting its stored form, expose a keyboard-native `https:`,
`mailto:`, or normalized `tel:` open target, copy the exact canonical string,
and retain the same revision-bound edit flow as other scalar properties.

Property constraints are executable canonical rules. Required properties
cannot be omitted or unset; a missing value on record creation adopts its typed
default before planning. Every `unique: true` property is checked within its
source against the combined surviving and proposed record set and verified
again after commit. Number `min`/`max` and text-like `maxLength`/Unicode-regex
`pattern` rules apply consistently during manifest/default validation, external
record materialization, browser edits, desired-state normalization, increment,
and append. Select and multi-select option IDs provide the closed enum, reject
unknown members, and preserve set semantics. Adding or changing a stored
constraint is a record-contract migration and therefore requires revision-bound
coverage of affected existing records.
An external editor can preserve an otherwise materializable record while
violating uniqueness; the live index reports `duplicate_unique_value` for every
involved path and clears the diagnostic incrementally when the values diverge.

Number values remain finite canonical JSON/YAML numbers; formatting never
changes storage, comparison, sort, aggregation, API, or agent semantics. A
validated format contract supports decimal precision, locale grouping, explicit
sign display, percent (canonical ratio), ISO currency, standard Intl units, and
custom prefix/suffix/multiplier presentation. Table View formats with the user
runtime locale while its editor continues to accept the locale-neutral
canonical numeric value. Invalid precision, currency, unit, sign, min/max, and
non-finite inputs fail before planning. Cell/range TSV and stable-ID CSV
interchange use the same canonical parser: export never emits localized grouping
or display currency, and import refuses those formatted strings rather than
guessing. CSV export walks one fresh snapshot to completion with an explicit
10,000-record browser bound. Table View exposes separate current-query and
complete-source exports; the latter explicitly includes archived records while
the former preserves the active view's archive scope. Each export starts a new
permission-filtered snapshot and follows its bound cursors to completion, with
stable `<source-key>-current.csv` and `<source-key>-all.csv` filenames. Files are
UTF-8 without a BOM, use comma delimiters and CRLF rows, quote RFC-style commas,
quotes, and newlines, and put `record_id` first followed by property keys in
manifest order. Empty values are empty cells; numbers, booleans, and ISO dates
are canonical text; select and multi-select values use stable option keys; and
array-valued relations use compact JSON stable-record-ID arrays. CSV import
requires `record_id`, maps stable property keys (while accepting unambiguous
IDs/names), fetches exact current record revisions, validates every typed cell,
and submits at most 100 records as one reviewed atomic plan. The import inspector
decodes UTF-8 (with or without a BOM), UTF-16LE/BE BOM, and Windows-1252 fallback
input; detects comma, tab, or
semicolon delimiters; and exposes the detected encoding and delimiter before
planning. Its confirmation preview maps every input header to a stable property,
shows canonical sample rows, counts empty, date, and option values, and reports
typed cell issues. CSV and TSV therefore share the same bounded, all-or-nothing
review path. Creating a new database from delimited data remains the separate
F-001 workflow. These file and clipboard gates complete D-005 and N-001.
Parity coverage exports canonical title, text, number, checkbox, date, select,
multi-select, URL, email, phone, multiline/quoted, and empty values, imports the
same rows through both CSV and TSV paths against a different revision-bound
record state, applies the typed change set, and compares the final property-ID
map directly with the original canonical state.

Machine-readable export uses the `synapsenote.database-export` envelope at
integer version `1`. Table View collects the complete source, including archived
records, through the same fresh permission-filtered cursor snapshot as full CSV
export and writes `<source-key>-all.json`. The envelope carries stable database,
source, property, option, and record IDs; manifest, schema, index, snapshot, and
per-record revisions; canonical property-ID-keyed values; scope; counts; and an
explicit completeness receipt. Serialization refuses cross-source, partial, or
count-inconsistent snapshots instead of emitting an ambiguous artifact.

#### Markdown, Obsidian, Notion, and portable bundle interchange

Existing Markdown folder import now begins with a bounded, symlink-refusing,
content-root-confined scan and a non-mutating inference draft. Frontmatter
booleans, finite numbers, ISO dates, URLs, email, phone, arrays, and text are
typed consistently; title/name or the filename supplies the proposed title.
Mixed types and normalized-key collisions are explicit issues. Every inferred
property has `ownership: proposed`, the complete original frontmatter remains
under `retainedMetadata`, and the result requires confirmation. Consequently
Obsidian conventions such as `tags`, `aliases`, and `cssclasses` can be
reviewed without silently taking ownership of plugin-private or unrelated
metadata. The standalone server preview scans at most 100,000 entries and the
transport-neutral core draft bounds total input at 512 MiB.

Notion import accepts a versioned normalized adapter output so ZIP/CSV/API
adapters share one deterministic semantic boundary. Notion database, data
source, property, option, record, view, and template IDs map to reproducible
SynapseNote stable IDs. Compatible scalar/select/status/files/person metadata,
record bodies, view layouts/projections/sorts, templates, relation targets and
relation record IDs are retained. Formula source and Rollup references remain
structured but require review because Notion does not export a SynapseNote AST;
filters likewise remain structured pending semantic confirmation. Unsupported
properties/views, absent relation targets, duplicate IDs, and missing assets
produce object-kind, Notion-ID, logical-path, severity, handling, and message
entries. Nothing is silently flattened or discarded, and the full plan remains
confirmation-gated.

Portable export uses the `synapsenote.database-bundle` version-1 JSON envelope.
It stores canonical manifest YAML and record Markdown byte-for-byte with
SHA-256 digests, so comments, source ordering, all schema objects, frontmatter,
and bodies round-trip without a secondary lossy model. Local Markdown and
wiki-embed references are normalized relative to their record. Included media
carry media type, canonical base64, and a verified digest; every absent target
is retained as an explicit `missing` asset and reference diagnostic. Import
rejects traversal, duplicate path ownership, malformed base64, digest changes,
inconsistent references, over 100,000 files, and over 512 MiB before exposing
any files for writing.

Multi-select values are sets of immutable option IDs in every query, plan, API,
and UI projection, while Markdown stores the corresponding stable option keys.
Schema validation prevents duplicate option IDs/keys. Materialization reports a
repeated external key as an explicit preserved-value diagnostic and repair
offers a deterministic dedupe; browser editors, bulk edits, TSV, and CSV dedupe
before planning. Fine-grained agent `add` is idempotent and `remove` deletes at
most one member, with both operations resolving key/name/ID to the same stable
option. Equality, containment, deterministic array sort, lexical projection,
permission filtering, and complete-snapshot calculations use the canonical set
representation. This completes D-008; option lifecycle operations remain the
shared D-006 concern.

Select options now carry an optional canonical archive marker while retaining
their stable ID and storage key. Archived options remain readable on existing
records but Table, clipboard/import, and agent mutation paths refuse them as new
assignments. A deterministic lifecycle preview covers label rename, recolor,
exact-ID reorder, archive/restore, merge, and delete. Merge rewrites affected
revision-bound records, typed defaults, and saved-view references to the stable
target ID; delete is blocked while any record, default, or saved view still
references the option. Option ordering and presentation-only changes do not
trigger record rewrites. Table View shows the impact before handing an
applicable change to the normal exact-plan, atomic commit, verification, and
undo path. The complete browser snapshot and one exact option-change plan are
bounded at 10,000 records; larger sources fail closed before a partial usage
scan or mutation can be mistaken for a complete result. This completes D-006;
future scale work may move that explicit safety boundary without changing the
stable option contract.

Status is a distinct canonical property rather than a display alias for
Select. Every Status has exactly three stable-ID workflow groups in semantic
and Board order: `todo`, `in_progress`, and `complete`. Status options retain
their own stable IDs and readable storage keys and reference one group by its
stable ID. The group category deterministically projects progress as `0`,
`0.5`, or `1` and whether work is complete. Agent-authored Status properties
that omit configuration receive the default Not started, In progress, and Done
options; an explicit default must resolve to an active option. Table editing,
frontmatter, clipboard, CSV/TSV, filters, sorting, grouping, desired-state
plans, atomic commit, and the public describe schema share this representation.
Status sorting and aggregation follow workflow-group order and then declared
option order, making the same contract directly usable by Board View. This
completes D-007.

Checkbox uses canonical booleans throughout storage, query, Table editing,
clipboard, import/export, and exact mutations. Table bulk edit can either set
one shared value or toggle every selected revision-bound record from its own
current value; an absent optional value toggles to checked. Filters support
boolean equality and set membership, while sorting is deterministic with
unchecked before checked in ascending order. The reserved formula coercion
contract rejects truthy strings and numbers, treats an absent optional value as
unchecked, and projects boolean, numeric (`0`/`1`), or text
(`false`/`true`) forms explicitly. This completes D-012 without coupling the
property to the future formula parser.

Date keeps the common case compact: an all-day value is a strict `YYYY-MM-DD`
string and a timed value is an RFC 3339 timestamp with an explicit `Z` or
numeric offset. A value that needs an end, named timezone, or reminder uses the
canonical object `{ start, end?, timeZone?, reminder? }`. `start` and `end`
must have the same precision, the end cannot precede the start, `timeZone` is a
canonical IANA zone, and `reminder` records a `start`/`end` anchor plus bounded
`minutesBefore`. An all-day reminder requires a timezone so its local midnight
is unambiguous. Object keys have one stable serialization order for JSON,
CSV/TSV, API, and agent writes; Markdown stores the same object as a readable
YAML mapping. The table editor exposes date/time, optional end, timezone, and
reminder controls and rejects nonexistent local times during daylight-saving
transitions. Absolute display uses an explicit locale/timezone and relative
display uses an explicit clock. Filters and sorts compare the start point;
`earliest`, `latest`, and `date_range` calculations cover the full start-to-end
span. This completes D-009 without locale-dependent parsing or process-default
timezone behavior.

Person uses a database-scoped identity directory instead of copying names or
emails into every record. Each entry has an immutable `person_*` ID, readable
stable key, display name, one of `local`, `collaborator`, `guest`, or `agent`,
an active marker, and an optional opaque runtime `subjectId`; local users and
agents require that runtime link. The link can point at the existing
`principal-*` local identity or an agent subject such as `agent:codex`, but
query and context-pack projections deliberately omit it. Canonical record
values are deduplicated Person-ID arrays even for single-person properties;
`multiple: false` limits the array to one member. Markdown and CSV/TSV store
readable Person keys, while JSON, query filters, grouping, sorting, mutation
receipts, and APIs retain stable IDs.

Existing values continue to resolve after a person becomes inactive so history
does not disappear. Table, bulk edit, import, and agent desired-state paths
refuse a newly assigned inactive person, while allowing an existing inactive
member to remain or be removed. Agent writes may resolve an active person by
ID, key, or an unambiguous exact display name and record that resolution in the
plan ledger. Changing a storage key or removing a referenced directory entry
requires every affected record to participate in the same revision-bound
rewrite. Lexical retrieval indexes the display name, stable key, and ID, while
typed filters use only the ID. Permission projection happens before identity
cards are collected: a denied Person property contributes neither values nor
names, and an allowed query or token-budgeted context pack includes only the
safe cards referenced by its returned projection. This completes D-010.

Relation values remain file-native stable record IDs. Cardinality `one` stores
one `rec_…` ID, while `many` stores a duplicate-free ID array with set equality;
required many-relations cannot be empty. Materialization validates the shape,
and every reviewed plan resolves each ID against the declared target source in
the same database. Deleting or moving a target is refused before commit when a
surviving record would be left with a dangling or wrong-source reference. The
commit verifier repeats source-scoped relation integrity against the rebuilt
index, so an out-of-band deletion or wrong-source move between plan and commit
rolls the transaction back.

A relation is one-way when `pairedPropertyId` is absent. A two-way relation is
one symmetric pair: each relation property stores the other property's stable
ID, targets the other property's owning source, and points back exactly. The
pair's identity is the ordered tuple of those two stable property IDs; display
names and mutable keys never participate. Agent-authored desired state may use
`pairedPropertyKey` on both ends, which the draft compiler resolves to IDs and
records in `targetResolutions`, or may provide the exact paired IDs directly.
The manifest validator rejects a missing half, a non-relation half, a wrong
target source, or an asymmetric pointer before a plan can exist.

Changing either side of a paired value expands into revision-bound upserts for
both records in the same immutable plan. This applies to complete record values
and idempotent `link`/`unlink` mutations. Replacing a cardinality-one edge also
removes the previous inverse edge in that transaction. Explicitly contradictory
edges are rejected rather than resolved by ordering, and the post-commit
verifier requires every paired edge in the rebuilt index to be symmetric. A
filesystem failure therefore rolls back both halves through the normal
multi-file transaction journal.

Table and record-page editing use the same revision-bound mutation path as
agents. A permission-scoped picker searches the target source's Title property,
returns at most 100 matches, supports one/many selection and bulk edits, and
never stores display labels. CSV/TSV/JSON continue to interchange stable IDs.
Agents may replace the exact value or use idempotent `link`/`unlink`; query
responses add only minimal `{ id, sourceId, title, archivedAt? }` cards for
targets referenced by the returned page. Target record and Title permissions
are applied independently, and their exact scopes/revisions participate in the
query ID and snapshot fingerprint. Missing or denied cards remain an
indistinguishable unavailable ID. Context packs retain only cards referenced by
records that fit the token budget; deeper data still requires explicit bounded
relation expansion.

Paired-relation schema convergence is also atomic. Removing only one property
is invalid. Removing both properties requires every record that stores either
value to appear as an exact-revision rewrite in the same plan; serialization
then drops the retired frontmatter keys. Removing a target source additionally
requires removing its inbound paired property and is refused while the source
still owns records. Restoring a pair must restore both original stable property
IDs and their symmetric pointers together. Restoration reintroduces the schema
only: it never silently resurrects old links, so restoring values requires
explicit revision-bound record writes. This completes D-014 and H-001–H-005.

Files & media uses one ordered array of strict file objects. A local entry is
`{ kind: "local", path, name?, caption? }`, where `path` is a POSIX,
content-root-relative path with no absolute, parent, empty, control-character,
or backslash segments. An external entry is `{ kind: "external", url, name?,
caption? }`, where `url` is credential-free HTTP(S). The source path or URL is
the entry identity within a cell, so duplicate sources are invalid; array order
is canonical presentation order and equality is deliberately order-sensitive.
Markdown stores the objects as readable YAML, while JSON and CSV/TSV use the
same compact object-array shape. Captions and explicit display names remain
data rather than viewer state.

Table View reuses the hardened content attachment upload endpoint, including
configured placement, streaming writes, path/symlink containment, and
same-folder content-hash dedupe. Its structured editor can upload a local file,
add a reviewed external URL, edit names/captions, reorder entries, remove an
entry, and open an image preview or the existing asset viewer. Imports validate
the complete JSON object array and refuse traversal, credentials, unsupported
schemes, duplicates, and malformed metadata before planning. Agent desired
state can replace the complete ordered array; fine-grained `add` accepts one
validated object and idempotently appends it, while `remove` addresses one
entry by its path or URL. Caption or order changes use the ordinary exact
revision-bound `set` mutation, preserving an inspectable before/after diff.

Availability is observed rather than stored. Permission-filtered query results
and token-budgeted context packs include a compact `fileStates` map for only the
local paths referenced by returned records (`available` or `missing`); external
URLs are never probed or duplicated. A denied Files property contributes
neither objects nor paths, and a context pack drops states belonging to records
that do not fit its token budget. Table cells label missing local files and the
editor confirms them against the asset service, so restoring a file clears the
condition without rewriting Markdown. This completes D-011.

Workspace search returns `database`, `data_source`, `view`, and `record` result
kinds alongside pages, folders, and files. Each database result carries its
applicable `databaseId`, `sourceId`, `viewId`, `recordId`, and revision directly;
agents must use these stable addresses instead of parsing the display path.
Database, source, and view text is projected from the canonical semantic
contract. Record text contains only typed property values returned by the
permission-scoped Data Plane query. Database-owned Markdown is excluded from
the ordinary `page` tier, so a denied row or property cannot reappear through a
page title, body match, or snippet. The corpus cache key includes manifest,
record-index, and effective permission-policy state. Discovery is tolerant of
natural language; execution is not. Ambiguous candidates are returned as
candidates instead of being silently resolved.

## Query contract

Retrieval happens in stages:

1. Discover the relevant database or data source.
2. Resolve a query against stable property IDs.
3. Resolve the trusted effective row/property permission snapshot.
4. Apply typed hard filters inside that snapshot.
5. Apply lexical and optional semantic retrieval inside that snapshot.
6. Expand explicitly requested relations with bounded depth and fan-out.
7. Rank, count, project, paginate, and pack evidence.

`find` is a forgiving discovery operation. `query` is an exact typed operation.
Unknown properties, incompatible operators, invalid values, stale cursors, and
permission denials are explicit errors.

The exact filter matrix is exported with the core contract and enforced before
record evaluation:

| Property types | Operators |
| --- | --- |
| title, text, URL, email, phone | `eq`, `neq`, `in`, `contains`, `does_not_contain`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| number, date | `eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `is_empty`, `is_not_empty` |
| checkbox, select | `eq`, `neq`, `in`, `is_empty`, `is_not_empty` |
| multi-select, person, files, relation | `eq`, `neq`, `in`, `contains`, `does_not_contain`, `is_empty`, `is_not_empty` |

Select and multi-select operands use canonical option IDs, and relation
operands use stable record IDs. Text-family prefix, suffix, and containment
comparisons are case-insensitive. Date filter operands remain explicit ISO
points and compare against a value's start; relative display, timezone, and
collation semantics are explicit contracts rather than process defaults.

Sort collation is also an exported, versioned contract rather than the host
runtime's default locale. Version 1 uses locale-neutral (`und`) Unicode NFKD
normalization and code-point comparison. Its primary key is case- and
diacritic-insensitive; diacritics are a secondary distinction and original case
is a tertiary distinction with uppercase first. ASCII decimal runs use natural
magnitude ordering (`item 2` before `item 10`), collection values sort their
elements by the same comparator and then compare elementwise, and dates compare
by their parsed instant. Missing values, empty strings, and empty collections
always sort last in both directions. Stable record ID is the final tie-breaker.
The sort-semantics version is bound into query/snapshot identity and version 1
cursors are rejected by the new `v2` cursor format.

Every query result reports:

- source and snapshot revision;
- total matched and returned counts;
- whether the result is complete;
- continuation cursor;
- truncation cause;
- index freshness;
- evidence or matching reason where retrieval ranking was used.

Query pagination is durable and stateless. The opaque cursor is a compact
continuation position bound to the complete normalized query, source, index and
schema snapshot, sort-semantics version, saved-view or Agent View revision,
aggregate contract, and effective permission-policy revision; it is not a
process-local cursor handle and creates no server-side session. Consequently an
unchanged query can continue after a server, data-plane, or index reconstruction
when the canonical snapshot and policy revision are identical. A record,
schema, saved-view, sort, aggregate, or permission revision change rejects the
old cursor with `invalid_cursor` instead of mixing snapshots. Each page
re-evaluates the deterministic snapshot and returns at most 500 records. The
core durability suite traverses 10,005 reverse-ordered inputs in 21 pages and
asserts exact order, convergence, and no duplicate or missing record IDs; the
server suite resumes an existing cursor through a fresh index and data-plane
instance, and the transport suite continues that same contract over direct,
HTTP, and MCP reads.

The implementation supplies in-memory typed filters, deterministic sorts,
projection, pagination, explicit completeness metadata, bounded relation
expansion, grouping/calculation queries, and incremental lexical retrieval with
extractive evidence. Semantic and formula indexes follow without changing the
stable query identity model.

An exact query may include an `aggregate` contract. It supports zero, one, or
two grouping levels; array-valued properties are grouped either as one canonical
sorted set or explicitly exploded with `arrayMode: each`. Empty membership is
included or excluded explicitly. Totals and every returned group can request:

- universal populated/unique counts and empty/non-empty percentages;
- number sum, average, median, minimum, maximum, and range;
- date earliest, latest, and millisecond range;
- checkbox checked/unchecked counts and percentages; and
- property-free record count.

Calculations run over the complete typed-filter match set before the ordinary
record page is sliced. Group output is deterministically ordered with the same
versioned collation as record sorting and returns `totalGroups`,
`returnedGroups`, `groupsComplete`, and `group_limit` truncation. A separate
per-record membership bound prevents combinatorial fan-out when two
array-valued groups use `each`. Calculation IDs, property compatibility, and
group dependencies are validated before execution, and the full aggregate
contract participates in query IDs and cursor fingerprints.

The trusted effective row and property permission snapshot is resolved before
filtering, ranking, counting, grouping, or calculation. Aggregate dependencies
outside the property scope fail with the exact denied IDs; denied rows are
removed before totals and group membership. The explain trace records the
requested aggregate, post-permission application, match/group counts, and group
truncation without including values.

Exact query responses also carry a composable `resultState` rather than forcing
an agent to infer state from an empty array. It distinguishes a definitive
`no_match` from source-local index diagnostics, effective permission filtering,
and pagination truncation; a stale or rebuilding index remains a typed failure
with observed/expected revisions and never appears as fresh emptiness. The
source-local partial flag is derived from diagnostics whose explicit source IDs
or canonical paths belong to the queried source, so an unrelated database's bad
record cannot weaken this query's completeness claim.

The accompanying deterministic `trace` records the selected database/source,
the typed filter expression and dependency IDs, exact sort plus stable record-ID
tie-breaker, requested/returned/excluded projection IDs, permission policy and
exclusion counts, aggregation application/counts/truncation, index
revision/freshness/issue count, and pagination cause and cursor state. It
contains no record values and is identical across direct, HTTP, and MCP
representations.

Any saved view can also serve as a saved query through `viewId`. Its stored
filter is composed with the caller filter, its sort is the default when the
caller supplies none, its projection is the default selection, and its saved
group/subgroup definitions become the default grouping contract. The result
and explain trace include a `savedQuery` receipt with stable view/source IDs,
layout, and a SHA-256 revision of the complete saved view. That revision is
bound into query and snapshot identity. Schema/index changes, saved-view
changes, sort-semantics changes, and effective permission-revision changes all
invalidate an old cursor instead of silently continuing under new semantics.
`agentViewId` remains the stricter compatibility alias that additionally
requires the saved view to carry an Agent View contract.

## Token-efficient context

Query results and model context are separate artifacts. A context pack uses
progressive disclosure:

1. compact database cards;
2. only the relevant schema projection;
3. compact record envelopes;
4. exact evidence excerpts;
5. full bodies only on explicit expansion.

A pack accepts a goal, record or query references, a token budget, an evidence
policy, and a bounded relation depth. It returns deduplicated fields and
excerpts, stable references, freshness, budget usage, omissions, and a
continuation.

The implemented read path exposes progressive disclosure as an explicit,
cursor-bound `disclosure` request rather than inferring how much source text an
agent wants:

- `records` returns the database card, projected schema, and compact typed
  record envelopes only;
- `evidence` additionally requires `searchText` and returns content-bound
  `ev_` excerpts with canonical offsets for the matching records;
- `full_body` adds the canonical Markdown body for records selected by the
  exact query, and is never enabled implicitly.

Evidence and full-body sidecars participate in the same token estimate as the
card, schema, and compact rows. If the next record plus its sidecar would exceed
the available budget, the pack stops before that record and returns a
snapshot-bound continuation with explicit record/evidence/body omissions. A
change in goal, query, projection, disclosure level, evidence text, relation
expansion, tokenizer, encoding, or budget changes the request fingerprint, so a
cursor cannot be reused across disclosure contracts.

Relation expansion is opt-in and independently bounded by depth (maximum 3),
deduplicated related-record count (maximum 500), and per-record/property fan-out
(maximum 50). A caller may provide a stable-property-ID projection for each
target source; otherwise only that source's title property is returned. Traversal
uses canonical relation IDs, emits explicit source-aware edges, keeps each
related record once even when reached by multiple paths, and suppresses cycles.
Related-record and full-body reads use the same trusted effective read scope as
the root exact query; denied relation fields are never traversed, and denied
target records or projected properties are counted as permission omissions.
The expansion and its projected schemas participate in the same pack token
estimate. Its `complete` and `omitted` fields distinguish depth, total-record,
fan-out, missing-target, permission, cycle, and deduplication outcomes, so an
agent never mistakes a bounded or access-filtered graph slice for an exhaustive
graph.

Exact values and extractive evidence are the default. A generated summary must
carry its source hash, creation time, model provenance, and stale status. Schema
revisions, query IDs, pack IDs, and `delta_since` avoid resending unchanged
content.

Generated record summaries are stored only as private derived artifacts under
`.ok/local/database-summaries/v1/`; they never enter canonical Markdown or a
portable manifest. The v1 artifact requires database/source/record IDs, the
exact source SHA-256, schema revision, offset-bearing creation time, provider,
model, prompt revision, and an explicit freshness check state. Reads compare
the current source hash and schema revision, persist the resulting stale reason,
and return stale text as `null` from the safe context-consumption method.
Missing provenance, corrupt JSON, symbolic-link entries, and unsafe storage
parents fail closed. Files are atomically replaced with owner-only permissions.

#### AI autofill decision (v1)

AI autofill is deliberately **not a default canonical write path** and is not a
v1 Notion-parity claim. A future provider may offer an explicit suggestion
action, but the contract is fixed now:

- A suggestion is non-canonical until a user or an approved agent mutation
  accepts it through the ordinary exact-plan commit path. It must carry the
  database/source/record/property IDs, source snapshot and schema revisions,
  provider/model, prompt revision, created-at timestamp, and an input digest.
- Input is permission-scoped before inference. External provider use is off by
  default and requires an explicit per-request privacy/egress consent; local
  providers may run only within the same effective Agent View scope. Sensitive
  properties and denied relation/body projections are never sent.
- Freshness is checked against the source hash, schema revision, permission
  revision, and provider contract before acceptance. A stale suggestion is
  displayed as stale and cannot be silently committed or treated as canonical.
- Failure is typed (`ai_suggestion_failed`) with a bounded reason and recovery
  action. Timeouts, provider errors, malformed values, policy denial, missing
  provenance, and stale inputs leave the existing canonical value untouched;
  they never become an empty string or an inferred value.

This keeps the agent-friendly provenance and privacy guarantees even if a
future UI adds an AI-fill button. Until an implementation satisfies these
guards and has focused provider/error tests, the parity matrix records AI
autofill as deferred rather than implying support.

The **What the agent saw** context inspector is available from the command
palette. Every Context Pack created through the data plane captures a cloned,
exact pack plus a separate audit summary: estimated/available/max/reserved
tokens, permission redactions for root and related records/properties,
projection/evidence/body/relation omissions, manifest/schema/index freshness,
and continuation/truncation state. The list and exact-detail reads use a local
`no-store` HTTP endpoint. Because packs may contain confidential excerpts, the
history is process-local, never written to disk, and bounded to the 20 most
recent packs; an expired ID returns a typed recovery instruction to create a
fresh pack.

## Mutation contract

Agents declare desired state instead of reproducing UI clicks or rewriting
files directly. The command engine will support operations such as:

- `ensure_database`
- `ensure_property`
- `ensure_view`
- `ensure_relation`
- `mutate_record`
- `upsert_records`
- `delete_records`
- `alter_schema`

Creation or convergence begins as an ephemeral full desired-state draft
containing the record meaning, schema, unique key, views, policies, and optional
record upserts. New objects may omit IDs and receive generated stable IDs;
existing objects must reuse the IDs returned by discovery/description. Draft
revision does not create repeated Git noise; only committing a non-empty accepted
plan writes canonical files.

The implemented `data_plan` stage stores drafts and plans only in project-scoped
server memory with explicit expiry; creating, reading, planning, or discarding a
draft never creates a manifest, Markdown record, transaction journal entry, or
Git commit. A draft accepts human-readable source/property keys and normalizes
them in two passes to collision-resistant database, source, property, option,
view, and sample-record IDs. Relation targets, view filters/sorts/groups/
projections, unique keys, templates, policies, and sample values are validated
against that normalized schema before a draft is accepted.

For an existing database, an omitted ID is resolved only by an exact unique
stable key: database key first, then source/property/option/view keys within
that database. Explicit IDs always win, so a deliberate replacement remains
visible in the diff. A record without an ID resolves only when the declared
unique property matches exactly one indexed record; the compiler binds that
record's current revision. Duplicate unique values and duplicate human option
names are ambiguity errors, while an exact option ID/key takes precedence over
a display name. Drafts and plans expose a content-free `targetResolutions`
ledger (`selector`, stable `targetId`, and `via`), and every resolved target is
included in the immutable target set covered by the plan hash. Thus no human
label or natural-language value is carried into commit as an unresolved write
address. Commit verification repeats this invariant as
`stable_targets_resolved` before returning a successful receipt.

Planning binds the draft revision to the current manifest snapshot and freezes a
sorted immutable target-ID set. It also captures sorted, content-free write
guards for every effective permission-policy scope and any query snapshots used
to select targets. These guards are covered by the plan hash and resolved again
under the commit lock; a changed policy revision or query snapshot aborts before
any canonical file is staged. The returned plan includes normalized
`ensure_database`, `ensure_property`, `ensure_view`, `ensure_relation`,
`alter_schema`, and `upsert_records` operations. Every ensure operation states
`create`, `update`, or `noop`; schema alteration lists added, updated, and
removed stable IDs; record upserts report created, updated, and unchanged
counts. An upsert's `values` and `body` are the complete desired
database-owned record state, not a patch; fine-grained field operations use the
separate `recordMutations` contract. Existing-record upserts require the exact indexed record
revision and refuse missing, stale, or cross-source IDs. The diff contains the
exact before/after manifest YAML and exact database-owned record values/body,
while record serialization preserves unrelated frontmatter and comments.

A record deletion uses an explicit stable record ID, source key, and exact
expected revision. Planning freezes the record path and complete prior
database-owned values/body, assigns high risk, and always requires the
`delete_record` approval. The plan refuses a stale revision, a record that is
also written in the same desired state, and any surviving relation that still
points to the target. Commit rechecks the exact Markdown bytes under the write
lock, emits a typed `delete` file delta, rebuilds the canonical index, and keeps
the prior bytes only in the owner-local transaction journal. Undo restores
those exact bytes only while the deleted path remains absent; a recreated file,
directory, symbolic link, schema snapshot change, or other intervening state is
reported as an explicit conflict rather than overwritten.

A record mutation addresses one existing record with `sourceKey` plus either
`id` and `expectedRevision`, or a `uniqueValue` that resolves exactly once
through the database's declared unique property. Operations run in the supplied
order and property keys are compiled to stable property IDs before planning:

- `set` validates and replaces one typed value; `unset` removes an optional
  value and refuses required properties.
- `add` and `remove` idempotently edit one declared `multi_select` option.
- `increment` adds a finite number to an existing finite number.
- `append` extends a text/title property, or the Markdown body when
  `propertyKey` is omitted.
- `link` and `unlink` idempotently edit a relation while respecting its
  cardinality, required state, target source, and referential integrity.

The compiler applies the sequence to the indexed record and emits both a
content-bearing `mutate_record` audit operation and a revision-bound complete
record upsert for the atomic commit engine. Consequently schema and record
changes share one transaction, stale targets are refused, and no partial field
write can escape. Repeating an already-converged idempotent field operation
produces a non-committable no-op plan. `increment` and `append` express a new
change each time they are freshly planned; retrying the exact same approved
commit remains safe because its idempotency key replays the original receipt.

The plan also returns affected stable IDs, policy/template previews, risk
reasons, conflicts, required approvals, and postconditions. Its SHA-256 plan
hash excludes the random plan ID but covers the draft revision, snapshot,
expiry, targets, write guards, operations, diff, risk, conflicts, approvals, and
postconditions. Callers receive detached copies, so mutating a response cannot
change the stored plan. A fully converged plan has `requiresCommit: false`, no
file diff, no conflict, and is intentionally not committable. Stable-key
replacement, occupied paths, stale record revisions, and exact-planning I/O
failures produce explicit conflicts rather than silent overwrite.

The implemented `data_commit` stage accepts non-empty committable creation,
schema-convergence, and record-upsert plans. It requires the exact plan ID and
SHA-256 hash, expected snapshot revision, an 8–256 character idempotency key, an attributed actor, optional
caller assertions, and an approval token of `approve:<planHash>`. The public MCP
tool is classified behind the docked terminal's explicit user-approval gate.
Before writing, the engine rechecks the plan hash, approval binding, snapshot,
write guards, assertions, and the exact absent-or-content-hash state of every
immutable file target. It stages all manifest and record bytes under one project-local
transaction directory and creates or replaces them under one file lock; prior
bytes for replacements remain in transaction staging until verification. A
write failure removes new targets and restores every replaced target. From the
first canonical move until the commit or rollback is fully settled, the Agent
Data Plane read barrier refuses catalog, describe, find, query, pack, and new
plan snapshots with typed `transaction_in_progress` (409) recovery data. Since
each read is synchronous after that guard, a reader observes either the complete
pre-transaction or complete post-transaction snapshot, never an intermediate
manifest/record/index combination.

After writing, the store and record index are rebuilt and the transaction checks
manifest equality, stable IDs, required properties, unique-key values, relation
integrity, and expected record count. Any failed postcondition rolls all
canonical files back and rebuilds derived state. Success creates shadow-Git base
and result checkpoints and returns a mutation ID, actual content-free file diff,
verification checks, result revisions, attributed audit receipt, and opaque undo
token. Identical retries replay the same result without another mutation.
Successful commit results, one-way idempotency fingerprints, and the
token-to-receipt binding and exact local-only update bases needed for reversal
are atomically persisted under the gitignored, per-machine
`.ok/local/database-transactions/` journal. The public v1 receipt remains
content-free and separate from its bearer token; the local runtime envelope
that must replay the token is written with owner-only file mode. A restarted engine
loads and validates the journal before resolving idempotency or undo, so it does
not require the original ephemeral plan to replay an already completed commit.

The implemented `data_undo` first offers a non-mutating preview. It compares the
current manifest snapshot and every touched path's exact content hash with the
commit receipt, including checks for missing files, replacements, non-file
targets, and symbolic-link path substitution. Apply requires the opaque token,
an idempotency key, an attributed actor, and the MCP user-approval gate. It
refuses without mutation and returns a typed conflict receipt if any intervening
change is present. Otherwise it moves current targets into transaction staging,
restores exact pre-transaction bytes for updates (and absence for creates) under
the same database lock, rebuilds the store/index, verifies the original base
snapshot was restored, creates a shadow-Git checkpoint, and only then removes
staging. A partial failure restores every post-transaction file and rebuilds
derived state. Applied and refused undo idempotency results are stored in the
same local journal, making identical retry outcomes stable across process
restarts. Journal corruption or unsafe entry types fail closed as an unavailable
transaction service rather than silently discarding idempotency history.
Project backup/restore coverage copies canonical manifests, Markdown records,
and the local transaction journal to a fresh path, reconstructs the store and
typed index without any cache, replays the original commit idempotently, and
applies its undo token against the restored project.

The `data_repair` operation uses the same preview-first safety model for index
and record drift. Preview compares the live projection with a freshly rebuilt
canonical projection, then classifies stale identities, invalid values, missing
indexed records, and orphaned index entries. Duplicate identities receive exact
replacement IDs except for one deterministic survivor. Invalid optional values
are removed, duplicate arrays are deduplicated, and declared defaults are used
when safe; required values with no default remain explicit blockers. The plan
contains every before/after file hash and value change, is snapshot-bound and
expiring, and is not committable while any blocker remains. Apply requires an
approval token bound to the exact plan hash, an idempotency key, and a principal.
It rechecks file hashes, atomically rewrites with rollback, routes the canonical
rebuild through the transaction read barrier, verifies repaired paths
materialize, and writes its receipt/idempotency envelope to the same durable
local journal for restart-safe replay.

Canonical record templates are stable manifest objects with a source, typed
property-ID defaults, a Markdown starter body, durable ordering and archival
state. An active template can be the sole default for its source, a saved view,
or a stable creation entry point; resolution is explicit template, entry point,
view, then source. Source property defaults apply first, template values next,
and caller values last. Agents author the same desired-state template contract
that the browser's reviewed create/edit/duplicate/reorder/archive/delete flows
use, so templates no longer have a draft-only or privileged write path.
An optional repeating-template contract adds a daily, weekly, monthly, or
anchored hourly/daily/weekly interval schedule, an explicit IANA timezone, a
stable database-person owner, pause state, and a bounded exponential retry
policy. Active schedules require an active owner; archiving a template pauses
it. Agent desired state uses the owner's stable key and compiles to the same
canonical person ID used by the browser editor.

After server readiness, the local scheduler checks due templates once per
minute. A due occurrence materializes source defaults plus template values and
body, then executes one immutable database plan through the ordinary exact
approval token, write guards, atomic commit, verification, attribution, and
undo journal. The occurrence/run identity and attempt are durably recorded
before mutation; an uncertain restart therefore retries the same idempotency
key instead of creating another record. Only the latest missed occurrence is
created after downtime, so a long offline period cannot cause an unbounded
catch-up fan-out. A pending retry finishes before a later occurrence begins.
Retry delay is bounded by the manifest policy, terminal success/failure keeps
the created record IDs or safe error text, and local history retains the newest
1,000 runs. The Templates dialog, versioned
`POST /api/databases/template-runs`, and read-only MCP
`data(kind="template_runs")` expose bounded, content-free history by stable
database/template scope.
Blank, starter-schema, existing-folder, bounded typed CSV/TSV, and
agent-authored desired-state creation now share the same immutable plan, ghost
review, creation assertions, and verified commit path. Existing-folder creation
writes only its manifest, then requires a separate read-only source preview; the
browser and `data_task preview_import` expose blockers, while task launch
re-previews and refuses incomplete or unresolved input before assigning stable
record identities. Existing-database schema updates, complete record upserts,
fine-grained record mutations, durable exact-plan bulk commits, source
onboarding, and the current byte-preserving v1 manifest migration are
implemented. Query-selected bulk target compilation and migrations beyond the
declared canonical matrix remain future slices. Exact typed queries accept a
trusted server-side effective-read-scope
resolver. Persisted Agent Views are also part of the v1 manifest: their saved
filter, sort, projection, row/relation scope, token budget, evidence/freshness
contract, sensitivity read policy, and write-policy receipt flow through exact query and Context Pack
responses. Query and pack cursors are bound to the Agent View revision, and a
caller may narrow but cannot widen the saved read contract. Persisted
permission definitions and Agent View write-policy enforcement across mutation
surfaces remain future permission/write slices.

The browser package now exposes one canonical UI mutation command. It creates a
server draft, compiles an exact snapshot-bound plan, returns blocked and
already-converged outcomes without writing, requires the caller to review that
exact plan, and only then sends its unchanged ID, hash, snapshot, human actor,
approval binding, assertions, and durable idempotency key to the same HTTP
commit engine used by agents. UI undo uses the same conflict-preview and apply
endpoint. A cross-package contract test executes this browser command through
the real plan/commit handlers and verifies the resulting transaction receipt.

#### Concurrent record editing contract

Database records use two collaboration granularities. The Markdown body remains
a Y.Text sequence and concurrent body inserts/deletes merge with the existing
editor CRDT rules. Database-owned frontmatter is edited only through typed
operations. Each UI cell, bulk edit, and rectangular paste includes the exact
prior presence/value of every property it changes:

- If another writer changed only different properties, those preconditions
  still match and the planner rebases the typed operations onto the current
  record revision. Both edits survive in one canonical record.
- If both writers produce the same final property value, the second plan is an
  already-converged no-op with no conflict or write.
- If both writers change the same property to different values, its
  precondition fails and the second plan returns `record_revision_changed` for
  explicit reload/review; there is no silent last-writer-wins value loss.
- Agent callers may opt into the same behavior with bounded unique property
  preconditions. A mutation without them retains strict whole-record revision
  semantics. Delete, move, archive, verification, relation-pair repair, and
  schema operations also retain their stricter exact guards.

The commit still binds the rebased current file revision, so a third write
between planning and commit is rejected. This operation-based merge contract is
deterministic across peers without representing YAML mappings as nested CRDT
objects or allowing user-originated source edits inside owned frontmatter.

Schema and saved-view mutations intentionally do not use property rebasing.
They compile the complete desired manifest against one database snapshot and
enter a project-wide cross-process database commit lock. Inside that lock the
commit engine reloads the durable journal, rechecks the plan hash and exact
snapshot revision, then atomically writes and verifies the complete manifest.
The first concurrent schema/view plan may commit; every plan from the former
snapshot fails `snapshot_changed` and must be reloaded and reviewed. Direct
store create/update/rename operations use the store lock and conflict checks as
the lower-level backstop. Consequently destructive schema/view changes cannot
silently merge, overwrite, or partially win.

#### Database collaboration presence and attribution

Database collaboration uses the existing `__system__` awareness channel rather
than opening a provider per database. Each window publishes at most one
ephemeral, typed `databasePresence` entry containing its attributed actor,
stable database/source/view/record/property IDs, surface (`cell`, `record`, or
`schema`), operation (`viewing`, `editing`, `planning`, or `committing`), and a
wall-clock heartbeat. The publisher preserves unrelated system-awareness
fields. Consumers exclude their own client ID, reject malformed or implausibly
future entries, and expire entries after 15 seconds; presence is never written
to Markdown, manifests, Git, or audit history.

UI surfaces declare targets through a process-local focus stack. A cell editor
temporarily takes precedence over its table, and closing a nested editor or
schema dialog restores the still-mounted underlying record target. Table cells
show attributed peers only when database, source, record, and property IDs all
match. Record pages show viewers, property editors, and source schema activity;
table headers show concurrent schema/view work. Badges expose the actor name and
operation to assistive technology as well as using the actor color visually.
The actor union already admits agents, so an agent runtime can publish the same
stable-ID target without a parallel UI-only wire format.

#### Document history and timeline integration

Reviewed database commits and undo operations write through the existing
shadow-Git history. Human and agent database writers use the canonical
`principal-*` and `agent-*` writer-ref taxonomy; filesystem, sync, and system
actors reuse their existing classified refs. The pre-transaction snapshot is a
`checkpoint:` entry, so it remains available as a durable comparison/restore
base without appearing as a user edit. The post-commit entry carries the
existing versioned `ok-contributors` body with actor identity, deterministic
color seed, affected canonical document names, and the bounded plan summary.
Consequently the ordinary document Timeline displays one attributed database
change with its affected document and summary, and database undo appears as a
second attributed change rather than an anonymous server write.

The record-page history view consumes the same `/api/history` and historical
content endpoints. It compares versions into stable property-ID changes plus a
separate body change, prefers canonical record `last_edited_by` metadata, and
falls back through structured contributor, filesystem, and upstream Git
attribution. Transaction-base checkpoints are retained in the comparison
sequence but omitted as events. A missing historical document at a creation
base is treated as an empty predecessor, so a newly created record still has a
complete first history event instead of failing the whole history request.

#### Offline read cache and freshness

The browser retains a bounded least-recently-used cache of the last 12
permission-filtered database description/query pairs plus the most recent
catalog for the lifetime of the renderer. Keys bind database, source, saved
view, archive scope, and stable-ID calculation configuration. Cache values are
structured-cloned at both boundaries so UI mutation cannot corrupt a later
fallback. The cache is deliberately memory-only: permission-filtered record
content is not copied into `localStorage` or another new durable plaintext
store, and restarting the renderer clears it.

After a transport-level offline failure, an exact-key hit remains readable and
is explicitly presented as a read-only cached database. The banner includes the
cache time, canonical snapshot revision, and index freshness, and states that
relations and derived values are only current as of that snapshot. The table's
mutation lock is active while fallback data is displayed. Invalid schema,
permission denial, canonical conflict, and service errors never fall back to
cached content, so denied or malformed live state cannot be mistaken for an
offline snapshot. A successful retry replaces the fallback and clears its
offline marker.

#### Offline write queue and reconciliation

The browser supports offline queuing only for bounded record-property mutation
batches whose every record carries at least one exact prior-value/presence
precondition. Database/schema/view changes, creation, deletion, move, archive,
copy, Button, Verification, automation, permission, and external actions are
not queued. A queue item contains only the stable database/source identity,
typed record operations, actor, durable idempotency key, branch/server-epoch
binding, timestamps, and bounded status metadata; it does not retain a stale
complete desired database definition.

Queued items persist in a dedicated browser IndexedDB across renderer reloads.
The queue accepts at most 100 entries, each at most 1 MiB, processes oldest
first, and stops without reordering when transport fails again. On reconnect,
the selected source is described again and the desired state is rebuilt from
that current schema while preserving the queued record revisions and property
preconditions. The normal server planner therefore rebases edits to unrelated
properties, converges an already-applied value, and blocks divergent edits to
the same property. A branch/server-epoch mismatch, malformed target, planning
conflict, non-network failure, or declined review leaves the entry visibly
blocked; none is silently dropped or applied elsewhere.

Every reconciled write produces a new immutable plan and the ordinary ghost
diff. The user must review that exact current plan before its original durable
idempotency key reaches commit. Successful and already-converged items are
removed; blocked items remain inspectable by count, and the Table UI provides
explicit retry and confirmed discard controls. The queue never treats a local
enqueue as a canonical commit.

#### User-resolvable concurrent changes

Every exact plan identifies the user-facing areas it can conflict with:
record values, schema, select/status options, saved views, formulas/rollups,
relations, and automations. The classification is computed from stable object
IDs and create/update/remove actions, including removed objects, rather than
from display names or error prose. Relation-integrity and record-revision plan
conflicts are attached to their exact area and target IDs.

The Table and record-page surfaces preserve the reviewed plan when a commit is
refused because the canonical snapshot changed. They show each affected area
with domain-specific comparison guidance and two deliberately different
choices. **Use latest state** discards the attempted UI state and reloads
canonical data. **Replan my change** is offered only for a previously
committable plan: it creates a new draft and exact plan against the latest
state, then requires the ordinary ghost-diff review before commit. It never
replays the stale plan or approval token. A plan that was already
non-committable instead asks the user to edit the affected values/settings and
submit again, so intrinsic validation, migration, and missing-target conflicts
cannot enter a retry loop or overwrite canonical state.

The editable table, record-page H1, and visual property panel now recognize
database-owned records and route their database controls through that command.
For a recognized database record, in-app Source Mode protects the complete
database-owned frontmatter region from user-originated CodeMirror transactions
while leaving the Markdown body editable. CRDT transactions without a user-edit
origin remain accepted, so committed database commands still synchronize into
the open source editor. External file edits remain a supported low-level
ingestion path and pass through record validation, indexing diagnostics, and
recovery rather than being treated as UI database mutations. This closes the UI
command boundary without making the canonical Markdown files proprietary or
read-only outside SynapseNote.

### Error and recovery contract

Every database HTTP failure uses `application/problem+json` and the RFC 9457
core members (`type`, `title`, `status`, and correlation `instance`). Database
routes also guarantee these extension members:

```json
{
  "code": "stale_index",
  "retryable": true,
  "recovery": {
    "action": "rebuild_index",
    "instruction": "Wait for or trigger an index rebuild, then retry against the new revision.",
    "retryAfterMs": 500
  }
}
```

`retryable` means the same logical request may be attempted again after the
stated precondition; it never means an invalid request should be looped
unchanged. `recovery.action` is a closed machine dispatch value. It separates
fixing the request, refreshing catalog/schema IDs, restarting pagination,
waiting for a transaction, rebuilding an index, recreating a draft/plan,
requesting approval or access, preserving or replacing an idempotency key,
selecting a current undo token, and stopping for manual recovery. Exact
candidates, revisions, conflicts, or failed assertions remain additional
extension members beside this common envelope.

Request-schema failures include ordered `validationIssues` with machine-readable
codes and segment-array paths; rejected unknown keys also appear as dotted
`unknownFields`. A query that names a missing stable property ID returns current
property candidates and `refresh_schema`; an operator that is invalid for the
resolved property returns its `propertyType` and `allowedOperators`. Stale-index
failures return the observed index state and both observed and expected manifest
revisions with `rebuild_index`. A denied filter or sort returns HTTP 403, the
effective policy ID and revision, denied and allowed property IDs, and
`request_access`. No case is represented as an empty successful result.

The contract covers request-boundary errors (wrong method, invalid JSON/schema,
oversize payload, timeout, and transport failure), domain errors, unavailable
subsystems, and success-schema fallback failures. The `data` MCP tool preserves
the same problem object under `structuredContent.problem` while also returning a
short error text, so an agent can branch on `code` and `recovery.action` without
parsing prose. Local MCP argument refusals use the same `invalid_request`
recovery shape.

The transport conformance suite runs one live in-process data plane through its
direct server methods, HTTP handlers, and all four MCP tools. It compares exact
typed query results and pagination cursors, problem dispatch and recovery
members, immutable plan artifacts, commit receipts, and undo preview/apply
receipts. A repeated mutation may differ only in `idempotentReplay`; mutation
identity, diff, verification, revisions, audit receipt, token, and reversal
result must remain identical.

The public core package also exports a versioned, transport-neutral query
certification kit: `DATABASE_QUERY_CONFORMANCE_VERSION`, canonical source and
record fixtures, `DATABASE_QUERY_CONFORMANCE_CASES`, the portable
`DatabaseQueryResultSchema`, and `runDatabaseQueryConformance(adapter)`. Its v1
vectors cross nested `and`/`or`/`not` filtering, deterministic multi-key sort,
projection, full-match grouping and calculations, two-page cursor continuation,
and a definitive no-match with typed empty aggregate identities. The runner
validates every response, compares only common query
semantics, requires a stable snapshot across pages, detects repeated rows, and
returns structured failures without depending on Bun or another test framework.
Core, the live server method, HTTP, MCP, and the browser query client all run
this exact exported vector. A future TypeScript SDK can certify itself by
passing its query method as the adapter; adding a new transport does not permit
copying or weakening the expected results. Server-only explain, permission,
and revision metadata remain covered by the stricter server/API/MCP equality
suite rather than being erased from that contract.

### Revision, conditional, pagination, and idempotency matrix

The consistency rule is based on operation semantics, not on adding meaningless
fields to every response:

The server package exports `DATABASE_API_SCHEMA_VERSION = 1` and the immutable
`DATABASE_API_SCHEMAS` runtime registry. The registry points to the exact Zod
request/response objects used by catalog, describe, find, query, context pack,
context inspection, plan, commit, undo, and repair handlers, rather than a
second documentation-only copy. Successful database HTTP responses advertise
the same version in `X-SynapseNote-Database-Schema-Version`. Additive optional
members may remain in v1; removing a member, changing its meaning, tightening a
previously valid value, or changing a discriminant requires a new registry
version and migration note.

The v1 registry also defines the transport contract for durable task execution:
start/list/get/cancel/retry/resume/rollback requests plus content-free task identity,
operation (`import`, `migration`, or `bulk`), revision precondition, lifecycle,
bounded progress, terminal result, and RFC-style problem fields. Its state
invariants reject non-terminal `finishedAt`, a successful task without a
result, a failed task without a problem, and progress beyond a known total.

Task metadata is atomically persisted with mode `0600` under the gitignored
`.ok/local/database-tasks/v1` store. Every change receives a content-derived
revision; cancellation requires the exact latest revision and refuses stale or
terminal work. Newest-first list cursors are opaque, state-filter-bound, and do
not overlap when newer tasks arrive. Stored files are schema- and
revision-validated before use, each artifact is capped at 32 KiB, list pages
are capped at 256 KiB as well as 200 entries, and running work
left by a restart becomes an explicit retryable `task_interrupted` failure
rather than remaining falsely active.

The server now also exports a checkpointed task runner foundation shared by all
three operation classes. Immutable executor input and the latest resumable
state are stored separately from public task metadata as mode-`0600`
`.input` and `.checkpoint` artifacts. The public task exposes only attempt and
content-free checkpoint identity, sequence, progress, and time. A handler can
advance progress and checkpoint state in one revision-checked store operation;
cancellation aborts its in-process signal and a late handler result cannot
resurrect a cancelled task. `resume` keeps the latest checkpoint, while `retry`
deletes it and starts again from immutable input. Both require a retryable
failed state and its exact latest revision. A fresh runner/store process can
read the same private input and checkpoint, which is covered by restart tests.
Private artifacts are revision-validated and capped at 16 MiB; they never enter
HTTP/MCP responses or Git.

The product handlers use this runner as follows:

- bulk executes one exact, approved, plan-hash/snapshot-bound commit. Its
  original idempotency key makes a retry after an uncertain response replay the
  durable receipt instead of applying twice. The task is non-cancellable once
  queued because the underlying commit is atomic.
- import runs the existing-folder onboarding preview, refuses incomplete
  previews, freezes every actionable Markdown path and SHA-256, and assigns
  only missing stable record identities. It rechecks the manifest revision and
  each unprocessed file, checkpoints after every record, tolerates a crash
  between identity assignment and checkpoint only when the current file already
  materializes as a valid record, then refreshes the canonical index. Before
  each write it durably records the exact prior bytes and planned post-write
  digest under `.ok/local/database-task-rollbacks`. Cancellation or failure
  preflights and restores the complete written set. A succeeded import can be
  explicitly rolled back with its exact terminal task revision. Intervening
  edits refuse the whole rollback before any restoration, replay is idempotent,
  and a rolled-back checkpoint cannot resume; the task must be restarted or a
  valid failed attempt retried from immutable input.
- migration freezes selected manifest IDs, keys, and SHA-256 values and applies
  the canonical migration matrix with one checkpoint per manifest.
  `preview_migration` first reports every selected manifest's source/target
  version, exact revision, canonical migration IDs, loss classification, and
  blocker without writing. Start repeats that preview and refuses any blocked
  target before creating a task. The current v1 matrix is byte-preserving
  identity, so current manifests report `alreadyCurrent` and unsupported or
  lossy paths fail closed.

The supported-version migration corpus includes a project tracker, multilingual
research library, and relational CRM alongside the original golden fixture.
Every supported prior version must reach the current version while preserving
exact bytes whenever its migration declares that guarantee, typed semantics,
and the complete recursively collected stable-ID set. Invalid and future
versions must produce no output.

`data_task` start/retry/resume is classified with the other approval-gated MCP
tools. Server startup converts orphaned running work to retryable failure and
dispatches tasks that were durably queued but had not started.

| Surface | Stable revision/precondition | Conditional or continuation contract | Idempotency |
| --- | --- | --- | --- |
| catalog | `manifestRevision` plus query-bound `catalogRevision`; HTTP `ETag` is `catalogRevision` | `If-None-Match` or `ifCatalogRevision` returns compact `notModified`; `complete: true` because catalog is deliberately compact | read-only |
| describe | `manifestRevision` and database `schemaRevision`; HTTP `ETag` is `schemaRevision` | `If-None-Match` or `ifSchemaRevision` returns compact `notModified` | read-only |
| find | `manifestRevision` and `indexRevision`; HTTP `ETag` is `indexRevision` | bounded compiler/retrieval result reports `matched`, `returned`, and `isComplete`; callers use the returned typed query for cursor pagination | read-only |
| query | `queryId`, manifest/index/snapshot revisions, permission policy revision, and optional Agent View revision; HTTP `ETag` is `snapshotRevision` | opaque cursor, limit, post-scope matched/returned counts, completeness, snapshot index freshness, permission-exclusion counts, truncation reason, applied Agent View receipt, and optional revision delta receipt | read-only, deterministic per snapshot and effective read scope |
| pack | schema and index snapshot revisions plus optional Agent View revision; HTTP `ETag` is index revision | opaque request-bound cursor, completeness, omission reason, applied Agent View receipt, and explicit saved-or-requested token budget | read-only, deterministic per snapshot, projection, and budget |
| plan | draft revision, immutable plan hash, manifest snapshot revision, expiry | no pagination; expired or changed snapshots require a new plan | planning is ephemeral and intentionally creates a new artifact |
| commit | exact plan hash and expected snapshot revision | no pagination | required idempotency key; identical retries replay the durable receipt |
| undo | expected and observed snapshot revisions plus file hashes | preview before apply; conflicts are complete for the receipt target set | apply requires an idempotency key; identical retries replay the durable result |
| task | content-derived task revision plus frozen operation-specific target revisions | opaque newest-first cursor bound to the optional state filter; cancel/retry/resume require the latest task revision | list/get are read-only; bulk reuses the approved commit idempotency key, retry replays immutable input, and resume continues from the latest checkpoint |

Catalog ETags bind the normalized search query as well as the manifest revision,
so a cached candidate set can never be reused for a different query merely
because the underlying manifests are unchanged. All conditional MCP inputs map
to the same HTTP semantics and return JSON `notModified` bodies rather than
transport-only 304 responses, preserving compatibility with MCP clients that
require structured JSON tool results.

Database freshness also rides the existing `__system__` CC1 stateless realtime
channel as the public `database-changed` v1 payload. Incremental record
create/update/delete/rename/conflict events are scoped through the canonical
index, coalesced for 100 ms, deduplicated, and capped at 500 affected database,
source, and record IDs; `affectedIdsComplete: false` tells a consumer to
invalidate the workspace scope when a burst exceeds the cap. Schema, Git,
branch, transaction, and startup rebuilds publish workspace-scoped rebuilding,
ready, or error index state immediately. Every payload contains only stable
IDs, causes, sequence, index/manifest revisions, counts, and rebuild progress—
never property values, titles, paths, Markdown, or bodies.

The core schema is shared by the coordinator, broadcaster, and browser parser.
The app forwards a validated payload as `synapsenote:database-changed` for
feature-local subscribers and invalidates the `databases` query-key prefix. CC1
frames are deliberately non-replayed hints, so a WebSocket reconnect also
invalidates that prefix and consumers re-read revision-bearing HTTP state; an
offline client never treats a missed event as proof of freshness. A realtime
listener failure is isolated from canonical indexing, and broadcaster IDs are
bounded before JSON serialization.

Every write uses `plan -> commit -> verify`:

1. `plan` normalizes operations and returns affected objects, a diff, risks,
   conflicts, required approvals, and postconditions.
2. `commit` requires the plan ID, an idempotency key, and the expected snapshot
   revision.
3. The engine executes through a common transaction and policy layer.
4. Postconditions check uniqueness, required values, relation integrity, and
   expected counts. A failed condition rolls the transaction back.
5. The receipt contains the intent summary, exact plan hash, principal/session,
   executing tool version, stable data-source IDs, actual content-free file
   diff, verification, new revisions, and an undo token when reversal is
   possible.

Fine-grained value operations (`set`, `unset`, `add`, `remove`, `increment`,
`append`, `link`, and `unlink`) avoid stale full-record replacement. Schema
changes are migrations with a preview of invalid or lossy rows. Query-based
bulk updates freeze target record IDs at a snapshot and abort by default when a
target revision changes.

Property type changes use an exhaustive ordered matrix over every v1 property
type. Each edge is classified as identity, lossless, conditional, lossy, or
blocked. The core preview is bounded and non-mutating, preserves the stable
property ID, binds every affected record revision, validates target constraints,
reports per-record before/after values and reasons, and retains an exact rollback
value map. Conditional failures block the whole migration; lossy rows require a
separate explicit approval. Derived, virtual, and allocated properties cannot
enter value conversion. The server compiles a successful preview into one
immutable schema-and-record plan, exposed through strict HTTP and the
`data_plan` MCP tool. The Table review surface lists bounded risk rows and keeps
loss approval separate from exact-plan approval. Commit and undo fixtures prove
that the common transaction layer restores both the original schema and exact
source values.

Plans also bind three independent concurrency layers. The workspace database
snapshot catches intervening schema, view, option, or indexed-record changes;
each existing file target carries its exact content revision; and a trusted
write-guard resolver supplies non-empty effective-permission revisions plus any
query-selection snapshots. Commit resolves the guards again under the same
database lock and compares the complete normalized sets. A missing or
unavailable guard, changed permission, changed query selection, changed target,
or changed schema fails before canonical mutation instead of falling back to an
unguarded write.

## Button properties and per-record action plans

A Button property is a virtual, read-only control. It has no canonical
frontmatter value and therefore cannot be filtered, calculated, pasted,
imported, or forged as ordinary record data. The manifest stores a label,
optional confirmation copy, and at most 20 stable-keyed actions. The first
implemented action vocabulary covers current-record mutation, record creation,
archive/restore, and an external webhook proposal. Database actions use stable
source and property IDs. A webhook stores only `connectionId`, `eventName`, an
explicit property allowlist, and an `includeBody` flag; URLs, credentials,
headers, and secrets never enter the public manifest or Button API.
Until one record-target planner can compose both shapes, a definition cannot
combine current-record mutation with archive/restore in the same Button; it
may still combine multiple mutations, record creation, and a final external
proposal. The manifest reports this limitation at load time rather than
allowing a Button that fails only when clicked.

Every click first produces an immutable Button plan. Planning binds:

- database, source, record, Button property, and the exact displayed record
  revision;
- each action's stable ID, affected properties/body, and current trusted
  permission policy ID and revision;
- the ordinary internal database plan, including its snapshot, write guards,
  conflicts, exact diff, risk, and postconditions;
- each external step's connection reference, event, exact permission-filtered
  payload, body-disclosure decision, and UTF-8 egress byte count; and
- a deterministic composite hash over all of the above.

Permission denial or a stale/mis-scoped record fails before payload projection
or internal planning. Manifest validation rejects unknown/read-only mutation
targets, duplicate action/payload IDs, and database actions placed after an
external step. External steps therefore always appear last. This ordering is a
prerequisite for the later durable executor and prevents a definition from
requesting an internal mutation after an irreversible egress.

The Table renders the property as a Button and calls the versioned
`POST /api/databases/button` planning endpoint with the current record
revision. The review surface discloses exact internal record counts and every
external connection/event/property/body/byte decision. Internal-only plans can
commit through the existing exact approval, verification, audit, and undo path.
One exact composite-plan approval starts a durable Button run. The executor
commits the immutable internal plan first through the ordinary verified
transaction engine, persists its mutation and undo receipts, publishes a
deduplicated Button event, and then delivers ordered external steps. Each
delivery rechecks the action permission and connection egress revisions and
uses a stable remote idempotency key. A failure enters bounded exponential
retry without replaying the durable internal commit; restart recovery consults
the commit journal before resuming. Public history is content-free while the
private payload and retry state remain under gitignored `.ok/local/`.

The browser, HTTP API, and `data_button` MCP tool all execute the same reviewed
composite plan and return the same `buttonrun_*` lifecycle receipt. A terminal
success may return the internal transaction's undo token; undo never claims to
reverse an already delivered external effect. An expired pre-commit plan fails
closed and requires a fresh review, while changed permission or egress policy
stops delivery rather than silently widening the approved scope.

Database and source headers can also contain canonical Buttons independent of
any record. They use stable `dbbtn_*` identities, explicit database/source
placement, optional confirmation copy, and an ordered list of at most 20
actions. In the current I-005 contract every action is a scoped
`create_record`: its target source and property values are stable-ID validated
when the manifest loads, so an invalid definition cannot wait until click time
to fail. Agent desired-state plans accept stable source/property keys and
compile them to the same canonical definition.

Invoking a header Button sends only the database and Button IDs. The server
does not invent a record or revision context: it permission-checks each action,
captures every policy revision, and compiles all creates into one immutable
exact database plan. The Table header shows the Button only at its declared
scope, then reuses the ordinary review, verified commit, audit, and undo path.
Header Buttons remain intentionally scoped to atomic record creation. They use
the same composite receipt even when no external step is present; broader
event-driven work belongs to the automation engine.

## Durable database automations

Canonical automation definitions are versioned, owned, enabled or disabled,
and stable-ID validated with record-added, property-changed, schedule,
form-submitted, and Button-invoked triggers. Internal actions cover exact record
creation and update, relation add/remove, person assignment, notification, and
template application. Human, agent, Form, Button, and automation-generated
record changes publish the same content-free event vocabulary; record-backed
events bind the exact indexed revision. An explicit test event additionally
binds one requested automation ID, preventing a schedule test from activating
unrelated schedules in the same database.

Each run freezes the automation version, schema revision, owner, event, and
permission-policy revisions. Internal actions compile into the ordinary
database desired-state plan and use the same exact approval, audit, atomic
transaction, idempotency, and post-commit verification engine as other writes.
Generated events are persisted before an automation's internal commit and are
recovered from its durable commit receipt after restart. Event ancestry,
deduplication keys, maximum generated-event counts, and frozen schema versions
prevent loops, duplicate runs, runaway fan-out, and stale execution.

Notifications and external delivery use a durable outbox. Internal
notifications are recipient-scoped, idempotent, bounded, and expose unread/list
and mark-read operations through HTTP and MCP without loading record content.
Automation runs, pending payloads, notification bodies, repeating-template
history, and Form replay/rate state live under gitignored `.ok/local/`; the
Git-tracked `.ok/databases/` directory remains canonical manifests only.
Webhook and email definitions contain only `conn_*` references and reviewed
property/body projections. URLs, credentials, and headers live only in the
gitignored local connection file; the isolated executor rechecks connection
revision, HTTPS, host and recipient allowlists, DNS/private-network policy, and
maximum egress bytes at delivery time. Public run history retains lifecycle and
receipt metadata but never payloads or secrets.

The browser provides definition editing, ownership/version controls, enable or
disable, unread notifications, and content-free run history. Agents author the
same canonical definitions through desired-state planning, inspect bounded
dry-run summaries, inject deduplicated test events, read compact run and inbox
history, and mark notifications read through the database MCP tools.

## Unique ID allocation and repair

A `unique_id` property stores one positive integer in each canonical record and
keeps its display prefix plus the next allocation watermark in the database
manifest. For example, frontmatter stores `ticket: 42` while the current
`prefix: TASK` projects, copies, and exports `TASK-42`. Changing the prefix is a
reviewed schema edit that changes display only; it never rewrites record
numbers. The Table exposes this prefix editor and keeps every Unique ID cell
read-only.

The plan engine owns allocation. Record creation assigns numbers in declared
transaction order, Duplicate always receives a fresh number, an ordinary
record update preserves its existing number, and a cross-source move receives
the target source's next number. A newly introduced Unique ID property adds all
existing source records as revision-bound backfill targets. Every allocation
advances `nextNumber` in the same exact manifest-and-record transaction. Since
the watermark is canonical Git-tracked state, a standalone clone continues the
sequence without a cache; two concurrent plans may preview the same candidate,
but the second fails its manifest/snapshot guard after the first commits.
Deleted numbers and gaps are never filled.

User, agent, Button, paste, and import value paths cannot assign the numeric
part directly. CSV/TSV export uses the formatted value; imports may create
records through the ordinary planner but cannot forge or overwrite an existing
allocation. Query filters, numeric ordering, and calculations use the stable
numeric part, while Formula projection uses the current formatted text.

The common `data_repair` preview detects missing, invalid, and duplicate Unique
ID numbers. It deterministically keeps the first valid owner in canonical path
order, allocates replacements above both the persisted watermark and every
observed number, and discloses each record rewrite plus the exact manifest
watermark advance. Apply requires approval bound to the immutable plan hash,
rechecks manifest/index/file revisions under lock, writes records and the
manifest together, rebuilds and verifies the index, persists an idempotent
receipt, and rolls both layers back on failure.

## Place values, privacy, and provider boundaries

A `place` property stores one canonical object with `label`, `address`, `lat`,
`lon`, `precision`, and `source`. `precision` is `exact` or `approximate`, and
`source` is `manual`, `device`, or `search`. Search-derived values additionally
retain a bounded provider ID, optional provider place ID, and attribution.
Exact coordinates are normalized to six decimals. Approximate coordinates are
rounded to two decimals before the reviewed mutation reaches canonical
Markdown; the discarded precision is not retained in a cache, hidden field,
or provider payload. This makes the privacy choice durable across query,
clipboard, export, agents, Git history created after that choice, and map links.

Manual name, address, and coordinate editing works without a network. Table
cells provide a local coordinate-grid preview rather than loading remote map
tiles. The stable text projection `label · address` drives lexical filters,
sorting, grouping, Formula text conversion, and compact agent retrieval.
CSV/TSV uses canonical JSON so locale-specific coordinate formatting cannot
change a location. Invalid externally authored objects remain preserved and
repairable under the same D-024 contract as other property values.

Each Place property has independent `externalSearch` and `externalMap` policy,
both defaulting to `disabled`. Enabling search only exposes a per-request
consent checkbox and submit button; typing never performs autocomplete or
sends keystrokes. Enabling maps only exposes a button whose accessible label
states that the stored coordinates will be sent to OpenStreetMap. No tile or
map request occurs before that click. Approximate records send only their
already-rounded coordinates. Disabling either capability does not change
stored records and never removes the offline editor or preview.

The server has no default geocoder. An operator may configure a self-hosted or
contracted Nominatim-compatible HTTPS endpoint with attribution and a User
Agent. Partial configuration stays unavailable, URL credentials are rejected,
and the public community `nominatim.openstreetmap.org` endpoint is rejected so
a standalone clone cannot accidentally violate its usage policy. Submitted
queries are bounded and cached by a one-way digest of the exact request rather
than retaining raw query text as a cache key. Remote failures return a
typed offline-fallback result without echoing the private query or provider
body. See the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
and [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/)
for the external services that motivated these fail-closed defaults.

Agents use the gated `data_place_search` MCP tool or the equivalent HTTP
operation. Both require literal per-call `consent: true`; the MCP client refuses
locally before issuing HTTP when consent is absent. The response is strict,
bounded, provider-attributed, and always states that manual offline fallback is
available. Place creation and editing otherwise use the ordinary stable-ID,
revision-bound `data_plan` flow, so agents can freely manage canonical Place
properties without receiving a general outbound-network capability. This
matches Notion's documented Place name/address behavior while making egress,
coordinate precision, provenance, and offline semantics explicit
([Notion database properties](https://www.notion.com/help/database-properties)).

## Permission and autonomy model

An agent is a distinct principal. Its effective permission is:

```text
user permission
  intersect agent capability
  intersect Agent View policy
  intersect session delegation
```

The shared core represents a human principal as `{kind: "user", id}` and an
agent principal as a different stable ID bound to both `invokingUserId` and a
short-lived `sessionId`; an agent ID equal to its invoking user is invalid.
Each of the four agent layers carries its own content-free policy ID, SHA-256
revision, bound principal, activation window, and scope. Missing, duplicate,
expired, not-yet-active, or principal-mismatched layers fail closed.

The pure effective-access resolver intersects workspace access; database,
source, view, record, and property allowlists; recursive row filters; body
access; and exact read/write/egress/permission actions. `null` allowlists mean
unconstrained only within one layer and never erase a narrower layer. The
result includes a deterministic policy identity/revision and ordered layer
receipts; any layer scope or revision change selects a new cache/cursor
identity. Operation evaluation returns content-free denial reasons plus the
already-intersected row filter and record/property projections. Transport and
storage enforcement of this contract is tracked separately by L-004 through
L-011; callers must not interpret the core model alone as an authorization
boundary. The local HTTP database read path now binds an MCP handshake session
to a distinct agent principal through a validated server-controlled header and
keeps ordinary browser requests bound to the invoking user. The production
query adapter constructs and receipts all four layers for agents, limits those
agents to read actions, and narrows selected saved views to their projection
and row predicate. Catalog discovery now removes denied sources and hidden
property/relation counts before matching or ranking, and its cache revision is
bound to the effective policy receipt. Describe returns either a self-contained
permission-projected schema or an explicit denial; denied schema names are not
returned as recovery candidates, and schema cache revisions include the policy
projection. Exact plan commits are re-authorized by action, database, source,
record, and property immediately before mutation, while audit, autonomy,
automation, task, repair, Button, and external-egress API routes fail closed for
an unscoped agent. Caller-supplied mutation attribution is replaced by the
transport principal in production. Comment reads and writes use the same
record/property decision and replace caller attribution before storage. Draft
reads require query scope; immutable plan reads and commits require the exact
derived mutation actions. Together these boundaries complete L-004.

Permission projection now precedes counts, grouping, ranking, Formula/Rollup
evaluation, relation cards, lexical evidence, body disclosure, error recovery,
and saved-view candidates. Unknown properties in a constrained scope return
only the allowed stable IDs, and generic desired-state planning refuses partial
schema or row visibility before parsing can emit schema candidates. Semantic
search filters ready snapshots by allowed record IDs, projects status counts,
property IDs, timestamps, and revisions to the visible scope, and never rebuilds
the shared index—or calls its embedding provider—from a restricted row,
property, or body scope. Catalog, schema, query, cursor, and retrieval cache
identities include the effective policy projection. These tested boundaries
complete L-005. Persisted permission administration, automation-system
identities, public/share policies, sandboxed enforcement, and the remaining
privacy suite stay tracked by L-006 through L-017.

Database action grants are stored separately from Git in an owner-only,
content-revisioned local policy file. A grant targets one stable user principal
and either one database or the workspace, and names exact Data Plane actions
instead of accepting a caller-defined role. The versioned
`/api/databases/permissions` contract lists, creates, edits, and revokes grants
under `manage_permissions`, uses optimistic revisions for every write, and
binds the actor to the trusted transport principal. The production access
resolver uses these grants for non-owner user and invoking-user layers; the
project owner remains implicit, while agents still intersect the resulting
user grant with their narrower capability, Agent View, and session layers.
The Table surface exposes the same contract through a revision-safe Share
dialog with database or workspace scope, exact action selection, edit, refresh,
and revoke flows. Workspace grants cover database creation; database grants
cover schema editing, deletion, publication, records, and permission
delegation, and moving an existing grant between scopes requires authority over
both its old and new scope. These storage, enforcement, HTTP, and browser
boundaries complete L-006. The shared permission core expands `view_only`
to discovery, record reads, search, query, aggregation, relation expansion, and
Context Packs, while `content_editor` adds only record create, update, and
delete. Neither named role can create/delete databases, alter schemas, manage
permissions, publish, run automations, or perform external egress. The store,
HTTP validator, and browser client reject a named role whose persisted actions
do not exactly match that canonical expansion; Custom remains available for
explicit action-level policy. The Share dialog authors and inspects all three
roles. These invariants and their core, server, client, and DOM tests complete
L-007.

L-008 now models public policies for database/source, saved View,
Form, Chart, and individual record targets. Each policy carries an explicit
property projection, body and Form-submission flags, expiry and revocation
state, and either public access or a secret-bearing link. The owner-only policy
store returns a cryptographically random `dbsharetoken_` value only on initial
issue or explicit rotation, persists only its SHA-256 digest, compares tokens
in constant time, and resolves missing, expired, revoked, or incorrect links to
the same null result. A revision-safe management and anonymous-access HTTP
surface validates targets before persistence, strips token hashes from every
response, and binds only server-resolved active policies into a distinct Data
Plane context. That context re-enforces the exact database/source/View/record,
property, body, and read-only action scope, including saved-View binding and
Form submission opt-in. The browser Share dialog can author, list, rotate, and
revoke database/source, current-View, or open-record links and shows newly
issued credentials once; a dedicated anonymous page renders projected
database, View, Chart, and record data. Public Form links reuse the complete
typed Form renderer and submit only through their bound share policy. Core,
store, Data Plane, HTTP, client, and browser tests cover all five target kinds,
expiry/revocation, invalid tokens, projections, one-time credentials, and Form
submission. These boundaries complete L-008.

Scopes constrain exact database, property, body, and action access; activation
and expiration time; per-action and cumulative row counts; cumulative action
count; and cumulative external-egress bytes. Suggested autonomy modes are:

The current data-plane seam receives an effective record/property allowlist from
trusted server code. Exact queries apply it before filtering, sorting, counts,
and projection and bind the policy identity and revision into query, snapshot,
and cursor identity. Lexical `find` and Context Pack evidence searches apply the
same row/property scope before candidate intersection, term counts, ranking, and
evidence extraction; pack schemas are reduced to the returned property scope as
well. Results report whether the scope was evaluated and how many indexed
records and source properties were excluded. Filters or sorts that depend on a
denied property fail explicitly instead of revealing ordering or predicate
information. Request JSON cannot supply or widen this scope. Aggregations will
enter through this same post-permission query stage when implemented.

An Agent View is a saved, typed least-context contract rather than a visual-only
layout. Its `where`, `sort`, and projection are composed with a caller's request;
the caller can only add filters, request projected properties, and reduce the
budget. `maxRecords` caps each root query page, relation depth/fan-out/total caps
bound expansion, and tokenizer/encoding are fixed by the saved contract.
`evidence: required` makes an evidence query mandatory; full-body disclosure is
available only when the saved body projection is `full`. Every result returns
the Agent View ID, content revision, semantic contract, scope, read policy, and write policy
so an agent and inspector can prove which contract was applied. Write-policy
execution is intentionally left to the common plan/policy engine rather than
being trusted from read-tool input.

Each Agent View also declares `readPolicy.maxSensitivity`; omitted v1 values
default to `internal`. A property's explicit sensitivity, or the database
contract sensitivity when it is `inherit`, is compared with that ceiling before
query projection, lexical evidence retrieval, token estimation, and relation
expansion. Properties above the ceiling cannot be used as hidden pack filters or
sort keys, sensitive relation fields are not traversed, and record bodies inherit
the database sensitivity. This ordering applies equally to object-row and
columnar packs, so encoding cannot reintroduce excluded values. The context
inspector retains only the already-redacted exact pack plus numeric omission
receipts; operational logging uses those content-free receipts and never raw
record values or bodies.

- **Review**: review every write.
- **Balanced**: automatically allow small reversible data edits; review schema,
  bulk, destructive, automation, and external-side-effect changes.
- **Autonomous**: automatically act within explicit delegation budgets while
  retaining approval for irreversible or undelegated external effects.

The shared policy evaluator implements these mode boundaries fail-closed.
Missing database or session configuration resolves to Review, and the effective
mode is always the stricter of the two. Balanced permits only reversible
`update_record` work of at most 20 records. Autonomous additionally requires an
unexpired delegation that names the exact database and action and covers the
requested record count. Destructive, permission-changing, public-sharing,
external-side-effect, and irreversible operations always retain approval.
The server persists database and session modes in owner-only, non-Git local
state with optimistic revisions. Setting a Balanced or Autonomous session
rotates a cryptographically random `dbsession_` capability; only its SHA-256
digest is persisted, and the plaintext is returned once. An unapproved commit
must present that capability together with the exact session ID. Missing,
incorrect, expired, or revoked session authority resolves to Review. Policy
evaluation and mutation run while holding the database commit lock, so a
revocation cannot race an already-authorized transaction and every subsequent
transaction sees the new revision. The versioned `/api/databases/autonomy`
endpoint configures and inspects the policy without exposing stored token
digests or re-disclosing issued capabilities.

Before an automatic commit mutates canonical files, the owner-only policy store
re-evaluates every exact plan operation against the latest policy and its
durable usage counters. It reserves row, action, and egress usage under an
idempotency-hash ledger; retrying the same logical request does not consume the
budget twice, while a different request cannot reuse the reservation. Policy
and usage carry separate content-derived revisions, so consumption cannot mask
configuration changes or make an unrelated revocation stale. A full-record
write is conservatively scoped to every projected property, fine-grained
mutations use their exact stable property IDs, and body changes require an
explicit body grant. External effects retain approval even when an egress
budget would otherwise cover them.

Sensitive-action classification is intrinsic to the typed action, not trusted
from a caller-provided risk flag: `delete_record` is destructive,
`change_permission` changes access, `publish` is public and external, and
`external_communication` has an external side effect. Those classifications,
an explicitly irreversible effect, or any action absent from the exact session
delegation always require approval for the unchanged plan hash in Review,
Balanced, and Autonomous modes. Additional caller-supplied effect flags can
only make a decision stricter; omitting them cannot bypass the gate.

As with the rest of the local tool policy, the session capability does not
constrain an agent that has unrestricted direct filesystem or policy-API
access; a sandboxed deployment remains the security boundary.

Tool policy is not a security boundary for an agent with unrestricted direct
filesystem access. Strict enforcement requires sandboxing the agent so canonical
writes can only pass through the data plane.

The operator-controlled sandbox deployment sets
`SYNAPSENOTE_DATABASE_SANDBOX_MODE=data-plane-only` for the desktop/server and
the `ok mcp` process. In this mode the desktop main-process boundary ignores a
renderer request for workspace-write or full-access and launches built-in Codex
with a read-only filesystem. Both stdio and HTTP MCP registration use a pinned
database-sandbox allowlist: read-only discovery plus `data`, `data_plan`,
`data_commit`, `data_undo`, `data_repair`, `data_task`, and the other governed
database operations. Generic `write`, `edit`, `delete`, `move`, `config`,
restore, conflict-resolution, install, and share tools are absent rather than
merely described as forbidden. For headless or third-party agents the operator
must additionally use a read-only project mount and deny direct access to the
project HTTP port, exposing only the restricted MCP process; otherwise the
agent is not in this deployment mode. The normal human editor and the server's
writer process retain filesystem access, so reviewed Data Plane commits remain
atomic and verifiable.

## Agent Runs inspection

Every database commit attempted by an agent creates a durable, owner-only Agent
Run before canonical mutation starts. A run moves through
`awaiting_approval`, `executing`, and either `succeeded` or `failed`, and binds
the intent summary, principal and session, stable-ID scope, immutable plan and
risk, proposed diff, actual diff, verification, content-free failure, and undo
capability. Raw prompts are never stored in the Agent Run, transaction receipt,
Git, or runtime journal. If the run proposal or execution-start state cannot be
persisted, the agent commit fails closed before touching canonical files.

Raw-prompt retention is off by default and is available only as a separate,
explicit `retain_prompt` action with `consent: true` and a TTL from 60 seconds
to seven days. Retained text stays in process memory, is never copied into an
audit artifact, is deleted at expiry or through `delete_prompt`, and disappears
earlier on server restart. The retain response contains only byte count and
retention timestamps; reading the raw text requires the separate `get_prompt`
action under the same audit-read authorization.

The local store lives under `.ok/local/database-agent-runs/v1/`, is excluded
from canonical Git state, uses owner-only directory and file modes, verifies a
content-derived revision on every read, and rejects symbolic-link or malformed
storage. It retains at most 50 runs within an 8 MiB store. Proposed diffs up to
128 KiB remain exact; larger proposals record their original byte count and an
explicit `size_limit` omission instead of silently truncating or bloating
history.

`POST /api/databases/runs` is progressive: `list` returns compact state, intent,
database scope/counts, plan risk, outcome counts, and undo availability without
exact diffs or bearer tokens; `get` returns one exact run, including its bounded
proposal, actual diff, verification checks, and undo token. The command-palette
**Agent Runs** panel uses this two-step contract, automatically refreshes active
runs, and shows loading, empty, failure, oversized-proposal, and exact-detail
states explicitly.

## Non-canonical UI proposals

The first Table View editing path never inserts an optimistic edit into the
canonical query snapshot. A supported cell edit compiles one stable-property,
record-revision-bound desired-state mutation through the same browser
`plan -> exact review -> commit -> verify` command used by other database
writes. Once planning succeeds, the proposed value is rendered in place with a
dashed **Proposed · not saved** marker and `canonical: false`; the exact plan ID
and risk remain visible while the user approves or discards it. No commit
request is sent before approval.

That reviewed command is the sole browser entry point for canonical database
writes. Record create, cell and bulk edit, duplicate, move, archive, restore,
and delete all send the same desired-state contract to the server planner; the
browser cannot replace validation, permission guards, idempotency, atomic
execution, or verification with direct file writes. It accepts success only
when the receipt identifies the reviewed plan and reports passed verification.
Undo similarly requires a server conflict preview before the idempotent apply.

Record creation uses the same path and adds a non-canonical ghost row without
creating a Markdown file. Record deletion keeps the canonical row visible,
marks it as **Proposed deletion** with `canonical: false`, and removes it only
after the approved transaction verifies and the canonical snapshot reloads.
Discarding either operation sends no commit.

Record duplication sends only the source stable ID, exact source revision,
source key, and requested copy title. The server freezes and copies the complete
typed values and Markdown body into a new stable record ID, includes both IDs in
the immutable plan scope, and re-reads the source bytes under the commit lock.
An intervening source edit aborts without creating the copy. The UI renders the
copy as a discardable create ghost, and ordinary transaction undo removes only
the newly created canonical file.

Table View presents loading and definitive empty states separately. Browser
transport failure, invalid wire/schema responses, stale or failed indexes,
canonical revision conflicts, permission denials, and other service failures
map from typed HTTP status, problem code, and recovery metadata into distinct UI
states rather than an empty record set. Retryable reads can be retried in place;
stale or uncertain writes only reload the latest canonical snapshot and are
never replayed implicitly. Permission denial exposes no retry action until the
effective access policy changes.

Invalid cell drafts stay local and identify the value rule that must be fixed;
they never start a plan. Partial snapshots identify that rows are still omitted
and retain the bounded **Load more** continuation. Conflict, stale-index,
offline, and permission notices expose respectively reload, index recheck,
retry, and access-request guidance, keeping each recovery action aligned with
the server's typed refusal semantics.

Record archive state is stored canonically as an optional ISO timestamp at
`_sn.archived_at`; archiving never changes the file path, source, body, values,
or stable ID. Exact queries and lexical retrieval exclude archived records by
default. `includeArchived: true` is an explicit query-contract choice and
projects `archivedAt` so callers can distinguish state. Archive and restore are
revision-bound desired-state updates, preserve unrelated frontmatter, appear as
non-canonical ghost transitions in Table View, and use the normal atomic receipt
and conflict-safe undo path.

Record move keeps the `rec_…` identity and Markdown body but changes source
ownership and canonical path in one transaction. Planning requires the exact
source revision, maps only equal property keys with compatible types, translates
select and multi-select values through stable option keys, and refuses missing
required target values or an occupied destination. Commit represents the move
as paired delete/create file deltas under one receipt, rechecks both paths under
the lock, preserves unrelated frontmatter, and rebuilds the index before
verification. Undo removes the destination and restores the exact original
source bytes atomically.

Table row selection is stable-ID based and limited to the loaded permission-
scoped records. A bulk property edit compiles one exact-revision mutation per
selected record, caps a browser operation at 100 records, and shows every
changed cell in the same exact-plan ghost review. Scalar, checkbox, select, and
multi-select values use the canonical typed value contract. The successful
multi-file receipt exposes **Undo last change**; the browser previews undo
safety first and applies it only when every canonical path and snapshot still
matches, then reloads the query snapshot.

Table cells are keyboard focus targets: arrow keys move across the loaded grid
and Enter opens the existing typed editor. Copy emits canonical, locale-neutral
cell text rather than formatted display text. Selected rows export a quoted TSV
matrix with headers, stable select keys, JSON multi-select keys, and RFC-style
doubled quotes for embedded tabs/newlines. Pasting a rectangular TSV matrix
validates its complete shape and every typed value before compiling one
revision-bound operation list per affected record; no partial paste reaches the
plan engine. Shift-click or Shift-arrow navigation extends a stable rectangular
cell range. Copy, the cell context menu, and drag start serialize that range
through the same quoted canonical TSV encoder; dropping onto a destination cell
uses the same full-matrix validation and one-plan mutation path as clipboard
paste. The context menu exposes the existing edit and record actions without
creating a second mutation implementation, and the command palette exposes
database Table, Agent Runs, and agent-context entry points. This completes
F-011.

Table View windows loaded canonical rows with bounded overscan and spacer rows;
keyboard movement across a window edge scrolls and restores focus to the exact
stable-ID cell. The single required Title property is forced visible, first,
and sticky. Per-user, per-source layout state stores stable property order,
visibility, bounded widths, cell wrapping, and compact/standard/tall row height,
reconciling removed and newly added property IDs on load for All records. An
active saved view instead composes its canonical projection order and typed
Table display configuration over those local defaults; it never writes the
shared view settings back into the user's All records layout. Column calculations
are requested from the server query aggregate, so the footer covers the full
permission-scoped match set rather than only the currently loaded page. These
controls compose with the existing typed inline editor and fully validated
atomic range paste, completing F-020. Larger file import/export flows remain
open.

Board View stores a typed layout configuration and requires one canonical
group, with one optional subgroup rendered as swimlanes. The server evaluates
saved groups over the complete permission-scoped snapshot, returns bounded
counts and explicit group-limit truncation, and separately returns only the
membership paths needed for records in the current page. This prevents hidden
records from leaking through browser-side grouping while allowing stable option
IDs, empty finite option/Checkbox groups, and paginated cards to reconcile
deterministically. Cards expose the saved projection, size, local Files cover,
fit, and conditional page color. Automatic external cover loading is refused.
Group and per-group card limits remain explicit saved settings.

Keyboard group selection and drag/drop use one transition compiler. A move may
change both the primary and subgroup property; array-valued groups remove the
source membership and add the target without disturbing other memberships.
Read-only and derived group properties remain visible but cannot be mutated.
Every writable transition resolves stable property IDs to canonical keys and
opens the ordinary revision-bound exact-plan review. Full and linked Board
views share this renderer and mutation path, completing F-021.

Timeline View has a typed, source-validated date mapping: either one Date value
whose canonical value may be a point or range, or distinct start and end Date
properties. Saved configuration also bounds the page load, selects an
hour/day/week/month/quarter/year scale, and controls the record table, Today
marker, no-date lane, and dependency display. A dependency property must be a
Relation targeting the same source. Date, dependency, and grouping properties
are operational view dependencies: the server projects them for the renderer
even when they are not visually projected, and refuses the saved query if any
is outside the effective read scope.

The renderer preserves explicit scheduled and unscheduled states, saved groups
and subgroup paths, projected record context, conditional page colors, and
bounded returned-snapshot dependency connectors. It never infers hidden target
records. Whole-bar drag and keyboard movement preserve duration; start and end
handles resize ranges, and separate-property moves change both dates in one
desired state. Month, quarter, and year navigation clamps at calendar month
ends. Scheduling from the no-date lane, moving, and resizing all resolve stable
property identities and enter the ordinary exact-plan review. Full and linked
views share the same path, completing F-022.

Calendar View stores one source-validated Date mapping plus month/week range,
Sunday/Monday week start, weekend visibility, IANA timezone, and an explicit
per-day card limit. The mapped Date remains an operational dependency: saved
queries fetch it even when it is visually hidden and fail closed when the
effective read scope excludes it. The renderer uses calendar-day arithmetic
rather than fixed elapsed hours, so date-only values remain date-only and
date-time values retain their configured wall-clock time across daylight-saving
boundaries.

Point and multi-day records appear on every covered local date, with explicit
range-edge controls, projected card context, conditional page colors, Today
navigation, adjacent-month cells, and a visible no-date count. Whole-card drag
preserves range duration; start/end drag or keyboard controls resize the range
without allowing an inverted interval. Every reschedule resolves the stable
Date property to its canonical key and enters one revision-bound exact-plan
review. Full and linked Calendar views share the renderer and review path,
completing F-023.

List View stores compact or comfortable density, dividers, bounded loading,
section visibility and collapse behavior, plus either a flat layout or a
same-source Relation interpreted as the parent reference. The server applies
the first saved group as permission-scoped section metadata and projects the
parent Relation even when it is not visually shown. A principal that cannot
read that hierarchy dependency receives a failed query rather than a flattened
or partially inferred tree.

The renderer keeps Title first and places the ordered visible projection at the
right, matching the minimal List information hierarchy. Saved groups become
collapsible counted sections. Parent relationships become a cycle-safe tree;
missing or unreadable parents cannot disclose hidden records. Roving focus uses
Up/Down to traverse visible rows, Left/Right to move through or collapse and
expand hierarchy, and Enter to open the canonical Markdown record. Page and
property conditional colors remain inspectable, and full and linked views share
the same renderer, completing F-024.

Gallery View stores small, medium, or large card size; an optional canonical
Files property preview; fit or cropped-fill behavior; Title visibility;
deterministic color or document fallback art; and a bounded load limit. The
preview property is an operational dependency fetched even when it is hidden
from the visible card projection. A principal without access to that Files
property receives a failed saved query instead of a misleading empty preview.

Only available local image assets receive an image request, using the existing
content-root asset route with lazy loading and asynchronous decoding. External
URLs are never loaded automatically. Missing local files, unsupported media,
external references, empty values, and browser image failures retain distinct,
inspectable fallback states. Cards preserve ordered projected properties,
optional Title, page/property conditional colors, and canonical record opening.
Full and linked views share the same renderer, completing F-025.

Chart View stores a vertical or horizontal bar, line, donut, or number layout;
a typed primary dimension and optional series dimension; record count or a
compatible property calculation; legend, value-label, and axis-name choices;
and separate group and drill-through row limits. The saved view compiles these
fields into the ordinary permission-scoped aggregate query. Dimension, series,
and measure properties are operational dependencies even when they are hidden
from the visible projection, so denied analytics fail closed instead of
silently producing misleading totals.

The renderer consumes only the revision-bound aggregate result. It supports
positive and negative Cartesian values, hover labels, a screen-reader-readable
category/series/value representation, keyboard-accessible
drill-through controls, hideable legend series, explicit empty and nonpositive
donut states, and visible group-limit truncation. A drill-through is a bounded
table of records already present in the permission-filtered result page; it
shows the full aggregate match count and says when the saved row limit omitted
additional records. Opening a row navigates to the canonical Markdown record.
Full and linked views share this renderer, completing F-026 without introducing
a second browser-side aggregation contract.

Form View stores an internal-only or explicitly public intake contract rather
than a generic layout blob. Its ordered questions map stable property IDs into
one canonical record, with editable labels and help text, required answers, and
conditions that may depend only on earlier questions. The manifest also stores
close time and message, confirmation copy, whether another response is
offered, local-file limits, honeypot and completion-time checks, a bounded rate
window, an optional scalar duplicate field, and a declared retention policy.
Computed, metadata, Button, and Unique ID properties cannot become writable
questions. Files questions require uploads to be enabled.

The browser evaluates visibility for immediate feedback, uploads attachments
through a Form-scoped variant of the existing safe local asset pipeline, removes hidden answers before
submission, and renders explicit closed, submitting, error, and confirmation
states. A Form linked block fetches its description without querying response
rows, so rendering an intake surface does not copy or expose prior responses.
Full and linked database surfaces use the same renderer and settings contract.

The Form upload route derives its destination from the configured data source,
ignores caller-selected paths, repeats Form access and close checks, requires
uploads to be enabled, and bounds attempts by the Form rate and per-question
file limits. This lets an explicitly public Form accept attachments without
opening the ordinary loopback-only project upload endpoint.

`POST /api/databases/forms/submit` repeats every trust-sensitive decision on
the server: view/source and internal-loopback access, close time, honeypot,
minimum completion time, per-address rate window, known and currently visible
questions, required values, property compatibility and constraints, local-only
file count, and configured duplicate field. Valid answers are translated from
stable property IDs to canonical keys and written by the ordinary exact-plan,
approval-bound commit engine under a Form system actor. A repeated submission
ID with identical content returns the original receipt; reuse with different
content fails. Before mutation, the server durably reserves a content-free
receipt with a deterministic record ID, hashed submission identity, answer
fingerprint, and retention deadline. It never stores answers or remote
addresses in this ledger. If the process stops between commit and receipt
finalization, restart recovery finds the deterministic canonical record and
returns the original response instead of duplicating it. Submission and upload
rate windows also persist under hashes, so restarting the server cannot reset
an abuse limit.

For `delete_after`, an hourly server sweep selects due receipts and compiles an
exact revision-bound record deletion through the ordinary plan, approval,
atomic commit, verification, audit, and idempotency journal. A changed or moved
record fails closed and remains due for operator recovery; an already absent
record converges to deleted. The durable receipt then records the terminal
state, so retention deletion is restart-safe and never rewrites unrelated Form
responses.

Map View stores one stable Place-property mapping, a maximum of 100 returned
markers, initial center and zoom, label and missing-location visibility, plus a
bounded cluster radius. The mapped Place property is an operational query
dependency even when hidden from the visible projection. Permission denial
therefore fails the saved query instead of exposing coordinates indirectly or
misrepresenting denied locations as missing. Full and linked views use the
same renderer and open pins through the canonical Markdown record route.

The default basemap is an on-device coordinate grid that makes no provider
request. A saved view may request OpenStreetMap tiles only when the mapped
Place property independently has `externalMap: explicit`; both changes pass
through the reviewed manifest flow. Tiles carry attribution and no-referrer
requests. Any tile failure removes the remote layer, preserves markers and
interaction on the local map, and exposes an explicit warning rather than an
empty surface. Approximate Place coordinates were already rounded before
storage and cannot regain precision in this view. Records without a valid
location stay in an optional, counted, openable list; page-limit truncation is
also visible. Deterministic grid clustering, drag pan, zoom controls, provider
fallback, and shared full/linked rendering complete F-028.

Dashboard View composes up to twelve existing saved views without copying their
query definitions. Stable row, widget, and global-filter IDs make the layout an
exactly addressable manifest surface for agents; rows persist small, medium, or
large heights and at most four columns of widget width. Each widget performs its
own saved, revision-aware query against its own source and permission scope, so
a Dashboard cannot widen access or infer denied fields. Table, Board, Timeline,
Calendar, List, Gallery, Chart, and Map widgets retain their normal bounded
renderers; Dashboard, Form, and Agent views cannot be nested.

A global filter contains one typed clause per applicable source rather than a
fragile browser-only field-name mapping. Enabled filters are combined with each
widget's saved query. A linked interaction names stable source and target widget
IDs plus a Relation property on the target source; selecting a source record
adds that exact stable record ID as a target filter. Multiple incoming links
compose, invalid or duplicate links fail schema validation, and clearing the
selection restores the saved view. Database change events refresh child queries,
manual refresh and per-widget failures remain local, and narrow screens stack
the persisted four-column layout. Full and linked Dashboards use the same
renderer and settings contract; linked rendering queries only child views rather
than reading rows through the Dashboard container. This completes F-029.

Feed View follows the official stacked-card browsing model while keeping its
ordering and identity machine-readable. Its manifest names one stable Date,
Created time, or Last edited time property and requires that property as the
first descending sort. An optional Person, Created by, or Last edited by
property supplies author identity; otherwise every card shows the source name
and canonical Markdown path. Both mappings are permission-checked operational
fields even when hidden from the visible projection. Cards expose up to four
ordered projected properties and always open the ordinary record page.

Each saved Feed bounds a page to at most 100 records and uses the existing
snapshot-bound, reconstruction-safe cursor for subsequent pages. Partial pages
state the returned and matched counts; full database surfaces offer the common
Load more action, while a bounded linked surface states that more records exist
and can open the full view. Optional read markers are deliberately scoped to
the current browser session and keyed by stable view and record IDs. They are
not synced, returned to agents, or described as durable view counts. This avoids
inventing collaboration telemetry before the record-page collaboration work in
G-002, while still helping a person scan current-session updates. Full, linked,
and Dashboard Feed surfaces share the same renderer. This completes F-030.

Every saved view may persist one of three record-opening behaviors under its
stable identity: a right-side peek, a centered peek, or the ordinary full page.
The saved choice is shared manifest state rather than a browser-only preference,
so linked and full database surfaces—and agents editing the same view—observe
the same behavior. For compatibility with the expected visual workflow,
Gallery, Calendar, and Map default to a centered peek when the field is absent;
other saved layouts default to a side peek. The unsaved **All records** surface
continues to open the full page because it has no shared view configuration.

Both peek modes retain the database context behind them while fetching the
current canonical document body from the ordinary document endpoint. The title,
source, stable path, and permission-projected properties come from the same
snapshot result that rendered the record; the body is never copied into the
view manifest. **Open full page** converts the canonical path to the normal
SynapseNote document route. Full and linked renderers use the same resolver and
peek component, and closing or changing the active source/view clears any stale
peek. This completes G-003 without introducing a second record identity.

Each data source may also define one stable-ID record-page layout. Up to four
properties can be pinned; other properties can be placed in the ordinary panel,
hidden explicitly, or assigned to ordered groups inside ordered sections. Every
section and group has a stable ID and agent-friendly key, groups persist their
initial collapsed state, and the layout may widen the canonical body content.
The Title remains owned by the page header and cannot be placed, every property
may appear in only one region, and invalid or foreign property references fail
manifest validation. A newly added property that has not been placed yet is
appended to the visible panel instead of disappearing accidentally.

**Customize layout** edits the shared source default and submits the complete
stable layout through the ordinary immutable database plan, exact review, and
verified commit path. Reordering sections or groups and changing property
placement never rewrites record Markdown: every existing record resolves the
new source layout when rendered, while its canonical title, values, and body
remain unchanged. This makes propagation atomic, reversible through the normal
manifest transaction, and cheap even for large sources. Full-width styling is
scoped to the active database record and does not affect other tabs or ordinary
documents. These source-default semantics complete G-004 and G-005; per-record
overrides are a separate G-006 layer.

A record may opt out of selected presentation defaults through canonical
`_sn.page_layout_override` metadata. The override is deliberately narrower than
the source layout: it may pin, move to the panel, or hide stable properties;
force an existing stable group open or closed; and inherit, enable, or disable
full-width content. It cannot create sections or groups, place the Title, change
property values, or alter the source schema. Unmentioned properties and groups
continue to inherit the source default. Effective pinned properties remain
bounded to four, duplicate placements and stale property/group IDs fail closed,
and an externally edited invalid override makes the record invalid rather than
silently changing its presentation.

**Customize this record** reads the current revision and canonical body, then
submits a complete record ensure plus the override through exact-plan review.
The verified commit writes the override inside `_sn`; **Reset to source layout**
uses an explicit `null` desired state so deletion is reviewable rather than
ambiguous. Ordinary property edits, archive/restore, and same-source duplication
preserve the override. Cross-source moves clear it because stable layout IDs are
source-local and cannot be assumed compatible. Plan diffs include the before and
after override, Git/undo operates on the canonical file delta, and agents use the
same `sampleRecords[].pageLayoutOverride` contract. This completes G-006 without
creating a browser-only page state or weakening the database contract.

Record discussion is stored separately from Markdown content at
`.ok/comments/databases/<database-id>/<record-id>.json`. Each versioned document
contains stable page- or property-anchored thread and comment IDs, bounded text,
stable actor attribution, declared-person mentions, and paired resolution actor
and timestamp fields. The canonical JSON is shareable through Git, while atomic
temp-file replacement, regular-file/no-symlink checks, and a content revision
prevent corrupt storage and lost concurrent replies. Comment writes never
rewrite the record body or property values.

Page anchors are always available after record authorization. A property anchor
requires a currently assigned value and is rejected for Title, Formula, Rollup,
Button, and Unique ID properties; the browser and server use the same core guard.
Mentions accept only unique active person IDs declared by the database. A
resolved thread keeps its history and must be explicitly reopened before another
reply. Authors may edit their own comments, and every read, comment, resolution,
or moderation attempt passes the store's explicit authorization seam.

The record-page **Comments** panel exposes page/property thread creation,
mentions, replies, and resolve/reopen without leaving the canonical page. Its
client and the `data_comments` MCP tool use the same action endpoint and exact
`expectedRevision`; a 409 reloads current discussion rather than overwriting it.
MCP writes are attributed from the connection identity instead of a caller-
supplied actor, and agents receive the next revision with every response. A
successful mutation enters the ordinary shadow-Git flush path. This completes
G-007 with one discussion identity across human and agent surfaces.

**Record history** enriches the existing rename-aware shadow-Git document
timeline rather than introducing a second database event log. It requests a
bounded newest-first page and resolves each selected commit through the
historical-path endpoint. Adjacent frontmatter versions are compared by the
current source's human-readable keys but reported using stable property IDs;
the Markdown body is a separate change target. This remains meaningful across
property renames in current history while avoiding value disclosure in the
compact event list.

Attribution prefers canonical `_sn.last_edited_by` for reviewed human, agent,
sync, or system database commits. Upstream timeline entries are explicitly
shown as Git/sync, and file-watcher contributors as `filesystem|local`, so an
external editor change survives process restart and does not inherit a stale
database actor. The ordinary Created/Last edited properties continue to project
the current state, while the history dialog answers which stable properties
changed at each durable version. Agents retain the same raw version timeline
through the existing `history` MCP read. This completes G-008 without copying
history into record Markdown or trusting caller-supplied attribution.

The ordinary page shell continues to provide Backlinks for a database record;
the database layer does not synthesize graph edges. Relation frontmatter stores
only stable record IDs (one scalar or an ordered array), which the Markdown
backlink index ignores exactly like any other non-link frontmatter value. An
explicit wiki or Markdown link in the body remains one ordinary graph edge, so
a relationship and a separately authored explanatory link cannot accidentally
produce two generated backlinks.

**Relations** on the record page resolves a bounded set of stored relation IDs
through the permission-filtered exact-record endpoint. It groups readable
targets by the stable source property and opens each returned canonical path as
an ordinary page. Missing and denied targets are intentionally combined into an
unavailable count, and overflow is explicit; neither state leaks a title or
path. The navigation cards exist only in rendered UI and are never written to
Markdown or fed to the backlink index. Query/context agents continue to receive
the same minimal permission-projected relation cards. This completes G-009.

Full-page, right-side peek, and centered peek record surfaces now converge on
the same context. The stable record projection supplies Title and typed
properties; an exact ordinary document read supplies icon, cover, and the
canonical Markdown body; the comment store, rename-aware history resolver,
permission-filtered Relation resolver, and ordinary backlink endpoint power
the same actions in each surface. Peek never caches or copies these fields into
a view manifest, and **Open full page** changes only presentation. The full page
retains editable Markdown, properties, Timeline, and Links panels; peek keeps
its compact property/body rendering read-only and offers the same context
dialogs. This completes G-002 while preserving one canonical record identity.

Opening any projected record converts its canonical `.md` or `.mdx` path to the
ordinary extensionless SynapseNote document route, including nested, spaced,
Unicode, and emoji paths. There is no database-only page object or copied
document: the editor reads the same Markdown bytes, and the canonical
`_sn.record_id` frontmatter remains the database identity.

Because the opened record is an ordinary document, visual Markdown editing,
source mode, tabs, and external editors continue to operate on the same file.
Database-owned updates rewrite only declared property keys and `_sn` metadata,
preserving the Markdown body and unrelated frontmatter. Watcher updates
re-materialize externally changed title, properties, and body under the same
stable record ID and path; invalid external values remain untouched on disk and
surface as index diagnostics instead of being silently coerced or overwritten.
The tolerant indexing path retains every valid typed property plus a
property-ID-keyed raw `invalidValues` sidecar and source diagnostic; strict
planning, import, and commit materialization continue to reject that same
value. Permission projection removes both the raw sidecar entry and diagnostic
before query or record responses. Typed filter leaves evaluate an invalid value
as unknown (including under `not`), grouping and calculations exclude it rather
than counting it as empty, and Formula/Rollup dependencies produce a typed
`result_type_mismatch` error. Table View labels the affected cell, starts repair
from the untouched raw value, and serializes clipboard/CSV/TSV output as
`#INVALID(code): value`, so neither humans nor agents can confuse it with null.

The ghost survives while the exact commit is executing, never enters the query
cache or canonical Markdown, and is cleared on refusal or failure. After a
successful receipt the table enters loading state and re-queries the canonical
snapshot, so the old value cannot flash as current between commit and refresh.
Invalid input, a missing record revision, a stale plan, and transport failures
remain explicit errors rather than silently adopting the proposed value.

## MCP surface

Keep the public surface small and separate reads from writes:

- existing `search`: cross-workspace discovery;
- `data`: `catalog | describe | find | retrieve | query | pack`, always read-only;
- `data_plan`: desired-state changes and diffs;
- `data_commit`: atomic execution of a plan;
- `data_undo`: reversal by mutation receipt;
- `data_repair`: diagnostic preview and approved canonical/index repair;
- `data_task`: approval-gated durable start/list/get/cancel/retry/resume/rollback for
  import, migration, and approved-plan bulk jobs.

The public read tool is `data`, with `catalog`, `describe`, `find`, `retrieve`,
`query`, and `pack` kinds. All kinds are annotated read-only, idempotent, and
non-destructive. `data_plan` is an ephemeral, non-canonical planning tool;
`data_commit` is mutating and idempotent and remains behind explicit user
approval. `data_undo` provides a conflict preview and approval-gated,
idempotent reversal as a separate tool. `data_repair` is also separately gated
because a reviewed repair may intentionally remove an invalid optional value.
`data_task` launches work only from a revision-bound operation-specific input.
Cancel, retry, resume, and rollback require the exact revision returned by the
latest read; retry discards the latest checkpoint, resume preserves it, and
rollback restores the exact pre-import bytes only when no intervening edit is
observed.

### Optional MCP resources and subscriptions

MCP resources are cache-invalidation accelerators, not a second data plane and
not a prerequisite for any tool. Every client can continue to use the complete
`data` read progression without implementing `resources/*`. SynapseNote
registers three revision-bearing JSON resource templates:

| Resource template | Purpose |
| --- | --- |
| `synapsenote://database/catalog{?cwd,q}` | Compact database discovery cards and catalog/manifest revisions. |
| `synapsenote://database/{databaseId}/schema{?cwd,sourceId}` | Exact stable-ID schema plus current content-free index state for a database or source. |
| `synapsenote://database/{databaseId}/source/{sourceId}/snapshot{?cwd}` | Current query/index revision, counts, completeness, permission exclusions, result state, and cursor without record IDs, paths, revisions, values, evidence, or explain trace. |

Reads use the same project routing, permission checks, and live HTTP handlers as
the corresponding `data` operations. The snapshot resource executes a
property-empty, one-row-bounded query only to obtain authoritative state and
then removes `records`, `recordRevisions`, and `trace` before serialization.
Resource payloads therefore cannot become an accidental record-content stream.

An MCP server advertises `resources.subscribe` only when it is attached to a
single running project's database-change coordinator. Subscriptions accept
only concrete URIs matching the templates above. Index transitions invalidate
all subscribed database resources; record changes invalidate matching schema
and source-snapshot resources. Notifications contain only the subscribed URI,
are best-effort non-replayed hints, and require the client to read the resource
again. Unsubscribe, transport close, TTL expiry, and server shutdown all detach
the coordinator listener.

The global multi-project stdio server still exposes readable templates but does
not advertise subscription support because there is no single coordinator to
own. Such clients poll or conditionally re-read revision-bearing resources.
This asymmetry is intentional: absence or loss of a subscription never changes
query correctness, permissions, or tool availability.

## Public types and versioning

The published `@nedian0brien/synapsenote` package exports explicit v1 type
aliases for canonical database manifests/sources/records/queries, transaction
and undo receipts, and Agent Data Plane catalog/describe/find/query/pack/plan/
commit/undo/repair/task inputs, plans, receipts, and results. Public names use
`Database…V1` or
`AgentData…V1`; consumers must not import private `-core` or `-server` packages.

Versioning guarantees:

- The `V1` suffix denotes the canonical or wire contract version, not the npm
  package version. A new incompatible shape receives a new `V2` name and the old
  name remains available through its documented support window.
- Adding optional fields is backward-compatible but agents must preserve unknown
  fields where the owning canonical schema allows them. Removing/renaming a
  field, changing units/identity semantics, making an optional field required,
  or widening an operation's side effects is breaking.
- Stable ID prefixes, receipt hashes, completeness/cursor meaning, and refusal
  versus empty-result semantics cannot change inside v1.
- SynapseNote is pre-1.0: a breaking public type change requires at least a
  package minor changeset and migration/recovery notes; additive behavior uses a
  patch changeset. Canonical schema versions still change independently and
  explicitly.
- Runtime callers validate untrusted wire data with the versioned schemas. Type
  aliases provide compile-time compatibility and do not turn TypeScript into a
  trust boundary.

## UX surfaces

- Database and data-source creation draft
- Reviewed blank, starter-schema, existing-folder, and bounded CSV/TSV creation
- Existing-folder source preview and explicit durable onboarding approval
- Table first, then board/list/calendar/gallery/timeline and compound views
- Agent View with projection, filter, token budget, semantics, and write policy
- Agent context inspector
- Agent runs panel with intent, scope, diff, execution, verification, and undo
- “Why was this found?” and “Why was this not found?” retrieval traces

## Evaluation gates

Before proactive automation ships, the implementation should meet these gates:

- correct data-source Top-1 selection at least 95%;
- ambiguous selection surfaced at least 99%;
- retrieval recall within budget at least 90% and evidence precision at least
  95%;
- at least 50% fewer input tokens than full-record retrieval on the benchmark;
- no silent truncation, stale-index, or permission-as-empty outcomes;
- 100% of writes resolved to stable IDs before commit;
- plan-to-actual diff equality, idempotent retry, and failure-injection rollback
  at 100%;
- zero unauthorized reads and writes in the policy suite;
- prompt-to-valid-database creation without manual schema repair at least 90%.

Evaluate final database state, evidence correctness, token use, and tool-call
count rather than transcript appearance alone.

The repository includes two reusable evaluation contracts for these gates:
`packages/server/src/database-creation-eval.ts` accepts an injected natural-
language prompt planner and reports repair-free held-out creation rate, while
`packages/server/src/database-final-eval.ts` independently checks canonical
state, evidence citations, token budget, tool trace, latency, and recovery.
The latter has a real commit → Context Pack → undo test. R-017 remains open
until a real model/agent output replay is attached to the prompt evaluator.

## Delivery plan

### Phase 1: typed file-native core

- Versioned database and source manifests
- Stable IDs and storage keys
- Markdown record materialization and type validation
- Typed filter, sort, projection, pagination, and completeness metadata

### Phase 2: persistence and table view

- Atomic manifest writes under `.ok/databases/`
- Record ID assignment and migrations for existing Markdown
- Live derived property index
- Server API and editable table view

### Phase 3: Agent Data Plane reads

- Catalog, describe, find, query, and context pack
- Evidence references, token budgets, schema caching, and delta delivery
- Agent View and context inspector

### Phase 4: safe writes and richer databases

- Desired-state drafts, plan/commit/verify/undo, and autonomy modes
- Relations, rollups, formulas, additional property types and views
- Templates, buttons, forms, charts, and database layouts

### Phase 5: automations and proactive agents

- Durable tasks and subscription-driven automations
- Database automations and external actions
- Data-quality monitoring and proactive agent runs

## Decisions made by the first implementation

- Manifest format is YAML version 1.
- Database/source/property/option/record identities are explicit and stable.
- Human-readable frontmatter keys store values; canonical query results use
  property and option IDs.
- A source has exactly one title property.
- Unrelated frontmatter remains untouched and outside the database projection.
- Query pagination and truncation are explicit from the first release.
- The core module is browser- and Node-compatible and contains no filesystem
  writes. The server discovers manifests at startup, persists manifest changes
  atomically, assigns byte-preserving record identities, maintains the live
  index, and serves the versioned public API; the editable table view remains
  Phase 2 work.

## Open questions

- The canonical database-template body format and inheritance behavior.
- The permission model for cross-source relations and permission-filtered
  rollups.
- Which optional semantic-index provider ships first and how its local model
  lifecycle is packaged.
