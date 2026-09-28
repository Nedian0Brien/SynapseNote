---
title: 서버 문서 동기화 결함 수정
slug: server-bridge-fixes
stage: spec
status: accepted
intent: .intent/intent_server-bridge-fixes.md
date: 2026-09-28
---

# 서버 문서 동기화 결함 수정 — 명세

## 원인 (가설, P0에서 재현으로 확정)

결함 3은 core에서 직접 실험해 재현했다. 나머지는 코드를 읽고 세운 가설이다.

- **결함 4, 서로게이트.** (실험으로 확인) Yjs는 쌍 중간에서 문자열 항목을 나눌 때 두 반쪽을
  U+FFFD로 바꾸고, yrs 0.28은 같은 op를 다르게 적용한다(`block.rs` `ItemContent::splice`,
  Yjs 규칙이 주석으로만 있음). 이 규칙을 넣은 yrs는 삭제·사이 삽입·반쪽 교체 네 경우 모두 Yjs와
  같은 텍스트를 냈다. 반쪽을 삽입하는 op는 op를 만든 문서에만 반쪽이 남고, 인코딩된 update를
  받는 쪽은 모두 U+FFFD가 된다. 그리고 서버 스스로도 쌍을 쪼갠다. `applyFastDiff`
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
- **결함 2, 유실.** (철회) 합성 작성자가 `Y.XmlText.toString()`(서식 태그 포함) 위치로 삽입해
  자기 마커를 쪼갠 측정 결함이었다. 위치를 고친 작성자와 ProseMirror 경로 작성자 모두 유실 0.

## 요구사항

- [ ] R1 서로게이트: (a) 패치한 yrs가 네 가지 분할 경우(앞·뒤 반쪽 삭제, 사이 삽입, 반쪽
      교체)에서 Yjs와 같은 텍스트를 낸다(`yrs-ffi` 테스트). (b) 어떤 origin의 transaction
      뒤에도 서버 문서의 `Y.Text('source')`에 짝 없는 서로게이트가 남지 않는다. 남은 반쪽은
      서버가 U+FFFD로 바꾸고, 그 편집이 모든 클라이언트에 간다.
- [ ] R2 서버가 만드는 diff(`applyFastDiff`, prefix/suffix 교체)는 쌍을 쪼개지 않는다.
- [ ] R3 agent-patch·agent-write는 `find`/`replace`/`content`에 짝 없는 서로게이트가 있으면
      400으로 거절한다.
- [ ] R4 이스케이프: 직렬화는 ASCII 문장부호에만 `\`를 붙인다. `escapeMark`가 붙은 다른
      글자는 그대로 쓴다. 편집 뒤 새 편집 없이 `serialize∘parse`를 한 번 더 돌려도 결과가
      바뀌지 않고, 이스케이프 글자 옆 삽입을 반복해도 삽입 글자당 늘어나는 바이트가 2 이하다.
- [ ] R5 처리량: 5,000줄 문서에 초당 10회 편집 30초(`Y.Text`, fragment 각각)에서 전 편집
      반영, 반영 지연 p95 ≤ 100ms, `GET /api/config` p95 ≤ 100ms(로컬 서버 처리 시간).
- [ ] R6 유실(회귀 검증): 삽입 전용 soak에서 사라진 마커 0 — 합성 작성자 단독, ProseMirror 경로
      작성자 단독, 세 작성자 전체. 38줄 문서와 5,000줄 문서 모두.
- [ ] R7 크기 안정: 세 작성자 10분 soak 뒤 해시 30초 안 일치, 문서 크기 ≤ 초기 크기 +
      삽입 글자 수 × 2바이트(삽입한 `*` 등이 `\*`로 저장되는 정상 이스케이프를 허용).
- [ ] R8 결함마다 재현 테스트가 있고 `server-test-manifest.ts`에 등록된다. 바꾼 파일을
      덮는 기존 테스트가 통과한다.

## 설계

단계 순서를 intent 표에서 바꾼다: **P0 → P1 → P2 → P4 → P3.** P3는 유실 회귀 검증이라
처리량을 고친 뒤 큰 문서에서 함께 잰다.

- **P0 재현 테스트.** 네 결함 각각을 서버·core 테스트로 먼저 실패시킨다. 수치 측정은
  스파이크의 `soak.ts`·`server-load.ts`를 `.worktree/native-editor-spike`에서 이 브랜치의
  dev 서버에 대고 돌린다. y-prosemirror 알고리즘 작성자는 soak에 옵션으로 추가한다
  (별도 브랜치의 스크립트이므로 그 브랜치에서 커밋).
- **P1 서로게이트.** (1) 스파이크 브랜치의 `native/editor-spike/yrs-patches/`에 yrs 패치를
  두고 `build-xcframework.sh`가 crates.io 소스를 받아 적용한 뒤 `[patch.crates-io]`로 쓴다.
  (2) 새 서버 확장이 모든 문서(시스템·config 문서 포함)에 `afterAllTransactions` 리스너를
  달고, 그 드레인에서 `Y.Text('source')`가 바뀐 경우에만 바뀐 범위 주변을 검사해 짝 없는
  반쪽을 U+FFFD로 바꾼다. origin은 새 비-paired origin
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
- **P3 유실 검증.** P4 뒤에 R6의 조합을 38줄·5,000줄 문서로 돌린다. 유실이 나오면 그때 원인을
  조사하고 수정 방법을 이 spec에 추가한다.

## 버린 대안

- **서버가 반쪽을 지우는 보정.** 처음 채택했던 안. Yjs는 분할 시 이미 U+FFFD로 바꾸므로 지울
  반쪽이 거의 없고, yrs는 내부 상태부터 갈라져 서버 보정으로 되돌릴 수 없다(구간 재작성은
  네 경우 중 한 경우만 수렴).
- **서로게이트 update 거부.** Hocuspocus는 update를 훅보다 먼저 모든 연결에 보낸다
  (`Document.handleUpdate`). 거부가 성립하지 않는다.
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
