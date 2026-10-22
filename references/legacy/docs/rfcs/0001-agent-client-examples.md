# Agent Data Plane examples by MCP client

- Status: Implemented-surface guide
- Last updated: 2026-07-20
- Applies to: `data`, `data_plan`, `data_commit`, `data_undo`, `data_repair`, and
  `data_task`

Run `ok init` in the project first. The examples use logical MCP tool names;
clients may add a server prefix. Always pass the project `cwd` when one MCP
process can see multiple projects.

## One workflow, four small tools

Read progression:

```json
{"tool":"search","arguments":{"query":"customer feedback","scopes":["database","data_source","view","record"]}}
{"tool":"data","arguments":{"kind":"catalog","query":"customer feedback"}}
{"tool":"data","arguments":{"kind":"describe","databaseId":"db_…","sourceId":"ds_…"}}
{"tool":"data","arguments":{"kind":"find","databaseId":"db_…","sourceId":"ds_…","text":"high priority unresolved feedback"}}
{"tool":"data","arguments":{"kind":"retrieve","databaseId":"db_…","sourceId":"ds_…","text":"customers unable to authenticate after token expiry","retrievalMode":"hybrid","propertyIds":["prop_title","prop_summary"],"lexicalWeight":1,"semanticWeight":1,"requireSemantic":false,"limit":25}}
{"tool":"data","arguments":{"kind":"pack","databaseId":"db_…","sourceId":"ds_…","goal":"prepare a support review","maxTokens":2000,"tokenizer":"utf8_bytes_div3","encoding":"columnar_dictionary"}}
```

`retrieve` is always explicit: `lexical`, `semantic`, or `hybrid`. Hybrid uses
deterministic reciprocal-rank fusion and returns each hit's lexical/semantic
rank and contribution. Inspect `requestedMode`, `appliedMode`,
`degradedReason`, and `semanticIndex` before relying on meaning-based recall.
With `requireSemantic: true`, disabled, blocked, or failed semantic state is an
error instead of a lexical fallback. A stale index is rebuilt by the first
permitted semantic request; if that rebuild cannot reach `ready`, the request
fails. No database vectors are canonical or committed to Git.

Workspace search results for database entities include stable database/source/
view/record IDs and a revision. Pass those IDs to `data`; do not recover them by
splitting the result's synthetic display path. Permission-denied records and
properties are absent before workspace-search ranking and counting.

When `describe` returns a saved Agent View, prefer its stable ID instead of
reconstructing the scope in the prompt. Query applies the saved filter, sort,
projection, and row cap. Pack also applies its token/encoding and semantic
contract, so those settings do not need to be repeated:

```json
{"tool":"data","arguments":{"kind":"query","databaseId":"db_…","sourceId":"ds_…","agentViewId":"view_…"}}
{"tool":"data","arguments":{"kind":"pack","databaseId":"db_…","sourceId":"ds_…","agentViewId":"view_…","goal":"prepare the grounded support brief","disclosure":{"level":"evidence","searchText":"checkout latency"}}}
```

An ordinary saved view can be executed with `viewId`. The response's
`savedQuery.revision` proves which saved filter, default sort, and projection
were applied. Its cursor is rejected after the view, schema/index snapshot,
sort contract, or permission policy revision changes.

```json
{"tool":"data","arguments":{"kind":"query","databaseId":"db_…","sourceId":"ds_…","viewId":"view_…"}}
```

Grouping and per-column calculations use the same stable property IDs. They run
over the complete permission-scoped match set, independently of the record page
limit, and report their own group completeness:

```json
{"tool":"data","arguments":{"kind":"query","databaseId":"db_…","sourceId":"ds_…","query":{"where":{"propertyId":"prop_status","operator":"neq","value":"opt_closed"},"aggregate":{"groupBy":[{"propertyId":"prop_team","direction":"asc"},{"propertyId":"prop_tags","arrayMode":"each"}],"calculations":[{"id":"records","function":"count_all"},{"id":"average_score","function":"average","propertyId":"prop_score"}],"groupLimit":100,"membershipLimit":100},"page":{"limit":25}}}}
```

Check `aggregation.groupsComplete` and `aggregation.truncatedBy` separately from
record-page `isComplete`/`truncatedBy`. A denied grouping or calculation
property fails explicitly; it is never silently omitted from a total.

