# Database release-candidate dependency/security scan — 2026-07-23

This is the current dependency-scan attachment for L-017. It supersedes the
2026-07-22 snapshot for current-state reporting; the earlier attachment remains
the historical before/after record.

## Command and environment

```text
bun --version
1.3.14

bun audit --json
```

The command completed and the machine-readable output was summarized without
changing the worktree.

## Result

| Severity | Advisories | Packages with findings |
| --- | ---: | ---: |
| Critical | 0 | — |
| High | 22 | 10 packages |
| Moderate | 44 | 15 packages |
| Low | 10 | 9 packages |
| **Total** | **76** | **19 packages** |

The high-severity findings include `brace-expansion`, `fast-uri`,
`fast-xml-parser`, `hono`, `js-yaml`, `linkify-it`, `next`, and `sharp`.
The current lockfile has no critical findings, but the high findings remain
release-relevant: they include denial-of-service, SSRF, CORS, parser/entity
expansion, host-confusion, and native image-library issues. Several are
transitive and require dependency-owner review rather than an unreviewed root
override.

## Disposition

This scan is **non-passing**. L-017 remains open until release engineering
either upgrades/removes the affected paths or records named, time-bounded
exceptions with concrete mitigation and feature-disable/rollback paths, then a
named public-beta and GA approver signs the residual-risk disposition. Zero
critical findings alone is not security approval.

The 2026-07-22 scan remains linked for historical comparison; its 58-finding
snapshot must not be treated as the current lockfile result.
