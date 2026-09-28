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

드레인 동안 클라이언트가 바꾼 최상위 노드를 모은다(observeDeep 이벤트의 대상 → 최상위 조상, paired write는 제외). 아래
조건을 모두 만족하면 빠른 경로, 하나라도 어기면 기존 경로다.

1. 최상위 구조가 그대로다(fragment 자체에 대한 삽입·삭제 없음). 바뀐 최상위 노드가 1~4개다.
2. `Y.Text`가 마지막 조정(Observer A·B 정산, paired write) 이후 바뀌지 않았다 — raw witness(`lastSyncedYTextBytes`)와 같다.
   또는 Observer B가 그 witness와 파싱 동치로 확인한 텍스트(B의 normalize 조기 종료가 witness를 일부러 갱신하지
   않은 경우)이고, witness와 다른 구간이 편집 블록의 원문 범위에 닿지 않는다(P3에서 추가).
3. 바뀐 노드에 컴포넌트·표·원시 MDX(`jsxComponent`, `jsxInline`, `rawMdxFallback`, `table`)가 없다. 이들은
   freshness 재생성과 producer guard가 필요하다.
4. 증분 파서 캐시가 현재 본문을 들고 있다. 없으면 이 자리에서 채운다(`update` → 실패 시 `parseFull`). 캐시가
   이전 본문을 들고 있으면 대개 증분으로 끝나고, 캐시가 없는 첫 편집만 전체 파싱을 치른다.
5. 블록 수가 fragment 자식 수와 같고, 각 편집 블록의 가장 가까운 바뀌지 않은 이웃이 양쪽 모두 캐시 블록과 같다
   (mdast `position`, 원문 표기 표시 `escapeMark`·`sourceLiteral`, 표시가 같은 인접 텍스트 분할을 무시한 비교). 이웃이 다르면 그 위치에서 fragment 자식과 원문 블록의 대응을 믿을 수 없다.
6. 편집 블록의 새 마크다운이 옛 원문보다 어떤 줄을 더 많이 담지 않는다(중복 게이트 사전 필터를 편집 블록에만
   적용). 걸리면 경쟁 중복인지 붙여넣기인지 판정할 수 있는 기존 경로로 보낸다.

빠른 경로: 바뀐 노드를 한 노드짜리 문서로 직렬화하고, 그 블록 원문 범위에 끼운 새 본문을 만든다. 새 본문을 증분
파서로 다시 파싱해 바뀐 노드가 클라이언트의 노드와 같게 나오는지 확인한다(JSON 비교. 원문 표기 표시만 다르면
보이는 내용이 같으므로 쓰되, 파생 표시는 남기지 않는다 — P3에서 추가). 같으면 공통 앞·뒤를 뺀
가운데만 `Y.Text`에 쓰고(코드 포인트 정렬) raw witness를 갱신한다. 드레인 시작 때 fragment가 그 텍스트의 파싱
결과로 표시돼 있었다면 새 텍스트로 파생 표시와 canonical witness를 갱신하고, 아니면 표시 없이 둔다(저장 경로가
평소대로 검사한다).

