#!/usr/bin/env bash
# Fetch yrs from crates.io, verify it, and apply the patches in yrs-patches/.
# yrs-ffi builds against the result through [patch.crates-io]; run this before
# `cargo test` or `build-xcframework.sh` (which calls it).
#
# The patch makes yrs split a string item inside a surrogate pair the way Yjs
# does (both halves become U+FFFD), so yrs and Yjs peers converge. See
# yrs-patches/0001-split-surrogate-like-yjs.patch.
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="0.28.0"
# From https://crates.io/api/v1/crates/yrs/0.28.0 (version.checksum), 2026-09-28.
SHA256="52c70dc8beca8666c77612a96889106ca3cd65318609721f464624ff79685da9"
DEST="$SPIKE_DIR/build/yrs-$VERSION"
STAMP="$DEST/.patched"

if [ -f "$STAMP" ]; then
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$SPIKE_DIR/build"
CRATE="$SPIKE_DIR/build/yrs-$VERSION.crate"
curl -sSfL -A "synapsenote-native-spike" -o "$CRATE" "https://crates.io/api/v1/crates/yrs/$VERSION/download"
echo "$SHA256  $CRATE" | shasum -a 256 -c - >/dev/null
tar -xzf "$CRATE" -C "$SPIKE_DIR/build"
for patch in "$SPIKE_DIR"/yrs-patches/*.patch; do
  patch -s -d "$DEST" -p1 < "$patch"
done
touch "$STAMP"
echo "prepared patched yrs $VERSION at $DEST"
