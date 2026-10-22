# MCP tool index details

The project skill keeps the core router short so it stays within the activation
budget. This reference carries the complete target and approval contracts for
the database and native write tools.

## Database reads and writes

Workspace `search` can return `database`, `data_source`, `view`, and `record`
rows with stable IDs and revisions; pass those IDs to `data` instead of
parsing a display path. `data` (`catalog|describe|find|query|pack`) is always
read-only. Pass a described `viewId` to run its revision-bound saved
filter/sort/projection, or `agentViewId` to additionally enforce its scope,
token, and evidence contract.

`data_plan` creates ephemeral desired-state drafts and immutable create/update/
noop plans. Prefer stable IDs; inspect `targetResolutions` when exact stable
keys are compiled. Existing-record upserts and `recordMutations` patches carry
`id` + `expectedRevision` unless one declared unique key resolves exactly.
Patches support ordered `set`, `unset`, multi-select `add`/`remove`, numeric
`increment`, text/body `append`, and relation `link`/`unlink` operations.
`data_commit` executes an exact non-empty plan behind approval and idempotency;
`data_undo` previews conflicts before reversal; `data_repair` previews identity,
value, and index drift; and `data_task` manages frozen imports, migrations, and
approved bulk commits. Review the exact diff, unchanged hash, and snapshot
revision. `requiresCommit: false` with no conflicts means the desired state
already converged. An Agent View write-policy receipt never authorizes a
mutation by itself.

## Native CRUD and skill lifecycle

The native CRUD verbs are polymorphic over `document`, `folder`, `template`,
`skill`, and `asset`: pass exactly one target nested under its address key.
`write` creates or overwrites; `edit` performs a body find/replace or
frontmatter merge-patch; `delete` removes; and `move` renames and rewrites
referrers. A skill move may include `scope`/`toScope` for Project↔Global.
Responses mirror the input target and keep `previewUrl`/`warning` top-level.
`install` projects a drafted skill into editors; `checkpoint` names a version;
`restore_version` rolls one back. Folder frontmatter is self-only and does not
cascade; templates seed new documents. Authoring a skill must invoke
`synapsenote-write-skill`, never a raw `.ok/skills` write.

Constraints JSON Schema cannot express (exactly one target, `find` requiring a
`replace`, or body-XOR-frontmatter) return `isError: true` with a corrective
shape; read it and retry instead of guessing. Users can inspect the last 20
process-local Context Packs through **Inspect agent data context**; that exact
history is never persisted.