The response includes the applied Agent View revision, semantic contract,
scope, and write-policy receipt. A request may narrow the saved projection or
budget but cannot widen it. If the semantic contract requires evidence, a
records-only pack is rejected with `agent_view_scope_violation`; if the request
exceeds its budget, it is rejected with `agent_view_budget_exceeded`. The
write-policy receipt is descriptive on these read calls and never grants a
mutation by itself.

In the SynapseNote app, open the command palette and choose **Inspect agent data
context** to see **What the agent saw**. The inspector shows the exact Context
Pack JSON alongside token counts, permission redactions, omissions, freshness,
and truncation/continuation state. This is a privacy-preserving diagnostic
buffer: only the 20 most recent packs in the current server process are kept,
and none are persisted to the project or Git.

Creation progression:

```json
{
  "tool": "data_plan",
  "arguments": {
    "action": "create_draft",
    "desiredState": {
      "database": {
        "key": "incidents",
        "name": "Incidents",
        "contract": {
          "purpose": "Track production incidents and verified follow-ups",
          "canonicality": "canonical",
          "vocabulary": ["incident", "outage"],
          "freshness": {"expectation": "realtime", "maxAgeSeconds": 60},
          "sensitivity": "internal"
        }
      },
      "sources": [{
        "key": "incidents",
        "name": "Incidents",
        "recordMeaning": "One production incident",
        "folder": "incidents",
        "properties": [
          {"key": "title", "name": "Title", "type": "title", "required": true},
          {"key": "severity", "name": "Severity", "type": "select", "options": [
            {"key": "sev1", "name": "SEV-1"},
            {"key": "sev2", "name": "SEV-2"}
          ]}
        ]
      }],
      "views": [{
        "key": "triage", "name": "Triage", "sourceKey": "incidents", "layout": {"type": "table"},
        "projection": {"propertyKeys": ["title", "severity"]},
        "conditionalColors": [{
          "key": "sev1-row", "name": "SEV-1 row", "color": "red",
          "where": {"propertyKey": "severity", "operator": "eq", "value": "sev1"},
          "applyTo": {"type": "page"}
        }]
      }],
      "templates": [],
      "sampleRecords": [{
        "sourceKey": "incidents",
        "values": {"title": "Example incident", "severity": "sev2"},
        "body": "Replace this sample after review.\n"
      }]
    }
  }
}
```

Use the returned `draft.id` to create the immutable plan:

```json
{"tool":"data_plan","arguments":{"action":"create_plan","draftId":"draft_…"}}
```

Review `committable`, `hash`, `snapshotRevision`, `immutableTargetSet`,
`writeGuards.permissions`, any `writeGuards.querySnapshots`, the exact diff,
conflicts, approvals, and postconditions. Do not commit a changed or
non-committable plan. The mutation call is intentionally separate and should
trigger the client's user approval UI:

```json
{
  "tool": "data_commit",
  "arguments": {
    "planId": "plan_…",
    "planHash": "sha256:…",
    "expectedSnapshotRevision": "sha256:…",
    "idempotencyKey": "incident-db-create-2026-07-19-01",
    "approvalToken": "approve:sha256:…",
    "actor": {"principalId": "agent:session-principal", "kind": "agent"},
    "assertions": {"databaseAbsent": true, "createdRecords": 1}
  }
}
```

The `approvalToken` suffix must be the exact reviewed `planHash`. Preserve the
returned content-free audit receipt and opaque `undoToken`; never log the bearer
token. Preview before applying undo:

```json
{"tool":"data_undo","arguments":{"action":"preview","undoToken":"undo_….secret"}}
```

Only when `canApply` is true and the user approves:

```json
{
  "tool": "data_undo",
  "arguments": {
    "action": "apply",
    "undoToken": "undo_….secret",
    "idempotencyKey": "incident-db-undo-2026-07-19-01",
    "actor": {"principalId": "agent:session-principal", "kind": "agent"}
  }
}
```

Reuse an idempotency key only for the identical logical request. A timeout is a
reason to retry the same request/key, not mint a second mutation.

## Database and session autonomy over HTTP

