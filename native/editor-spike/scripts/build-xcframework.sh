#!/usr/bin/env bash
# Build yrs-ffi for the iOS simulator and package it as YrsFFI.xcframework,
# plus the UniFFI Swift bindings under Generated/. Both are build outputs and
# are gitignored; rerun this after changing yrs-ffi.
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$SPIKE_DIR/yrs-ffi"
GEN_DIR="$SPIKE_DIR/Generated"
HEADERS_DIR="$SPIKE_DIR/build/headers"
XCFRAMEWORK="$SPIKE_DIR/YrsFFI.xcframework"
SIM_TARGET="aarch64-apple-ios-sim"

"$SPIKE_DIR/scripts/prepare-yrs.sh"
cd "$CRATE_DIR"

# Host build: UniFFI reads the interface metadata from a dylib.
cargo build --release --lib
# Simulator build: the static library the app links.
cargo build --release --lib --target "$SIM_TARGET"

rm -rf "$GEN_DIR" "$HEADERS_DIR" "$XCFRAMEWORK"
mkdir -p "$GEN_DIR" "$HEADERS_DIR"

cargo run --release --quiet --bin uniffi-bindgen -- generate \
  --library "target/release/libyrs_ffi.dylib" \
  --language swift \
  --out-dir "$GEN_DIR"

# The xcframework carries the C header and a module map named for Clang.
mv "$GEN_DIR/yrs_ffiFFI.h" "$HEADERS_DIR/"
mv "$GEN_DIR/yrs_ffiFFI.modulemap" "$HEADERS_DIR/module.modulemap"

xcodebuild -create-xcframework \
  -library "target/$SIM_TARGET/release/libyrs_ffi.a" \
  -headers "$HEADERS_DIR" \
  -output "$XCFRAMEWORK" >/dev/null

echo "built $XCFRAMEWORK and $GEN_DIR/yrs_ffi.swift"
