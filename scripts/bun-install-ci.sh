#!/usr/bin/env bash
#
# bun-install-ci.sh — retry wrapper around `bun install --frozen-lockfile`
# for use in SynapseNote CI workflows.
#
# WHY THIS EXISTS
#   Bun has no built-in retry for tarball-fetch / tarball-extract failures
#   (oven-sh/bun#26879 — still open as of 2026-05). A single transient
#   registry/CDN hiccup during the network phase aborts the whole install
#   with exit 1 and turns a CI job red on noise. We have seen this shape
#   recur on the OK validation job — different transitive packages, same
#   path (cache-miss → resolve OK → fail during extract), the trigger is
#   whichever tarball happens to be in flight at the upstream blip. The
#   bug class is package-agnostic; specific run IDs live in the PR that
#   landed this wrapper (search git log for `bun-install-ci`).
#
#   A second shape is a HANG, not a fast failure: on a cold cache the
#   network phase can stall indefinitely (bun 1.3.x has no install/network
#   idle timeout — `bun install --help` exposes only --network-concurrency).
#   A stalled process never exits, so a retry-on-exit wrapper alone never
#   engages — the hang rides the GitHub job to its `timeout-minutes` cap,
#   which CANCELS the whole job (and any required gate it feeds) and cannot
#   retry. The per-attempt watchdog below converts that hang into a
#   bounded, retryable non-zero exit.
#
# WHAT IT DOES
#   Runs `bun install --frozen-lockfile` (or whatever is in $BUN_INSTALL_CMD)
#   up to $BUN_INSTALL_MAX_ATTEMPTS times, sleeping
#   $BUN_INSTALL_RETRY_SLEEP_BASE * 2^(n-1) seconds between attempts
#   (5s, 10s for the prod default of 3 attempts at 5s base). Each attempt is
#   bounded by a $BUN_INSTALL_ATTEMPT_TIMEOUT-second watchdog: a hung attempt
#   is SIGTERM'd (then SIGKILL'd after a grace window) and counts as a
#   retryable failure. Emits a GitHub Actions ::warning:: annotation per
#   retry (distinguishing a timeout from an ordinary failure) and a single
#   ::error:: annotation on final exhaustion so the noise is visible in the
#   Actions UI without masking persistent failures.
#
# WHY NOT SOMETHING ELSE
#   - Wider Bun cache scope is orthogonal — it reduces frequency of cold
#     installs but does not remove the failure mode. Pair with retry, do
#     not substitute.
#   - `.bun-version` bump: oven-sh/bun#26879 is still open. When it lands,
#     remove this wrapper and the workflow call sites.
#   - GNU `timeout` / `gtimeout` for the per-attempt bound: not portable —
#     neither ships with base macOS, and GitHub's macos runner images do not
#     guarantee GNU coreutils. The watchdog here is pure bash so it behaves
#     identically on the Linux and macOS runners.
#   - A GitHub Actions step-level `timeout-minutes` on the install step would
#     fail faster but still only CANCELS (red, no retry). The point is to
#     self-heal, so the bound lives here where a retry can follow it.
#   - Inline retry at each call site: 11 call sites in total — 5 in
#     public-synapsenote-validation.yml, 3 in root .github/workflows/
#     (beta-cut, main-reset, mirror-sync), and 3 in OK-mirrored workflows
#     (release.yml, desktop-release.yml, desktop-build.yml). Centralizing
#     keeps the retry knobs in one place.
#
# ENV
#   BUN_INSTALL_CMD                Path to the install executable. Default:
#                                  unset, meaning the script runs
#                                  `bun install --frozen-lockfile` directly.
#                                  Tests inject a stub script here. The
#                                  wrapper does not gate this on a "test
#                                  mode" flag — fork-PR security is enforced
#                                  upstream by reviewer-approval and the
#                                  gate-job pattern, not by this script.
#   BUN_INSTALL_MAX_ATTEMPTS       Total attempts (default: 3). Must be a
#                                  positive integer. 1 means "no retry,
#                                  just run once".
#   BUN_INSTALL_RETRY_SLEEP_BASE   Base seconds between retries (default: 5).
#                                  Must be a non-negative integer. Doubled
#                                  each retry: 5s, 10s, 20s. Tests pass 0.
#   BUN_INSTALL_ATTEMPT_TIMEOUT    Per-attempt wall-clock budget in seconds
#                                  (default: 240). Must be a non-negative
#                                  integer; 0 disables the watchdog (run the
#                                  install unbounded). The default is chosen
#                                  to stay under a 15-min job cap even if
#                                  every attempt times out AND ignores SIGTERM
#                                  (so the watchdog burns the full grace
#                                  window before SIGKILL):
#                                  3 * (240s + 10s grace) + backoff (5s + 10s)
#                                  ≈ 12.75 min < 15 min. A healthy cold install
#                                  finishes well inside 240s.
#   BUN_INSTALL_KILL_GRACE         Seconds to wait after SIGTERM before
#                                  SIGKILL when a timed-out attempt ignores
#                                  the term signal (default: 10). Non-negative
#                                  integer. Tests pass a small value.
#
# EXIT
#   0 on success at any attempt.
#   64 on invalid input (per sysexits.h EX_USAGE).
#   124 when the final attempt timed out (GNU `timeout` convention).
#   Last attempt's exit code on retry exhaustion otherwise.
#
# CALL FORM (workflow YAML)
#   - run: bash scripts/bun-install-ci.sh
#
# OPEN QUESTIONS
#   - oven-sh/bun#26879 is unresolved upstream. The failure-mode shape
#     (whether ~/.bun/install/cache gets poisoned on extract failure) is
#     unknown. The wrapper does NOT clean the cache between retries — if
#     exhausted retries become common (third recurrence of the same
#     package across runs, or a pattern of "all 3 attempts fail same"),
#     either add targeted cache cleanup or escalate upstream.

