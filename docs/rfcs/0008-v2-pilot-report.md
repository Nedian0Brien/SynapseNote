# RFC 0008 v2 opt-in pilot report

- 기준일: 2026-07-27
- 범위: content-free repository rehearsal; 사용자 문서/경로/셀 값은 수집하지 않음
- 실행기: `packages/server/src/database-v2-pilot.ts`
- 판정: **조건부 GO for the next release decision**; this content-free rehearsal is
  not a release approval. The repository-wide desktop gate is green, while bounded pilot
  and operator sign-off remain separate release gates.

## Aggregate evidence

| 항목 | 결과 |
| --- | ---: |
| 기간 | 2026-07-20 → 2026-07-27 (7일) |
| blank / template / existing-folder / inline / migrated | 2 / 3 / 1 / 2 / 4 |
| planned / completed / failed / recovery-required tasks | 12 / 12 / 0 / 0 |
| rollback requested / completed / conflicted | 1 / 1 / 0 |
| critical / high / medium / low defects | 0 / 0 / 1 / 2 |

The report is keyed only by a SHA-256 workspace fingerprint and aggregate
counters. The executable gate rejects counter inconsistencies, recovery-required
tasks, rollback conflicts, and any critical/high defect as `no_go`.

This is an opt-in rehearsal, not a claim about an external customer rollout. The report's
GO decision means only that the aggregate counters satisfy the executable schema. The
repository desktop/UX gate is now attached as `DESKTOP-GATE-001`; before changing the
public default, attach the real bounded pilot window and operator sign-off to a release
record using the same schema.
