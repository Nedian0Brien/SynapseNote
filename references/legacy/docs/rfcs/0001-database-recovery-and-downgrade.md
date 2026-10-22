# Database migration recovery and downgrade runbook

- Status: Active design/runbook
- Last updated: 2026-07-19
- Applies to: RFC 0001 database manifests, records, migrations, transaction
  journals, and derived indexes

This runbook is intentionally conservative. Markdown records and database
manifests are canonical. Indexes are disposable. `.ok/local` transaction state
and the shadow Git repository are recovery aids, not a replacement source of
truth.

## First response to a failed migration

1. Stop every SynapseNote server/desktop process for the project. Do not let a
   watcher, sync process, agent, or older binary rewrite files while inspecting
   the failure.
2. Make a byte-for-byte copy of the entire project directory, including hidden
   `.ok` state and the project Git directory. Do not copy only Markdown files.
3. Record the failing SynapseNote version, intended source/target manifest
   versions, branch/HEAD, error code, plan ID/hash, mutation ID, and any receipt
   path shown by diagnostics. Never paste bearer undo tokens into issues/logs.
4. Inspect, but do not edit, these layers:
   - `.ok/databases/` and database-owned Markdown: canonical state;
   - `.ok/local/database-transactions/`: ignored commit, undo, and repair
     idempotency/receipt envelopes;
   - `.ok/local/database-summaries/`: optional ignored generated summaries with
     source/model provenance and explicit stale state; safe to discard;
   - `.ok/.database-transactions/`: incomplete transaction staging, if a crash
     occurred mid-operation;
   - shadow Git history: pre/post transaction bytes and attribution;
   - live index: derived and safe to discard/rebuild only after canonical state
     is settled.
5. Keep the project offline from Git sync until one complete canonical snapshot
   is chosen and validated. Do not merge a partial migration.

## Classify before recovering

| Observation | Safe interpretation | Action |
| --- | --- | --- |
| No canonical target changed; only staging exists | Migration did not cross the canonical boundary. | Preserve evidence, remove staging only through a version that recognizes its journal, then retry from a new plan. |
| All target files match a passed transaction receipt | Commit completed even if the client lost the response. | Retry with the identical idempotency key; do not run a second migration. |
| Some targets match `after`, others match `before` | Partial canonical state; never query or sync it. | Restore the complete pre-transaction backup/shadow checkpoint, then rebuild indexes. |
| Targets differ from both receipt states | Intervening human/Git/filesystem edits exist. | Do not force undo. Preserve all variants and resolve object-by-object with a new migration plan. |
| Manifest version is newer than the running binary | Unsupported, not corrupt. | Use a supporting version read-only or restore an older complete snapshot; never coerce to v1/text. |
| Only index/cache is missing or stale | Canonical state may still be valid. | Validate manifests/records, discard derived cache, and perform a deterministic rebuild. |
| Journal is malformed or symlinked | Idempotency/undo cannot be trusted. | Service fails closed; restore the journal from backup or operate from a verified canonical/shadow checkpoint with maintainer assistance. |

## Restore to the pre-migration snapshot

The preferred recovery is the complete base checkpoint identified by the
transaction receipt. Restore manifests and every affected Markdown path as one
set; never restore only the manifest or only records. Then:

1. Validate every manifest and record identity with the newer binary that
   understands both versions.
2. Confirm no mixed v1/v2 ownership tree remains.
3. Rebuild the record index from canonical files; do not restore an index cache
   from a different manifest revision.
4. Verify relation targets, required/unique values, affected counts, and the
   restored snapshot revision.
5. Create a new checkpoint documenting recovery. Keep the failed migration
   receipt and backup until the retention window ends.

Today, database creation commits expose conflict-previewed `data_undo`. Use
`action=preview` first and apply only when it reports `canApply: true`. If it
refuses, this runbook does not authorize deleting conflict files or changing
hashes to make the token pass.

## Downgrade procedure

Disabling a feature flag is not a data downgrade. To run an older SynapseNote
version:

1. Determine the oldest manifest/property/view/formula/automation versions that
   binary fully implements.
2. With the newer binary, create a downgrade plan that enumerates every changed
   path and unsupported/lossy object. If no downgrade planner exists for that
   version pair, downgrade is unsupported: restore a known older project backup
   or continue using the newer binary.
3. Refuse the downgrade when it would flatten unknown objects, drop stable IDs,
   reuse tombstones, orphan relations, or silently change formula/value
   semantics. Export is not a substitute unless a typed round-trip comparison
   passes.
4. Back up the full project and local journal, then commit the accepted downgrade
   as one verified transaction with a base checkpoint and undo receipt.
5. Open the result with the older binary in read-only/offline mode first. Verify
   manifest discovery, record counts/IDs, queries, relations, and Git status
   before allowing edits or sync.
6. Keep the newer binary and backup available until the downgrade retention
   window expires. A later refusal must restore the whole checkpoint, not patch
   individual YAML fields.

## Never do this

- Do not hand-edit `version:` to trick an older parser.
- Do not delete `_sn` IDs, regenerate IDs, or reuse tombstoned IDs.
- Do not treat an unknown property/view as text.
- Do not copy database-owned records into a second “trash” tree and edit both.
- Do not erase `.ok/local/database-transactions/` before resolving retries.
- Do not publish or sync a mixed or partially restored state.
- Do not rewrite shared Git history as part of normal undo/downgrade.

Once canonical bytes are settled, derived indexes can always be rebuilt. If
there is no complete checkpoint and conflicts cannot be mapped unambiguously,
preserve all evidence and stop: guessing would violate the file-native and
stable-identity contract.