Review is the fail-closed default. The app or another trusted local controller
can configure a database and session through the versioned policy endpoint.
Every mutation includes the last observed policy revision:

```json
{"action":"set_database","databaseId":"db_…","mode":"autonomous","expectedRevision":"sha256:empty"}
```

Then bind one session to an exact, expiring delegation. `set_session` returns a
`dbsession_…` token once; treat it as a bearer secret and never store it in
Markdown, Git, logs, prompts, or audit metadata:

```json
{"action":"set_session","sessionId":"session-…","mode":"autonomous","expectedRevision":"sha256:…","delegation":{"databaseIds":["db_…"],"actions":["update_record"],"propertyIds":["prop_status"],"allowBody":false,"maxRecordsPerAction":10,"maxRecordsTotal":100,"maxActionsTotal":20,"maxEgressBytesTotal":0,"notBefore":"2026-07-20T00:00:00.000Z","expiresAt":"2026-07-20T01:00:00.000Z"}}
```

An HTTP commit may omit `approvalToken` only for an agent actor and must then
include both `actor.sessionId` and the issued `autonomySessionToken`. The exact
immutable plan is still evaluated under the stricter database/session mode and
delegation. A missing or incorrect token, an expired scope, a sensitive action,
or a policy resolver failure returns an approval/recovery error before mutation.
Rotating or clearing the session invalidates the previous token. The MCP
`data_commit` tool intentionally remains approval-gated; clients must not add
unapproved fields outside its published schema.

Policy inspection does not return the session token:

```json
{"action":"get","databaseId":"db_…","sessionId":"session-…"}
```

The response reports cumulative `usage` plus independent `revision` and
`usageRevision` values. Automatic execution reserves one action per classified
plan effect and the exact affected record count. Full-record writes require all
projected property IDs; body edits require `allowBody`; external egress is
counted in bytes and still requires explicit approval under the sensitive-action
rule. Rotating a session policy resets its token, usage, and idempotent
reservation ledger.

These JSON bodies are sent with `POST /api/databases/autonomy`. A stale
`expectedRevision` returns `autonomy_revision_changed`; read the current policy,
show the changed scope to the user, and request approval instead of retrying an
old widening request automatically.

To converge an existing database, first call `describe`/`query`, then submit the
complete desired definition. Prefer the returned stable database, source,
property, option, and view IDs. If an ID is omitted, only an exact stable-key
match is reused, and the result is visible in `targetResolutions`; fuzzy names
never select a write target. An existing record upsert requires its stable ID
and exact revision, unless the declared unique property resolves exactly one
current record (in which case both are bound by the compiler):

```json
{
  "tool": "data_plan",
  "arguments": {
    "action": "create_draft",
    "desiredState": {
      "database": {"id": "db_…", "key": "incidents", "name": "Incidents", "contract": {"purpose": "Track production incidents", "canonicality": "canonical", "vocabulary": ["incident"], "freshness": {"expectation": "realtime"}, "sensitivity": "internal"}},
      "sources": [{
        "id": "ds_…", "key": "incidents", "name": "Incidents", "recordMeaning": "One incident", "folder": "incidents",
        "properties": [
          {"id": "prop_title", "key": "title", "name": "Title", "type": "title", "required": true},
          {"id": "prop_severity", "key": "severity", "name": "Severity", "type": "select", "options": [{"id": "opt_sev1", "key": "sev1", "name": "SEV-1"}]}
        ]
      }],
      "views": [],
      "sampleRecords": [{"id": "rec_…", "expectedRevision": "sha256:…", "sourceKey": "incidents", "values": {"title": "Checkout outage", "severity": "sev1"}, "body": "Verified impact.\n"}]
    }
  }
}
```

Inspect each normalized operation's `action` and the `alter_schema` ID sets. A
client should also inspect `targetResolutions` and preserve every resolved ID in
the reviewed plan. Conditional-color conditions and property targets accept
`propertyKey`; rule `key` is resolved to the existing stable rule ID on later
drafts. Duplicate unique values or option display names are explicit
ambiguity errors. A fully converged result has no conflicts,
`requiresCommit: false`, and an empty
diff; that is success and must not be sent to `data_commit`. Missing or stale
record revisions are conflicts, never implicit last-write-wins updates. For an
update commit, use `"assertions":{"databaseAbsent":false}` or omit that
assertion. The supplied `values` map and `body` replace the complete
database-owned state for that record; they are not a field patch. Unrelated
frontmatter fields, source order, and comments are preserved.

