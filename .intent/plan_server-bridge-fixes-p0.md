---
title: 서버 문서 동기화 결함 수정 — P0 측정 기반
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P0 측정 기반 — 구현 계획

P0은 이후 단계가 추측이 아니라 측정 위에서 설계되게 한다. 결함별 재현 테스트는 실패
상태로 main에 들어가지 않도록 각 단계(P1~P4)에서 수정과 같은 커밋에 넣는다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/server/scripts/bench-bridge-drain.ts` (새) | Hocuspocus 없이 Y.Doc + `setupServerObservers`로 드레인 시간을 잰다. 38/1,000/5,000줄 × (`Y.Text` 편집, fragment 편집). `mdManager`의 parse·serialize를 감싸 단계별 시간도 낸다 |
| `native/editor-spike/scripts/soak.ts` (스파이크 브랜치) | `--fragment-writer prosemirror`: ProseMirror 트랜잭션 → `updateYFragment`(mapping 유지)로 편집하는 작성자 |

## 작업 순서

1. 이 워크트리에 `bun install`, dev 서버 구성 `server-bridge-fixes-server`(:5181, 별도 임시
   내용 폴더) 추가. 확인: `GET :5181/api/config` 200.
2. `bench-bridge-drain.ts` 작성·실행. 확인: 크기별 드레인 p50/p95와 단계별 비중 표가 나온다.
3. 스파이크 브랜치 `soak.ts`에 ProseMirror 작성자 추가, 그 브랜치에 커밋. 확인: 2분 실행이 끝나고
   결과가 나온다.
4. 기준 측정(:5181): `server-load.ts` 5,000줄 text·fragment, 삽입 전용 soak 2분 — fragment 합성
   작성자 단독, ProseMirror 작성자 단독. 확인: 아래 "결과"에 수치를 적는다.

## 가장 위험한 단계

3번. ProseMirror 작성자가 실제 웹 편집기와 다르게 동작하면 결함 2의 판단이 틀어진다. 대응:
웹 앱 `TiptapEditor`가 쓰는 스키마(`getSchema(sharedExtensions)`)와 `@tiptap/y-tiptap`의
`updateYFragment`를 그대로 쓰고, mapping을 편집 사이에 유지한다.

## 검증

```
bun packages/server/scripts/bench-bridge-drain.ts
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode text
bun native/editor-spike/scripts/soak.ts --port 5181 --minutes 2 --insert-only --no-app --no-patch --content-dir <dir>
bun native/editor-spike/scripts/soak.ts --port 5181 --minutes 2 --insert-only --no-app --no-patch --fragment-writer prosemirror --content-dir <dir>
```

## 결과

(측정 후 채운다)
