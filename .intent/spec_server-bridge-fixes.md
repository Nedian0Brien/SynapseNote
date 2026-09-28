---
title: 서버 문서 동기화 결함 수정
slug: server-bridge-fixes
stage: spec
status: accepted
intent: .intent/intent_server-bridge-fixes.md
date: 2026-09-28
---

# 서버 문서 동기화 결함 수정 — 명세

## 원인 (P0 조사로 확정)

- **결함 4, 서로게이트.** 서버 스스로도 쌍을 쪼갠다. `applyFastDiff`
  (`core/src/bridge/apply-diff.ts:40-91`)와 `apply-by-prefix-suffix.ts`가 UTF-16 단위로
  diff를 내서, 😀→😁처럼 앞쪽 절반이 같은 교체를 뒤쪽 절반만 지우고 넣는 op로 보낸다.
  agent-patch는 `find`/`replace`의 짝 없는 서로게이트를 거르지 않는다. 짝 없는
  서로게이트는 디스크에 U+FFFD로 저장되는데 `reconciledBase`는 원래 문자열을 들고 있어,
  이후 모든 비교가 어긋난다(에이전트 쓰기 폐기, 매 저장 재기록).
- **결함 3, 이스케이프 누적.** 순수 `serialize∘parse`는 멱등이다(약 60개 입력 확인).
  누적은 `escapeMark`가 번지는 데서 온다. Yjs `insert`는 속성 없이 넣으면 앞 글자의 속성을
  물려받고, ProseMirror에서도 `inclusive:false`는 표시 구간의 끝에서만 번짐을 막아서 연속된
  이스케이프 글자 사이에 입력하면 표시가 붙는다. 파서는 ASCII 문장부호에만 `escapeMark`를
  붙이는데(`position-slice.ts:75`) 직렬화는 표시가 붙은 모든 글자 앞에 `\`를 쓴다
  (`index.ts:1586-1599`, `to-markdown-handlers.ts:72`). 문장부호가 아닌 글자 앞의 `\`는
  다시 파싱하면 글자 그대로의 역슬래시가 되어 왕복마다 늘어난다.
- **결함 1, 처리량.** Hocuspocus는 메시지마다 transaction을 따로 열고, 관찰자는
  `afterAllTransactions`에서 매번 문서 전체를 처리한다(`server-observers.ts:2041-2105`).
  Observer B는 전체 파싱 + 빈 mapping의 `updateYFragment` 전체 비교 + 전체 직렬화 +
  normalize 약 4회. Observer A는 직렬화 2회, 파싱 2~3회, 그리고 Gate 1 앞의
  `overMultipliedBridgeBodyLines`(`:559-577`)가 줄 수 × 바이트 수만큼 `indexOf`를 돈다.
  저장(`persistence.ts`)도 전체 직렬화와 invariant 검사를 반복한다.
- **결함 2, 유실.** 서버가 fragment에 쓰는 경로는 모두 빈 mapping의 `updateYFragment`라,
  노드 종류가 다르거나 개수가 달라지면 요소를 지우고 새로 만든다. 그 안에 들어온 동시
  입력은 사라지고, Observer A가 그 결과를 `Y.Text`로 옮겨 다른 클라이언트가 이미 본 입력까지
  지운다. 저장 시 invariant 실패(`fragmentLen > ytextLen`)는 `reconcileFragmentNow`로
  fragment를 `Y.Text`에서 다시 만들어, A가 아직 옮기지 않은 fragment 전용 내용을 지운다.
  드레인이 수 초 걸리면 이 "동시" 구간도 수 초로 넓어진다.

## 요구사항

- [ ] R1 서로게이트: 어떤 origin의 transaction 뒤에도 모든 문서의 `Y.Text('source')`에
      짝 없는 서로게이트가 남지 않는다. 쪼개진 쌍은 서버가 반쪽을 지우는 보정 편집으로
      정리하고, 그 편집이 모든 클라이언트에 간다.
- [ ] R2 서버가 만드는 diff(`applyFastDiff`, prefix/suffix 교체)는 쌍을 쪼개지 않는다.
- [ ] R3 agent-patch·agent-write는 `find`/`replace`/`content`에 짝 없는 서로게이트가 있으면
      400으로 거절한다.
- [ ] R4 이스케이프: 직렬화는 ASCII 문장부호에만 `\`를 붙인다. `escapeMark`가 붙은 다른
      글자는 그대로 쓴다. 이스케이프 글자 옆 삽입을 반복해도 결과 길이는 넣은 글자 수만큼만 는다.
- [ ] R5 처리량: 5,000줄 문서에 초당 10회 편집 30초(`Y.Text`, fragment 각각)에서 전 편집
      반영, 반영 지연 p95 ≤ 100ms, `GET /api/config` p95 ≤ 100ms(로컬 서버 처리 시간).
- [ ] R6 유실: 삽입 전용 soak에서 사라진 마커 0 — fragment 합성 작성자 단독, 세 작성자 전체,
      그리고 y-prosemirror 알고리즘(ProseMirror 트랜잭션 → `updateYFragment` + mapping)을
      쓰는 작성자.
- [ ] R7 크기 안정: 세 작성자 10분 soak 뒤 해시 30초 안 일치, 문서 크기 ≤ 초기 + 삽입량.
- [ ] R8 결함마다 재현 테스트가 있고 `server-test-manifest.ts`에 등록된다. 바꾼 파일을
      덮는 기존 테스트가 통과한다.

## 설계

단계 순서를 intent 표에서 바꾼다: **P0 → P1 → P2 → P4 → P3.** 결함 2의 재현율은 드레인
시간에 달려 있어서, 처리량을 먼저 고쳐야 유실 수정의 효과를 따로 잴 수 있다.

- **P0 재현 테스트.** 네 결함 각각을 서버·core 테스트로 먼저 실패시킨다. 수치 측정은
  스파이크의 `soak.ts`·`server-load.ts`를 `.worktree/native-editor-spike`에서 이 브랜치의
  dev 서버에 대고 돌린다. y-prosemirror 알고리즘 작성자는 soak에 옵션으로 추가한다
  (별도 브랜치의 스크립트이므로 그 브랜치에서 커밋).
- **P1 서로게이트.** 새 서버 확장이 모든 문서(시스템·config 문서 포함)에
  `afterAllTransactions` 리스너를 달고, 그 드레인에서 `Y.Text('source')`가 바뀐 경우에만
  바뀐 범위 주변을 검사해 반쪽을 지운다. origin은 새 비-paired origin
  (`surrogate-repair`, `skipStoreHooks:false`)이라 Observer B가 fragment를 다시 맞추고 저장이
  일어난다. `applyFastDiff`와 prefix/suffix 교체는 경계를 코드 포인트 단위로 맞춘다.
  agent API 스키마에 well-formed 검사를 넣는다. 검출 정규식은 `api-extension.ts:16222`의
  것을 공용 유틸로 옮겨 재사용한다.
- **P2 이스케이프.** core 직렬화의 `escapeMark` 처리를 파서 규칙과 맞춘다(ASCII 문장부호만
  `\`). 테스트는 고정 기대 문자열과 멱등성(두 번 적용 = 한 번 적용)으로 쓴다 — 입력과 같음을
  단언하는 테스트는 lint(`no-roundtrip-identity-oracle`)가 막는다.
- **P4 처리량.** 세 갈래를 측정하며 순서대로 적용한다. (1) 관찰자 작업을 메시지마다가 아니라
  문서마다 한 번씩 묶어 돈다(짧은 예약 실행으로 여러 transaction을 한 드레인에). (2)
  Observer A의 `overMultipliedBridgeBodyLines`를 바뀐 블록으로 한정한다. (3) Observer B를
  바뀐 블록만 다시 파싱해 해당 fragment 구간만 갱신한다. 각 갈래 뒤에 `server-load.ts`로
  재측정하고, 목표에 도달하면 멈춘다.
- **P3 유실.** (1) 저장 시 invariant 실패에서 fragment 전용 내용이 있으면 `Y.Text`로 먼저
  옮기고(A 실행) 그다음 판정한다. (2) `updateYFragment`에 이전 드레인의 mapping을 넘겨
  같은 노드를 제자리 갱신하게 한다. (3) A가 편집을 옮기지 않고 나가는 출구(in-sync,
  duplication, freshness)에서 fragment 전용 내용을 버리지 않는다. 각 수정 뒤 soak으로 잰다.

## 버린 대안

- **서로게이트 update 거부.** Hocuspocus는 update를 훅보다 먼저 모든 연결에 보낸다
  (`Document.handleUpdate`). 거부가 성립하지 않는다.
- **U+FFFD로 치환.** 두 구현 모두 표현할 수 있지만 글자 하나가 사라지는 대신 이상한 글자가
  남는다. 반쪽을 지우는 쪽이 yrs 결과와도 같다.
- **관찰자 작업을 워커 스레드로.** Y.Doc은 스레드 사이에 공유되지 않아 문서 전체를 복사해야
  하고, 결과를 다시 main에서 적용해야 한다.
- **`escapeMark` 폐기.** 원문 바이트 보존(`\*`를 유지)에 필요하다.

## 함정

- 관찰자 테스트 파일 이름이 `server-observer…`면 manifest에서 `process` 범주로 분류된다.
- `normalizeBridge`가 `\<문장부호>`를 지우고 비교해 이스케이프 차이를 invariant에서 숨긴다.
- 관찰자 작업을 묶으면 fragment와 `Y.Text`가 잠시 다른 상태가 늘어난다. 저장·에이전트
  쓰기·파일 감시가 그 사이에 들어와도 먼저 관찰자를 비우고 진행해야 한다.
- 파싱 예산(500ms)을 넘으면 `parseWithFallback`이 문서 뒷부분을 한 문단으로 뭉치거나 잘라낸다.
  큰 문서 측정에서 `mdx-whole-doc-fallback` 로그를 함께 본다.
- dev 서버는 시작할 때 `packages/app/src/locales`를 다시 컴파일한다. 커밋 전에 되돌린다.
- `codex/server-remote-access`는 `api-extension.ts`를 크게 바꿨다. R3 수정은 충돌을 줄이도록
  스키마(core)에 둔다.

## 완료 기준

```
bun run test:file -- <각 단계의 새 테스트 파일>
bun run --filter @nedian0brien/synapsenote-server test:manifest
# 스파이크 워크트리에서, 이 브랜치의 dev 서버(:5181)에 대고:
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode text
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode fragment
bun native/editor-spike/scripts/soak.ts --port 5181 --minutes 2 --insert-only --no-app --no-patch --content-dir <dir>
bun native/editor-spike/scripts/soak.ts --port 5181 --minutes 10 --content-dir <dir> --udid <sim>
```
