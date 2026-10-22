# Database release-candidate dependency/security scan — 2026-07-22

This is the dependency-scan attachment for L-017. It records the exact
workspace state used for the review; it is not a claim that the release
candidate is security-clear.

## Command and environment

```text
bun --version
1.3.14

bun audit --json
```

The command completed and returned findings for the current lockfile. The
machine-readable output was inspected without changing the worktree.

## Result

| Severity | Advisories | Packages with findings |
| --- | ---: | ---: |
| Critical | 0 | — |
| High | 14 | 5 packages |
| Moderate | 35 | 12 packages |
| Low | 9 | 7 packages |
| **Total** | **58** | **15 packages** |

There are no critical findings after the lockfile now forces fixed, compatible
versions for `@protobufjs/utf8`, `basic-ftp`, `fast-uri`, `form-data`,
`protobufjs`, `tar`, `tmp`, `undici`, Vite, and `ws` through bounded root
overrides. The remaining high findings are still release relevant and are
concentrated in `brace-expansion`, Hono, `js-yaml`, `linkify-it`, and Next.

For comparison, the pre-remediation lockfile snapshot on the same day had 99
advisories (12 low, 54 moderate, 31 high, 2 critical), including
`GHSA-w7jw-789q-3m8p` for `shell-quote@1.8.3`. Updating the direct workspace
ranges for `shell-quote`, `ws`, `vite`, `@opentelemetry/core`, `mermaid`, and
`turbo` removed the `shell-quote` critical finding and reduced the total to
91. Root overrides then moved the compatible transitive security packages to
fixed versions and reduced the current scan to 58 with zero critical
findings. Remaining OpenTelemetry and other transitive packages require their
own dependency review; Next 16.2.11 is available upstream but is newer than
this workspace's three-day minimum-release-age policy, so the current lockfile
stays on 16.2.3 until that policy permits the update.

Other release-relevant high findings include `ws` memory exhaustion,
`vite` Windows filesystem-deny bypass, `fast-uri` host/path confusion,
`form-data` multipart boundary handling, `basic-ftp` response buffering,
`undici` proxy/response handling, and `protobufjs` parser/recursion issues.

## Disposition

This scan is attached as evidence, but it is **non-passing**. L-017 remains
open until release engineering either upgrades/removes the affected paths or
records named, time-bounded exceptions with mitigation and a feature-disable
or rollback path. A public-beta or GA approver must not treat this baseline as
an approval.

The next remediation pass should address the remaining high findings and
repeat this exact scan. In particular, OpenTelemetry, Hono, `js-yaml`,
`linkify-it`, Next, and `brace-expansion` require a dependency review rather
than an unreviewed global override. The compatibility overrides must be
revisited when their upstream toolchains natively accept the fixed versions.