증분 파서는 core의 `parseWithBlockRanges`(새 API)로 PM JSON과 최상위 블록 원문 범위를 한 번의 파싱에서 받는다.
이전에는 JSON 파싱과 mdast 파싱을 따로 했다. BOM이 있거나 `dedentBlockJsxClose`가 원문을 바꾼 문서는 범위가
원문과 맞지 않아 증분을 쓰지 않는다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/markdown/pipeline.ts`, `index.ts` | `parseMdWithBlockRanges`, `MarkdownManager.parseWithBlockRanges` |
| `packages/server/src/incremental-block-parse.ts` | 단일 파싱 의존성(`parseWithRanges`), 캐시 본문·범위·JSON 접근자, `sameIgnoringPositions` |
| `packages/server/src/server-observers.ts` | 바뀐 최상위 노드 수집, 드레인 시작 파생 텍스트, Observer A 빠른 경로 |
| `packages/server/src/observer-a-fast-path.test.ts` (새) | 웹식 편집(ProseMirror 트랜잭션 → `updateYFragment`) 12회가 모두 빠른 경로이고 parse(`Y.Text`)가 fragment와 같으며 바뀐 범위가 한 블록 안인지. 파생 표시 유지, 컴포넌트·문단 분할·같은 드레인의 `Y.Text` 쓰기·파싱과 다른 이웃은 기존 경로 |
| `packages/server/src/fragment-derivation.test.ts` | 표시가 지워지는 경우를 최상위 블록 삽입(기존 경로)으로 바꿈 — 문단 편집은 이제 빠른 경로가 표시를 유지한다 |
| `packages/server/scripts/bench-bridge-drain.ts` | 첫 드레인 시간, Observer A 경로 횟수 출력 |

## 작업 순서

1. core API + 증분 파서 단일 파싱. 확인: 차등 테스트.
2. 수집 + 빠른 경로. 확인: 새 테스트.
3. 기존 관찰자·bridge·저장 테스트 전부. 확인: 통과. 바이트 단위 기대값이 바뀌는 테스트가 있으면 원인을 적고 판단한다.
4. 재측정: `bench-bridge-drain.ts`(fragment), dev 서버 `server-load.ts --mode fragment`.

## 가장 위험한 단계

2번. 기존 경로의 안전장치(중복 게이트, Path B 병합)를 건너뛴다. 조건 2가 동시 편집 경합을 막고, 조건 3이 컴포넌트
관련 장치가 필요한 경우를, 조건 6이 경쟁 중복 후보를 기존 경로로 보낸다. 조건 5와 재파싱 비교가 잘못된 범위에
쓰는 것과 직렬화 오류를 막는다. 되돌리기는 빠른 경로 호출 한 줄을 지우는 것이다.

## 검증

```
bun run test:file -- packages/server/src/observer-a-fast-path.test.ts
bun run test:file -- packages/server/src/server-observers.test.ts   # 외 관찰자·bridge·persistence 전체
bun packages/server/scripts/bench-bridge-drain.ts
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode fragment --seconds 30
```

## 결과 (2026-09-28)

- 새 테스트 6개, 차등 테스트 10개 통과. 관찰자·bridge·저장·증분·서로게이트·agent-patch 테스트 33개 파일을 파일별로
  돌려 모두 통과.
- 처음 구현에서 두 테스트가 걸렸다. `server-observers-duplication-gate`의 목록 안 제목 중복이 빠른 경로로 `Y.Text`에
  들어갔다 → 조건 6 추가. `fragment-derivation`의 "클라이언트 편집이 표시를 지운다"는 문단 편집이 이제 표시를
  올바르게 유지해서 실패했다 → 기존 경로를 타는 편집으로 바꿈.
- 한 프로세스에 33개 파일을 함께 돌리면 `surrogate-normalizer` 2개가 실패한다. `api-agent-patch.test.ts`와 같이
  돌릴 때만 재현되고, 이번 변경 전 커밋의 두 파일(P1)이 원인이다. CI는 두 파일을 다른 분류(`process`, `unit`)로
  나눠 돌린다. 별도 작업으로 뺐다.
- `bench-bridge-drain.ts` fragment 드레인 p50/p95: 38줄 2.5/5.7ms, 1,000줄 2.1/2.9ms, 5,000줄 2.9/4.8ms(P0 5,000줄
  약 1.0초). 23회 모두 빠른 경로. 캐시가 없는 첫 드레인은 5,000줄 345ms(전체 파싱 1회).
- dev 서버 `server-load.ts --mode fragment`(5,000줄, 초당 10회 30초) 세 번: 294/293/293 전부 반영, 반영 지연 p95
  18 / 20 / 18ms, 최대 111 / 115 / 107ms, `GET /api/config` p95 14 / 13 / 14ms. 최대값은 10초·20초의 저장이다.
  load 스크립트가 토큰을 삽입 문자열 하나에서만 찾아 빠른 경로의 앞·뒤 공통부 제거 쓰기를 놓쳤다(디스크에는 875개
  전부 있었다) → 전체 텍스트에서 찾도록 고침(스파이크 브랜치).
- 남은 멈춤: 로드·파일 감시·에이전트의 paired write는 파생 표시를 남기지 않아, 그 뒤 웹 편집만 이어지는 문서는
  저장마다 전체 검사(약 0.1초)를 돈다. paired write 경로에 표시를 넣으면 없앨 수 있으나 이번 범위 밖이다.
