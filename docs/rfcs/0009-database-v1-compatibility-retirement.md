# RFC 0009 — v1 compatibility retirement decision

- 상태: Decision recorded for the v2 transition; no removal in this release
- 기준일: 2026-07-27
- 관련 문서: [RFC 0008 canonical storage](./0008-markdown-table-canonical-database-storage.md), [implementation checklist](./0008-markdown-table-database-storage-implementation-checklist.md), [v2 storage reference](../content/reference/database-v2-storage.mdx)

## Decision

Retain the v1 reader, canonical/export adapter, and the explicit v1→v2
migration/import writer for the 2.x compatibility window. Remove the legacy
record-file writer from the default product path now, but do not delete the
compatibility implementation in this release. A future release may remove the
reader and legacy aliases only after a new RFC and release record close every
exit criterion below.

This keeps an existing workspace openable and recoverable without allowing a
table, page, API, MCP, CLI, form, button, or automation edit to silently rewrite
v1 files. Product mutations return one migration-required policy. Migration and
import jobs are the only callers allowed to request the legacy write context.

## Support window and inventory

The support window is the current 2.x line plus one subsequent minor release,
or until the inventory is zero for two consecutive release audits, whichever is
later. The inventory is recorded content-free (counts and hashes, never titles
or body text):

| Capability | 2.x policy | Retirement owner/evidence |
| --- | --- | --- |
| v1 manifest/record reader | retained, read-only in product surfaces | cold-clone and differential fixtures |
| v1 canonical/export adapter | retained for backup, export, and downgrade | export/round-trip fixture IDs |
| v1→v2 migration planner/task | retained and approval-gated | migration task/recovery runbook |
| v1 import/compatibility writer | retained only for explicit import/migration context | runtime guard and call-site audit |
| v1 aliases and generated-path diagnostics | retained while any v1 source exists | alias inventory report |

## Required exit criteria

No removal PR may start until all of the following are attached to a release
record:

1. A content-free workspace inventory reports zero v1 sources, legacy aliases,
   and pending migration tasks for two consecutive release audits.
2. A fresh clone can export every remaining v1 workspace to canonical Markdown
   and restore it through the documented downgrade/import path.
3. Web, desktop, CLI, API, MCP, form, button, and automation guard tests all
   show the same migration-required error for a synthetic v1 source.
4. The migration task passes the full round-trip, crash, rollback, and
   intervening-edit matrix with no open recovery-required task.
5. A user notice, release note, and support runbook specify the last release
   that can open v1 and the exact export command to preserve it.
6. The owner approves a staged removal with a rollback branch and a one-release
   observation window.

## Downgrade and user notice

Before the reader is retired, users can run the canonical export or leave the
source in v1 and downgrade to the last supported release. The v2 new-default
rollout never dual-writes v1 bytes; rolling back the application therefore
means disabling new-default creation and keeping the v1 read/migration path,
not asking the v1 writer to reinterpret v2 tables.

The release note must state that existing v1 databases remain readable but
editing requires migration, that linked documents are preserved, and that
cleanup is retention- and approval-gated. The notice must link to the recovery
runbook and include the content-free inventory command.
