---
title: 서버 문서 동기화 결함 수정 — P1 서로게이트 안전
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P1 서로게이트 안전 — 구현 계획

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/utils/utf16.ts` (새) | `isWellFormedUtf16`, `replaceLoneSurrogates`, 편집 연산의 경계를 코드 포인트에 맞추는 `alignOpsToCodePoints` |
| `packages/core/src/utils/utf16.test.ts` (새) | 위 함수의 고정 기대값 테스트 |
| `packages/core/src/index.ts` | UTF-16 유틸 내보내기 |
| `packages/core/src/bridge/apply-diff.ts` | `applyFastDiff`(DMP)와 prefix/suffix 교체가 정렬된 연산을 쓴다 |
| `packages/core/src/utils/apply-by-prefix-suffix.ts` | prefix/suffix 경계를 코드 포인트에 맞춘다 |
| `packages/core/src/bridge/apply-diff.surrogate.test.ts` (새) | 😀→😁 등 교체에서 `Y.Text`에 가는 모든 insert/delete 위치가 쌍을 가르지 않음 |
| `packages/core/src/schemas/api/agent-write.ts` | `find`/`replace`/`markdown`/`content`가 well-formed가 아니면 검증 실패 |
| `packages/server/src/surrogate-normalizer.ts` (새) | 모든 문서의 `Y.Text('source')`에서 짝 없는 서로게이트를 U+FFFD로 바꾸는 Hocuspocus 확장 |
| `packages/server/src/surrogate-normalizer.test.ts` (새) | 원격 update·서버 편집 뒤 정규화, 한 드레인에 한 번, 정상 텍스트는 건드리지 않음 |
| `packages/server/src/server-factory.ts` | 정규화 확장 등록 |
| (스파이크 브랜치) `native/editor-spike/yrs-patches/0001-split-surrogate-like-yjs.patch` (새) | yrs `ItemContent::splice`에 Yjs 규칙 |
| (스파이크 브랜치) `native/editor-spike/scripts/build-xcframework.sh`, `yrs-ffi/Cargo.toml` | crates.io 소스를 받아 패치 적용, `[patch.crates-io]` |
| (스파이크 브랜치) `native/editor-spike/yrs-ffi/tests/surrogate.rs` (새) | Yjs가 만든 update 4종(생성 스크립트 포함)에서 Yjs와 같은 텍스트 |

## 작업 순서

1. core `utf16.ts` + 테스트. 확인: `bun run test:file -- packages/core/src/utils/utf16.test.ts`.
2. `apply-diff.ts`, `apply-by-prefix-suffix.ts`를 정렬 연산으로. 확인: 새 서로게이트 테스트와 기존
   `apply-by-prefix-suffix.test.ts`, `bridge-intake.test.ts` 통과.
3. agent-write 스키마 검사. 확인: `api-agent-patch.test.ts`에 짝 없는 `find` → 400 테스트 추가 후 통과.
4. 서버 정규화 확장 + 테스트 + 등록. manifest는 파일을 자동으로 분류하므로 편집하지 않는다(새 테스트는 `unit`). 확인: 새 테스트, `test:manifest`에 한 번 나옴.
5. 스파이크 브랜치: yrs 패치, 빌드 스크립트, Rust 테스트. 확인: `cargo test`.
6. dev 서버(:5181)에서 JS 클라이언트가 쌍을 가르는 update를 보낸 뒤 서버 텍스트에 짝 없는 반쪽이 없음을 확인.

## 가장 위험한 단계

2번. `applyFastDiff`는 agent 쓰기, 파일 감시, Observer A Path B가 모두 쓴다. 연산이 바뀌면 원문 바이트나
블록 경계 보존 동작이 달라질 수 있다. 대응: 정렬은 쌍이 걸린 경계에서만 한 글자를 옮기고, 그 외
연산은 그대로 둔다. 기존 bridge·agent 테스트를 모두 돌린다. 되돌리기는 이 커밋 되돌리기로 끝난다.

## 검증

```
bun run test:file -- packages/core/src/utils/utf16.test.ts
bun run test:file -- packages/core/src/bridge/apply-diff.surrogate.test.ts
bun run test:file -- packages/core/src/utils/apply-by-prefix-suffix.test.ts
bun run test:file -- packages/server/src/surrogate-normalizer.test.ts
bun run test:file -- packages/server/src/bridge-intake.test.ts
bun run test:file -- packages/server/src/api-agent-patch.test.ts
bun run --filter @nedian0brien/synapsenote-server test:manifest
cargo test --manifest-path native/editor-spike/yrs-ffi/Cargo.toml   # 스파이크 브랜치
```
