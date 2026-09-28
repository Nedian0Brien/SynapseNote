---
title: 서버 문서 동기화 결함 수정 — P4a Observer B 증분 파싱
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P4a Observer B 증분 파싱 — 구현 계획

P4는 세 부분으로 나눈다. P4a(`Y.Text` 편집 → fragment, 네이티브 앱과 에이전트 경로), P4b(저장 시점의
전체 직렬화·invariant), P4c(fragment 편집 → `Y.Text`, 웹 편집기 경로). P4a를 재 본 뒤 P4b·P4c 계획을 쓴다.

## 근거 (P0 벤치마크 + 탐색 측정, 5,000줄)

전체 파싱 386ms, 경계 포함 3블록 파싱 1.0ms, 캐시 노드로 문서 조립 0.01ms, 이전 mapping을 재사용한
`updateYFragment` 2.2ms(새 mapping 9.5ms), 전체 직렬화 148ms. 최상위 mdast 블록과 최상위 PM 노드는
프로모터 적용 뒤 1:1로 대응한다(샘플 8:8).

## 설계

- **`IncrementalBlockParser`** (새 모듈, 순수 함수형). 마지막 전체 파싱의 본문, 최상위 블록별 원문 범위,
  PM 노드를 캐시한다. 새 본문이 오면 공통 앞·뒤 길이로 바뀐 구간을 찾고, 그 구간에 걸친 블록 + 앞뒤
  경계 블록 하나씩을 다시 파싱한다. 결과를 쓰는 조건:
  1. 다시 파싱한 mdast 블록 수와 PM 노드 수가 같다(1:1 대응 유지).
  2. 앞·뒤 경계 블록의 PM JSON과 원문 길이가 캐시와 같다(변화가 안쪽에 갇힘). 다르면 그쪽으로 한 블록
     넓혀 최대 4번 다시 시도한다.
  3. 문서 전체에 영향을 주는 구문이 없다: 바뀐 원문(옛·새)에 링크 참조 정의·각주 정의 줄이 없고,
     문서에 정의가 있으면 바뀐 원문에 `[`가 없다.
  하나라도 어기면 `null`을 돌려주고 호출자는 전체 파싱한다. 전체 파싱 뒤 1:1 대응이 깨지는 문서는
  증분을 쓰지 않는다.
- **Observer B**: `parseWithFallback(body)` 대신 증분 결과를 쓰고(없으면 전체 파싱 + 캐시 갱신),
  `updateYFragment`의 mapping을 드레인 사이에 유지한다. 관찰자가 아닌 origin이 fragment를 바꾸면
  mapping을 비운다. 증분으로 처리한 드레인에서는 전체 직렬화(invariant 검사, canonical witness)를
  미룬다: canonical witness는 "미정"으로 두고 Observer A가 필요할 때 계산한다.
- **안전망**: 저장 경로의 invariant 검사(P4b에서 조정)와 별개로, 증분 파서를 쓴 문서는 저장 시
  한 번 전체 파싱 결과와 fragment를 비교해 다르면 전체 경로로 다시 맞추고 로그를 남긴다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/incremental-block-parse.ts` (새) | `IncrementalBlockParser` |
| `packages/server/src/incremental-block-parse.test.ts` (새) | 차등 테스트: 코퍼스 문서에 무작위 편집, 증분 결과가 있을 때마다 전체 파싱 JSON과 같음. 폴백 비율 출력 |
| `packages/server/src/server-observers.ts` | Observer B가 증분 결과와 유지되는 mapping을 쓴다. 증분 드레인의 직렬화 지연 |
| `packages/server/src/persistence.ts` | 증분을 쓴 문서의 저장 시 전체 비교 |
| `packages/server/scripts/bench-bridge-drain.ts` | 변경 없음(재측정에 쓴다) |

## 작업 순서

1. `IncrementalBlockParser` + 차등 테스트. 확인: 차등 테스트 통과, 폴백 비율 기록.
2. Observer B 연결 + mapping 유지. 확인: `server-observers*.test.ts`, `bridge-*.test.ts`, `persistence*.test.ts` 통과.
3. (P4b로 옮김 — 저장 경로를 함께 바꾼다) 저장 시 전체 비교.
4. 재측정: `bench-bridge-drain.ts`(text), dev 서버 `server-load.ts --mode text`.

## 가장 위험한 단계

2번. 캐시와 실제 fragment가 어긋나면 잘못된 fragment가 웹 클라이언트에 보이고, Observer A가 그것을
`Y.Text`로 옮길 수 있다. 대응: 조건을 하나라도 어기면 전체 파싱으로 가고, 차등 테스트로 폴백 판단을
검증하며, 저장 시 비교로 어긋남을 되돌린다. 되돌리기는 Observer B의 증분 호출을 끄는 한 줄이다.

## 검증

```
bun run test:file -- packages/server/src/incremental-block-parse.test.ts
bun run test:file -- packages/server/src/server-observers.test.ts   # 외 관찰자·bridge·persistence 테스트
bun packages/server/scripts/bench-bridge-drain.ts --lines 38,1000,5000
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode text
```

## 결과 (2026-09-28)

- 차등 테스트 10개 통과. 무작위 편집에서 증분 결과는 모두 전체 파싱과 같았다. 증분 비율: 스파이크
  29/29, GFM 22/22, perf 100 27/28, 회귀 15/15. MDX 문서는 편집이 MDX 문법을 깨면 문서가 다시
  정상이 될 때까지 전체 경로를 탄다(`no-cache`).
- 처음 구현에서 차등 테스트가 두 가지를 잡았다: 문서 경계 기록(`sourceDocBoundary`)과 MDX 컴포넌트
  속성의 원문 위치. 둘 다 전체 파싱과 같게 맞췄다.
- 관찰자·bridge·저장 테스트 30개 파일 통과(`paired-write-enforcement`의 실패는 P1 누락이라 따로 고침).
- `bench-bridge-drain.ts` text 드레인 p50/p95: 38줄 3.9/6.3ms, 1,000줄 3.1/5.7ms, 5,000줄 6.1/14.7ms
  (P0: 21.7/33.6, 319.5/780.6, 2,189/4,558ms).
- dev 서버 `server-load.ts --mode text`(5,000줄, 초당 10회 30초): 292/292 반영, 반영 지연 p50 1ms,
  p95 367ms, 최대 1,010ms. `GET /api/config` p95 305ms. 목표(100ms) 미달 — 몇 초마다 수백 ms씩 멈추는
  형태라 저장 경로(P4b)를 본다.
