#!/usr/bin/env bash
# Build yrs-ffi for the Apple apps and package it for SynapseKit:
#   SynapseKit/Binaries/YrsFFI.xcframework        static libraries + C header
#   SynapseKit/Sources/SyncCore/Generated/yrs_ffi.swift   UniFFI Swift bindings
# Both are build outputs and gitignored; rerun after changing yrs-ffi.
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$NATIVE_DIR/yrs-ffi"
KIT_DIR="$NATIVE_DIR/SynapseKit"
GEN_DIR="$KIT_DIR/Sources/SyncCore/Generated"
HEADERS_DIR="$NATIVE_DIR/build/yrs-headers"
XCFRAMEWORK="$KIT_DIR/Binaries/YrsFFI.xcframework"
TARGETS=(aarch64-apple-darwin aarch64-apple-ios aarch64-apple-ios-sim)

"$NATIVE_DIR/scripts/prepare-yrs.sh"
rustup target add "${TARGETS[@]}" >/dev/null
cd "$CRATE_DIR"

# Host build: UniFFI reads the interface metadata from a dylib.
cargo build --release --lib
for target in "${TARGETS[@]}"; do
  cargo build --release --lib --target "$target"
done

rm -rf "$GEN_DIR" "$HEADERS_DIR" "$XCFRAMEWORK"
mkdir -p "$GEN_DIR" "$HEADERS_DIR" "$(dirname "$XCFRAMEWORK")"
cargo run --release --quiet --bin uniffi-bindgen -- generate \
  --library "target/release/libyrs_ffi.dylib" \
  --language swift \
  --out-dir "$GEN_DIR"

# The xcframework carries the C header and a module map named for Clang.
mv "$GEN_DIR/yrs_ffiFFI.h" "$HEADERS_DIR/"
mv "$GEN_DIR/yrs_ffiFFI.modulemap" "$HEADERS_DIR/module.modulemap"

args=()
for target in "${TARGETS[@]}"; do
  args+=(-library "target/$target/release/libyrs_ffi.a" -headers "$HEADERS_DIR")
done
xcodebuild -create-xcframework "${args[@]}" -output "$XCFRAMEWORK" >/dev/null

echo "built $XCFRAMEWORK and $GEN_DIR/yrs_ffi.swift"
