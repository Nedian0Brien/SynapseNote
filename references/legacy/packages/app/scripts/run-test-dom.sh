#!/usr/bin/env bash
# Tier-3 test runner: invocation-scoped jsdom preload + workspace-package
# resolution. Filters to `*.dom.test.tsx` files when called without args
# so unit-tier tests (which assume no DOM) are not pulled in.
#
# Examples:
#   bun run test:dom                                  # all *.dom.test.tsx in src/
#   bun run test:dom src/components/Foo.dom.test.tsx  # one file
#
# Exits 0 when no *.dom.test.tsx files exist (substrate present, no adopters yet).

set -euo pipefail

# `--isolate`: run each test file in a fresh global object so that
# `mock.module(...)` calls (which Bun documents as in-place module patches
# that persist across test files within one `bun test` invocation —
# oven-sh/bun#12823) don't leak from one `.dom.test.tsx` into the next.
# Without this flag, `config-provider.dom.test.tsx`'s
# `mock.module('@/hooks/use-theme-bridge', () => ({ useThemeBridge: () => {} }))`
# replaces the hook globally; any sibling test file that imports the real
# hook later in the run gets the no-op shim and its useEffect never fires
# bridge.setThemeSource — exactly the `Received: 0` failure mode this
# substrate hit on Linux CI (where filesystem-order puts `lib/` before
# `hooks/`). `--isolate` was added in Bun 1.3.x specifically to address
# this class of cross-file mock contamination.
# Database/table suites mount Radix portals and focus guards at document.body.
# Bun's default test concurrency can interleave teardown from one test with the
# next test's portal open, leaving a stale body lock and making an otherwise
# deterministic query fail (or hide the next popover). File isolation alone
# does not prevent that intra-file interleaving, so the DOM tier deliberately
# runs one test at a time. This is a reliability gate, not a product runtime
# constraint; unit and browser suites retain their normal parallelism.
# 60s per test, not the 30s used elsewhere. The longest tests here are chained
# integration walks with a dozen sequential waits; under tier load one measured
# >30s and was aborted mid-chain, which is worse than a slow pass — cleanup()
# runs, the abandoned chain resumes against an empty DOM, and the resulting query
# error is reported as an unhandled error against whichever test runs next. The
# cap still catches a genuine hang; it just stops charging slowness as a hang.
#
# `--max-concurrency 1` keeps tests WITHIN a file serialized (see the Radix
# portal note above). `--parallel` is the orthogonal axis — it distributes FILES
# across worker processes — so the two compose: files run concurrently, the tests
# inside any one file do not. Measured on this suite: 1065s serial → 267s at 8
# workers. `--parallel` implies `--isolate`, so the mock-contamination guard
# above survives; it stays listed for the single-file path below, which does not
# use workers.
PRELOAD_FLAGS=(
  --timeout 60000
  --isolate
  --max-concurrency 1
  --preload ./tests/dom/jsdom-preload.ts
  --conditions development
)

# Capped rather than bun's default (one worker per core): past ~8 the workers
# mostly contend, and every extra worker inflates the wall-clock that this
# suite's async waits are measured against. Override with OK_DOM_TEST_WORKERS.
detect_workers() {
  local cores
  cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)
  if [ "$cores" -gt 8 ]; then echo 8; elif [ "$cores" -lt 1 ]; then echo 1; else echo "$cores"; fi
}
WORKERS=${OK_DOM_TEST_WORKERS:-$(detect_workers)}

# Wall-clock benchmarks cannot share a machine with N busy workers. The
# database render budget asserts p95 < 500ms; measured alone it lands at ~250ms,
# but under 8 workers it read 2320ms — the assertion stops describing render cost
# and starts describing scheduler pressure. It runs by itself, after the fleet.
# Two spellings of the same set: `--path-ignore-patterns` matches against the
# full path and needs the `**/` prefix (without it the fleet silently runs the
# benchmark anyway — it did, and failed at p95 2667ms while the serial pass of
# the same file read 202ms), whereas `find -name` matches the basename alone.
SERIAL_IGNORE_GLOB='**/*.performance.dom.test.tsx'
SERIAL_FIND_NAME='*.performance.dom.test.tsx'

if [ "$#" -gt 0 ]; then
  exec bun test "${PRELOAD_FLAGS[@]}" "$@"
fi

# Guard structurally before the find probe so a missing src/ surfaces
# loudly instead of being swallowed by 2>/dev/null on find's stderr. CI
# clones fresh, so this should never fire — when it does, the repo
# layout is wrong, not the test script.
if [ ! -d src ]; then
  echo "[test:dom] error: src/ directory not found (expected at $(pwd)/src)" >&2
  exit 2
fi

if find src -name '*.dom.test.tsx' -print -quit | grep -q .; then
  # Substring filter (bun test positional arg, not a glob). The full
  # `.dom.test.tsx` suffix is the D18 routing contract; a looser `.dom.test`
  # filter would also pull in `.dom.test.ts` files that the STOP rule at
  # tests/integration/dom-test-filename-stop-rule.test.ts does not enforce
  # against, blurring the substrate boundary.
  status=0
  echo "[test:dom] fleet: ${WORKERS} workers (excluding ${SERIAL_FIND_NAME})"
  bun test "${PRELOAD_FLAGS[@]}" --parallel="${WORKERS}" \
    --path-ignore-patterns="${SERIAL_IGNORE_GLOB}" .dom.test.tsx || status=$?

  # Reported separately even when the fleet already failed: a wall-clock budget
  # that never ran is not a passing budget, and folding it into one exit code
  # hides which half broke.
  if find src -name "${SERIAL_FIND_NAME}" -print -quit | grep -q .; then
    echo "[test:dom] serial: ${SERIAL_FIND_NAME}"
    bun test "${PRELOAD_FLAGS[@]}" .performance.dom.test.tsx || status=$?
  fi
  exit "$status"
fi

echo "[test:dom] no *.dom.test.tsx files found in src/"
exit 0
