---
title: 서버 문서 동기화 결함 수정 — P4c Observer A 증분 직렬화
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P4c Observer A 증분 직렬화 — 구현 계획

## 문제

웹 편집기가 fragment의 문단 하나를 고쳐도 Observer A는 fragment 전체를 JSON으로 만들고 두 번 직렬화하며,
블록 정렬 splice를 계산하려고 문서 전체를 두 번 mdast로 파싱한다. 5,000줄에서 드레인 1.0초.

## 설계 — Observer A의 빠른 경로

드레인 동안 클라이언트가 바꾼 최상위 노드를 모은다(observeDeep 이벤트의 대상 → 최상위 조상). 아래 조건을 모두
만족하면 빠른 경로, 하나라도 어기면 기존 경로다.

1. 최상위 구조가 그대로다(fragment 자체에 대한 삽입·삭제 없음). 바뀐 최상위 노드가 1~4개다.
2. `Y.Text`가 Observer B가 fragment를 파생한 뒤 바뀌지 않았다(마지막 파생 텍스트와 같음).
3. 증분 파서 캐시가 그 본문을 들고 있고, 블록 수가 fragment 자식 수와 같다.
4. 바뀐 노드에 컴포넌트·표·원시 MDX(`jsxComponent`, `jsxInline`, `rawMdxFallback`, `table`)가 없다. 이들은
   freshness 재생성과 producer guard가 필요하다.

빠른 경로: 바뀐 노드를 한 노드짜리 문서로 직렬화하고, 증분 파서 캐시의 그 블록 원문 범위에 끼운 새 본문을 만든다.
새 본문을 증분 파서로 다시 파싱해 바뀐 노드가 클라이언트의 노드와 같게 나오는지 확인한다(JSON 비교). 같으면
블록 안의 공통 앞·뒤를 뺀 가운데만 `Y.Text`에 쓰고(코드 포인트 정렬), 기준값과 파생 표시를 갱신한다. 다르면 파서
캐시를 비우고 기존 경로로 간다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/incremental-block-parse.ts` | 캐시한 본문과 블록 범위를 읽는 접근자 |
| `packages/server/src/server-observers.ts` | 바뀐 최상위 노드 수집, 마지막 파생 텍스트, Observer A 빠른 경로 |
| `packages/server/src/observer-a-fast-path.test.ts` (새) | 웹식 편집(ProseMirror 트랜잭션 → `updateYFragment`)을 무작위로 넣고, 드레인 뒤 parse(`Y.Text`)가 fragment와 같으며 바뀌지 않은 블록의 바이트가 그대로인지 확인. 컴포넌트·구조 변경은 기존 경로로 가는지 확인 |

## 작업 순서

1. 접근자 + 수집 + 빠른 경로. 확인: 새 테스트.
2. 기존 관찰자·bridge·저장 테스트 전부. 확인: 통과. 바이트 단위 기대값이 바뀌는 테스트가 있으면 원인을 적고 판단한다.
3. 재측정: `bench-bridge-drain.ts`(fragment), dev 서버 `server-load.ts --mode fragment`.

## 가장 위험한 단계

1번. 기존 경로의 안전장치(중복 게이트, Path B 병합)를 건너뛴다. 조건 2(텍스트가 파생 이후 그대로)가 동시 편집
경합을 대부분 막고, 조건 4가 컴포넌트 관련 장치가 필요한 경우를 기존 경로로 보낸다. 재파싱 비교가 직렬화 오류를
막는다. 되돌리기는 빠른 경로 호출 한 줄을 지우는 것이다.

## 검증

```
bun run test:file -- packages/server/src/observer-a-fast-path.test.ts
bun run test:file -- packages/server/src/server-observers.test.ts   # 외 관찰자·bridge·persistence 전체
bun packages/server/scripts/bench-bridge-drain.ts
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode fragment --seconds 30
```