For a partial edit, keep `sampleRecords` empty and use ordered
`recordMutations`. The target is still revision-bound; alternatively omit `id`
and `expectedRevision` and provide `uniqueValue` when the database declares one
unique property. This fragment assumes the described schema contains the named
properties and options:

```json
{
  "sampleRecords": [],
  "recordMutations": [{
    "id": "rec_…",
    "expectedRevision": "sha256:…",
    "sourceKey": "incidents",
    "operations": [
      {"op": "set", "propertyKey": "severity", "value": "sev1"},
      {"op": "unset", "propertyKey": "assignee"},
      {"op": "add", "propertyKey": "labels", "value": "customer-impacting"},
      {"op": "remove", "propertyKey": "labels", "value": "unconfirmed"},
      {"op": "increment", "propertyKey": "retry_count", "by": 1},
      {"op": "append", "propertyKey": "summary", "value": " Impact verified."},
      {"op": "append", "value": "\nNew body evidence.\n"},
      {"op": "unlink", "propertyKey": "related", "recordId": "rec_old"},
      {"op": "link", "propertyKey": "related", "recordId": "rec_new"}
    ]
  }]
}
```

`add`/`remove` require `multi_select`, `increment` requires an existing finite
number, property `append` requires text/title, and `link`/`unlink` require a
relation. Operations run left-to-right. Freshly planning `increment` or
`append` represents another change; retry only the exact prior plan and
idempotency key when recovering an uncertain commit response.

If commit returns `permission_changed` or `query_snapshot_changed`, do not retry
the old plan. Re-read the effective scope or rerun the selection query, create a
fresh plan, and review the new target set and diff.

## Repair invalid canonical or derived state

Repair is always preview-first and never guesses a missing required value:

```json
{"tool":"data_repair","arguments":{"action":"preview","ttlSeconds":600}}
```

Inspect `actions`, every value-level `changes` entry, `blockers`, snapshot,
expiry, and `committable`. Only after the user approves the exact unchanged
hash, apply it with attribution and a durable idempotency key:

```json
{
  "tool": "data_repair",
  "arguments": {
    "action": "apply",
    "planId": "repair_plan_…",
    "planHash": "sha256:…",
    "approvalToken": "approve:sha256:…",
    "idempotencyKey": "database-repair-2026-07-19-01",
    "principalId": "agent:session-principal"
  }
}
```

If `committable` is false, resolve the reported required-value, conflict,
symlink, unreadable-file, or ambiguous-source blockers and preview again.

## Launch and control durable jobs

Preview existing-folder onboarding from a current manifest snapshot. Resolve
every reported blocker and repeat the read-only preview until it is complete;
then launch the import with the same stable database/source IDs and current
manifest revision. The server re-previews at launch and refuses incomplete or
newly blocked input:

```json
{"tool":"data_task","arguments":{"action":"preview_import","databaseId":"db_…","sourceId":"src_…","expectedManifestRevision":"sha256:…"}}
{"tool":"data_task","arguments":{"action":"start","operation":"import","databaseId":"db_…","sourceId":"src_…","expectedManifestRevision":"sha256:…"}}
```

Preview every selected manifest before launching a migration. The preview is
read-only and returns source/target versions, exact manifest revisions,
canonical migration IDs, loss classification, and blockers. Start re-runs the
same preview and refuses a blocked target before queueing:

```json
{"tool":"data_task","arguments":{"action":"preview_migration","databaseIds":["db_…"],"expectedManifestRevision":"sha256:…","targetVersion":1}}
{"tool":"data_task","arguments":{"action":"start","operation":"migration","databaseIds":["db_…"],"expectedManifestRevision":"sha256:…","targetVersion":1}}
```

For bulk work, pass the exact approved commit request. The plan hash, snapshot,
approval token, and idempotency key retain the same meaning as `data_commit`:

