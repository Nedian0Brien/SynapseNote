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
PRELOAD_FLAGS=(
  --timeout 30000
  --isolate
  --max-concurrency 1
  --preload ./tests/dom/jsdom-preload.ts
  --conditions development
)

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

# The full-suite run is BATCHED across several `bun test` processes rather than
# executed as one. `--isolate` gives each file a fresh global object, but every
# file still shares one process: jsdom windows, timers, and Radix portals from
# ~285 files accumulate until the tail of the run is measurably slower than the
# head. That degradation is not a product signal — it expresses itself as
# 30s-timeout failures and blown render-performance budgets in files that pass
# on their own, so the suite's redness tracked how many files ran before them.
# Bounding process lifetime keeps every file's timing comparable to running it
# alone. Each batch inherits the same flags, so per-file semantics are unchanged.
#
# The `.dom.test.tsx` suffix is the D18 routing contract; a looser `.dom.test`
# filter would also pull in `.dom.test.ts` files that the STOP rule at
# tests/integration/dom-test-filename-stop-rule.test.ts does not enforce
# against, blurring the substrate boundary.
DOM_TEST_BATCH_SIZE="${DOM_TEST_BATCH_SIZE:-40}"
batch=()
status=0
run_batch() {
  [ "${#batch[@]}" -eq 0 ] && return 0
  bun test "${PRELOAD_FLAGS[@]}" "${batch[@]}" || status=1
  batch=()
}

while IFS= read -r file; do
  batch+=("$file")
  if [ "${#batch[@]}" -ge "$DOM_TEST_BATCH_SIZE" ]; then run_batch; fi
done < <(find src -name '*.dom.test.tsx' | sort)

if [ "${#batch[@]}" -gt 0 ] || [ "$status" -ne 0 ]; then
  run_batch
  exit "$status"
fi

echo "[test:dom] no *.dom.test.tsx files found in src/"
exit 0