set -euo pipefail

BUN_INSTALL_MAX_ATTEMPTS="${BUN_INSTALL_MAX_ATTEMPTS:-3}"
BUN_INSTALL_RETRY_SLEEP_BASE="${BUN_INSTALL_RETRY_SLEEP_BASE:-5}"
BUN_INSTALL_ATTEMPT_TIMEOUT="${BUN_INSTALL_ATTEMPT_TIMEOUT:-240}"
BUN_INSTALL_KILL_GRACE="${BUN_INSTALL_KILL_GRACE:-10}"
BUN_INSTALL_CMD="${BUN_INSTALL_CMD:-}"

# Input validation. Reject anything other than a positive integer for
# attempts and a non-negative integer for the sleep base / timeout / grace.
# The previous attempt-counter loop used `[ -ge ]` to detect exhaustion,
# which silently returns false on non-integer rhs and produced an unbounded
# retry loop when MAX_ATTEMPTS was misconfigured (e.g. "3.0", "3 ", "abc").
# Validate loudly here so misconfiguration fails the CI step in milliseconds
# rather than emitting hundreds of ::warning::s until the job times out.
if ! [[ $BUN_INSTALL_MAX_ATTEMPTS =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::BUN_INSTALL_MAX_ATTEMPTS must be a positive integer, got '${BUN_INSTALL_MAX_ATTEMPTS}'" >&2
  exit 64
fi
if ! [[ $BUN_INSTALL_RETRY_SLEEP_BASE =~ ^[0-9]+$ ]]; then
  echo "::error::BUN_INSTALL_RETRY_SLEEP_BASE must be a non-negative integer, got '${BUN_INSTALL_RETRY_SLEEP_BASE}'" >&2
  exit 64
fi
if ! [[ $BUN_INSTALL_ATTEMPT_TIMEOUT =~ ^[0-9]+$ ]]; then
  echo "::error::BUN_INSTALL_ATTEMPT_TIMEOUT must be a non-negative integer, got '${BUN_INSTALL_ATTEMPT_TIMEOUT}'" >&2
  exit 64
fi
if ! [[ $BUN_INSTALL_KILL_GRACE =~ ^[0-9]+$ ]]; then
  echo "::error::BUN_INSTALL_KILL_GRACE must be a non-negative integer, got '${BUN_INSTALL_KILL_GRACE}'" >&2
  exit 64
fi

# Single source of truth for the install argv. The default path is identical
# to what every prior workflow used — only test runs swap in a stub via
# $BUN_INSTALL_CMD.
if [ -n "$BUN_INSTALL_CMD" ]; then
  INSTALL_ARGV=("$BUN_INSTALL_CMD")
else
  # --minimum-release-age=0: this is a REPRODUCTION install of the committed,
  # reviewed bun.lock, so it must not re-apply the supply-chain cooldown
  # (bunfig.toml minimumReleaseAge) and reject an already-locked but recently
  # published dependency. bun enforces minimumReleaseAge during frozen
  # range-resolution and has no trust-the-lockfile opt-out (oven-sh/bun#30525,
  # #30526), so we neutralize it here. The cooldown still gates `bun add` /
  # `bun update` (admission), which is where supply-chain protection belongs.
  INSTALL_ARGV=(bun install --frozen-lockfile --minimum-release-age=0)
fi

# Run one attempt directly (no watchdog). Used when BUN_INSTALL_ATTEMPT_TIMEOUT
# is 0. Returns the install's own exit code; control returns to the retry loop.
run_install() {
  "${INSTALL_ARGV[@]}" "$@"
}

# Run one attempt under a portable, bash-native watchdog. Returns the install's
# exit code, or 124 if the watchdog had to kill it (matching GNU `timeout`).
#
# The install runs in a backgrounded subshell that `exec`s the command, so the
# backgrounded PID *is* the install process — SIGTERM/SIGKILL hit bun directly
# rather than an intermediate shell that would orphan it. A sibling watchdog
# subshell polls in 1s ticks (rather than one long `sleep`) — both pre-SIGTERM
# and during the SIGTERM→SIGKILL grace window — so that, however it is torn
# down, no orphaned `sleep` can linger; it also self-exits within ~1s of the
# install finishing on its own, and skips the SIGKILL entirely when the
# install responds to SIGTERM before the grace window expires.
run_install_timed() {
  ( exec "${INSTALL_ARGV[@]}" "$@" ) &
  local install_pid=$!

  (
    waited=0  # subshell-local; `local` is illegal outside a function
    while [ "$waited" -lt "$BUN_INSTALL_ATTEMPT_TIMEOUT" ]; do
      kill -0 "$install_pid" 2>/dev/null || exit 0  # install finished on its own
      sleep 1
      waited=$((waited + 1))
    done
    kill -TERM "$install_pid" 2>/dev/null || exit 0
    grace_waited=0
    while [ "$grace_waited" -lt "$BUN_INSTALL_KILL_GRACE" ]; do
      kill -0 "$install_pid" 2>/dev/null || exit 0  # SIGTERM took; skip the SIGKILL
      sleep 1
      grace_waited=$((grace_waited + 1))
    done
    kill -KILL "$install_pid" 2>/dev/null || true
  ) &
  local watchdog_pid=$!

  local rc=0
  wait "$install_pid" 2>/dev/null || rc=$?

  # Install finished (success, own failure, or watchdog kill). Retire the
  # watchdog; SIGTERM unblocks its current 1s tick so the wait returns at once.
  kill -TERM "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true

  # A watchdog kill surfaces as 143 (128+SIGTERM) or 137 (128+SIGKILL).
  # Normalize both to 124 so the retry annotation can name the hang and
  # downstream sees the stable "timed out" code.
  if [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
    return 124
  fi
  return "$rc"
}

attempt=1
while true; do
  rc=0
  if [ "$BUN_INSTALL_ATTEMPT_TIMEOUT" -eq 0 ]; then
    run_install "$@" || rc=$?
  else
    run_install_timed "$@" || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    exit 0
  fi

  # Name the failure mode so a hang (exit 124) is distinguishable from an
  # ordinary install failure in the Actions Annotations panel.
  if [ "$rc" -eq 124 ]; then
    reason="timed out after ${BUN_INSTALL_ATTEMPT_TIMEOUT}s"
  else
    reason="failed (exit ${rc})"
  fi

  if [ "$attempt" -ge "$BUN_INSTALL_MAX_ATTEMPTS" ]; then
    noun="attempts"
    [ "$BUN_INSTALL_MAX_ATTEMPTS" = "1" ] && noun="attempt"
    echo "::error::bun install --frozen-lockfile ${reason}; giving up after ${BUN_INSTALL_MAX_ATTEMPTS} ${noun}. Tracker: https://github.com/oven-sh/bun/issues/26879"
    exit "$rc"
  fi
  sleep_for=$((BUN_INSTALL_RETRY_SLEEP_BASE * (1 << (attempt - 1))))
  # Annotation format mirrors .github/scripts/gh-retry.sh and the inline
  # gh-api retry in public-synapsenote-validation.yml (`(attempt N/M)`
  # parenthetical) so operators scanning the Annotations panel see a
  # uniform shape across CI jobs.
  echo "::warning::bun install --frozen-lockfile ${reason} (attempt ${attempt}/${BUN_INSTALL_MAX_ATTEMPTS}); retrying in ${sleep_for}s"
  sleep "$sleep_for"
  attempt=$((attempt + 1))
done
