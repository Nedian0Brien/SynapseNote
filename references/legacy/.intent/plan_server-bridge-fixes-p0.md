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

## 결과 (2026-09-28, main 기준 코드, 로컬 dev 서버)

**드레인 벤치마크** (`bench-bridge-drain.ts`, 10회, 가장 바깥 호출만 계산)

| 줄 수 | 편집 | 드레인 p50 / p95 | 파싱 p50 (호출) | 직렬화 p50 (호출) |
|---|---|---|---|---|
| 38 | `Y.Text` | 21.7 / 33.6ms | 12.7ms (1) | 5.3ms (1) |
| 38 | fragment | 82.5 / 146.1ms | 44.9ms (2) | 24.7ms (2) |
| 1,000 | `Y.Text` | 319.5 / 780.6ms | 206.4ms (1) | 101.3ms (1) |
| 1,000 | fragment | 758.5 / 982.0ms | 451.1ms (2) | 214.5ms (2) |
| 5,000 | `Y.Text` | 2,189 / 4,558ms | 1,394ms (1) | 616ms (1) |
| 5,000 | fragment | 3,643 / 6,421ms | 2,324ms (2) | 934ms (2) |

드레인 시간의 약 90%가 문서 전체 파싱·직렬화다. fragment 경로의 줄 수 × 바이트 중복 검사는
주원인이 아니었다(spec의 가설 수정). 편집 묶기만으로는 목표(p95 100ms)에 닿지 않는다.

**서버 부하** (`server-load.ts`, 5,000줄, 초당 10회 30초): `Y.Text` 296회 중 50회 반영(p50 16.1초),
fragment 289회 중 12회 반영(p50 26.3초). 두 경우 모두 `GET /api/config` 30초간 응답 없음.

**삽입 전용 soak** (2분, fragment 작성자 단독, 38줄 문서)

| 작성자 | 유실 | 반영 지연 p95 |
|---|---|---|
| 합성(`Y.XmlText.insert` 직접) | 21 / 99 | 1,510ms |
| ProseMirror 경로(`insertText` → `updateYFragment`) | 0 / 99 | 342ms |

웹 편집기와 같은 경로로는 이 조건에서 유실이 없었다. 합성 작성자는 `Y.XmlText.insert`가 앞
글자의 속성(`escapeMark` 포함)을 물려받게 해 결함 3을 일으키고, 그 뒤 블록 구조가 바뀌며 노드가
교체되는 것으로 보인다. 그래서 P2 뒤에 합성 작성자로 다시 재고, P3는 그 결과와 큰 문서 조건을
보고 필요 여부를 정한다.

**서로게이트 분할 실험** (Yjs origin → Yjs peer vs yrs 0.28): 네 경우 모두 yrs가 달랐고, Yjs 규칙을
넣은 yrs는 모두 같았다(intent 답이 나온 질문 2).