```json
{"tool":"data_task","arguments":{"action":"start","operation":"bulk","commit":{"planId":"plan_…","planHash":"sha256:…","expectedSnapshotRevision":"sha256:…","approvalToken":"approve:sha256:…","idempotencyKey":"bulk-2026-07-20-01","principalId":"agent:session-principal"}}}
```

Each start returns a durable task ID. Follow progress without replaying the
operation:

```json
{"tool":"data_task","arguments":{"action":"list","state":"running","limit":20}}
{"tool":"data_task","arguments":{"action":"get","taskId":"task_…"}}
```

To cancel, first get the latest task and copy its exact revision. Cancellation
refuses if progress or state changed after that read:

```json
{"tool":"data_task","arguments":{"action":"cancel","taskId":"task_…","expectedRevision":"sha256:…"}}
```

If a failed task reports `retryable: true`, copy its latest revision. `resume`
keeps the last durable checkpoint; `retry` discards it and replays the immutable
private input from the beginning:

```json
{"tool":"data_task","arguments":{"action":"resume","taskId":"task_…","expectedRevision":"sha256:…"}}
{"tool":"data_task","arguments":{"action":"retry","taskId":"task_…","expectedRevision":"sha256:…"}}
```

Bulk commits are atomic and therefore non-cancellable. Import and migration
tasks observe cancellation between frozen targets. Start, cancel, retry, and
resume remain approval-gated mutations.

## Claude Code and Claude Desktop

The visible name is commonly `mcp__synapsenote__data` (and the corresponding
`data_plan`, `data_commit`, `data_undo`, `data_repair`, `data_task`). Claude may
show the server/tool name in its approval prompt. `data_commit` and `data_undo`
are in SynapseNote's closed
deny/gated list even when other SynapseNote tools are auto-approved in the
docked terminal. If Claude cannot see them, restart after `ok init` and approve
the project MCP server.

Example prompt:

> Use SynapseNote `data` to find the incident database, describe its exact
> schema, and return a 2,000-token evidence pack. Do not mutate anything.

## Codex

Codex may lazy-load MCP tools. Discover/search for the `synapsenote` server or
`data_plan` before concluding it is absent. Its logical arguments are identical
to the JSON above. The docked terminal's per-server approval mode still treats
potentially unsafe actions separately; inspect the exact plan in the tool result
before approving `data_commit`.

Example prompt:

> Discover SynapseNote's MCP data tools. Draft an Incidents database, show me
> the immutable plan and exact diff, and stop before `data_commit`.

## OpenCode

OpenCode exposes tools from the `synapsenote` MCP entry configured by `ok init`.
Choose a model that supports tool/function calling. Ask for the logical tool
names above; OpenCode handles its server namespace. If a local model rejects
schemas containing references, SynapseNote's database MCP schemas are explicitly
`$ref`-free.

Example prompt:

> Call SynapseNote `data({kind:"catalog"})`, then describe the best candidate.
> Return ambiguity instead of guessing if several databases match.

## Pi

Pi has no native MCP client. SynapseNote's managed project extension bridges MCP
tools into Pi with an `ok_` prefix: `ok_data`, `ok_data_plan`, `ok_data_commit`,
`ok_data_undo`, `ok_data_repair`, and `ok_data_task`. Trust the project folder
and reload Pi so the extension and project skill load. Arguments and structured
results are otherwise identical.

Example prompt:

> Use `ok_data` to query the incident database by stable IDs and explain why
> each returned record matched.

## Generic MCP client

Launch the configured `ok mcp` stdio server, complete MCP initialization, call
`tools/list`, and invoke the exact names `data`, `data_plan`, `data_commit`,
`data_undo`, `data_repair`, and `data_task` through `tools/call`. The client must:

- preserve structured tool output rather than parsing only the human text;
- support user approval for the mutating tools;
- treat `isError: true` and typed HTTP-derived codes as failed operations;
- keep plan hashes, snapshot revisions, stable IDs, completeness, and cursors
  verbatim;
- avoid retrying with a new idempotency key after an uncertain response; and
- work without MCP resources/subscriptions, which are optional accelerators
  rather than prerequisites.

Clients that cannot display approval UI should not expose `data_commit`,
`data_undo`, or `data_repair` to autonomous models. They may still safely expose read-only `data`
and ephemeral `data_plan`.
