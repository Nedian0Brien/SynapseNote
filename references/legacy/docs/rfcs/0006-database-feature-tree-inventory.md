# RFC 0006 database feature tree inventory

This inventory is the clean-clone source manifest for the database navigation
and interaction work. It is intentionally separate from the generated app and
desktop output directories.

The authoritative check is:

```bash
bun run check:database:inventory
```

The command checks that every source, test, and fixture entry exists. Generated
entries are reported when present but are not required in a clean clone; they
are produced by the desktop/app build gates.

| Kind | Boundary | Clean clone requirement |
| --- | --- | --- |
| source | `packages/app/src/components/DatabaseTableDialog.tsx`, `DatabaseTableRuntime.tsx` | required |
| source | `packages/app/src/components/DatabaseOverlayHost.tsx` | required |
| source | `packages/app/src/lib/database-record-open-command.ts`, `database-navigation.ts`, `database-overlay-store.ts` | required |
| source | `packages/app/src/lib/database-mutations/` | required |
| source | inline/workspace controller facades | required |
| test | database open, table, view-state DOM suites | required |
| fixture | core v1 database and feedback record | required |
| generated | `packages/app/dist`, `packages/desktop/out`, `dist-desktop-local` | build output; not committed |

The inventory script also records whether an entry is tracked by Git. A missing
tracked source/test/fixture is a hard failure; an untracked generated directory
is not treated as a source omission.
