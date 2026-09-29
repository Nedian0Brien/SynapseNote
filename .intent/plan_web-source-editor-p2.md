---
title: 웹 편집기가 원문을 직접 편집한다 — P2 편집기 뼈대
slug: web-source-editor
stage: plan
status: accepted
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P2 편집기 뼈대 — 구현 계획

P1의 편집 모델은 동작마다 문서 전체를 파싱한다(5,000줄 약 1.4초). 16ms 목표(spec R9)를 맞추려면 파싱을 편집이 닿은
블록으로 줄여야 하므로 P2를 둘로 나눈다.

## P2a core: 증분 레이아웃과 창 편집

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/editing-model/incremental-layout.ts` (새) | `IncrementalLayout`. 최상위 블록마다 원문 범위와 레이아웃을 캐시한다. 새 원문이 오면 공통 앞·뒤로 바뀐 구간을 찾고, 거기 걸친 블록과 앞뒤 경계 블록 하나씩을 다시 파싱한다. 경계 블록의 종류·길이·레이아웃이 그대로면 쓰고, 아니면 넓히고(최대 4번), 그래도 안 되면 전체 파싱한다. frontmatter가 바뀌거나 링크 참조·각주 정의가 걸리면 전체 파싱한다(서버의 증분 블록 파서와 같은 판단) |
| `packages/core/src/editing-model/window.ts` (새) | `applyActionsInWindow(source, blocks, state, actions)`. 커서(선택)가 걸친 블록과 앞뒤 블록 하나씩을 잘라 `applyActions`를 돌리고, 결과를 원문에 다시 끼운다. 창 안에서 블록 수·경계가 바뀌면(Enter, 합치기) 창을 한 블록씩 넓혀 다시 판단한다 |
| 테스트 | 차등: 무작위 문서·무작위 편집마다 `IncrementalLayout` 결과가 `computeLayout`과 같다. 창 편집: fixture 57개를 긴 문서 가운데에 넣어 돌려 같은 결과. 벤치: 5,000줄 문서에서 글자 하나 입력의 레이아웃 갱신 + 창 편집 시간 |

## P2b app: 새 편집 모드

| 파일 | 무엇을 |
|---|---|
| `packages/app/src/editor/use-editor-mode.ts`, `components/EditorModeToggle.tsx` | 모드에 `live` 추가(기본은 그대로 `wysiwyg`) |
| `packages/app/src/components/EditorActivityPool.tsx`, `editor/SourceEditor.tsx` | `live`에서도 `SourceEditor`를 띄우고 `variant`로 확장을 바꾼다(Compartment. 캐시된 뷰를 다시 쓴다) |
| `packages/app/src/editor/live/` (새) | 레이아웃 StateField(IncrementalLayout), 장식(숨김 `Decoration.replace`, 서식 `Decoration.mark`, 목록·체크박스·문자 참조 위젯, 블록은 P3 전까지 원문 그대로), `EditorView.atomicRanges`, 입력(`inputHandler`)·키(Backspace, Delete, Enter, Shift-Enter, Tab, 방향키, Cmd+B/I/E)·붙여넣기·복사를 core `applyActionsInWindow`로 바꿔 CodeMirror 트랜잭션으로 보냄, IME 조합 중 장식 갱신 보류 |
| `packages/core/src/editing-model/changes.ts` (새) | `sourceChanges(before, after)`. 편집 결과를 코드 포인트 경계의 최소 변경으로 바꿔 보낸다. 바뀐 구간 전체를 바꾸면 사용자가 건드리지 않은 글자(선택을 `**`로 감쌀 때의 선택 글자)를 지우고 다시 넣어, 그 글자 안을 입력하던 상대편의 편집이 사라진다 |
| 테스트 | DOM 테스트: 실제 EditorView에서 편집 fixture를 입력해 같은 원문. IME 조합 중 원격 변경은 P5(IME 검증)로 옮긴다 |

## 작업 순서

1. P2a 증분 레이아웃 + 차등 테스트.
2. P2a 창 편집 + fixture·벤치. 확인: 5,000줄에서 글자 하나 p95 ≤ 8ms(core, 남은 반은 화면 그리기).
3. P2b 모드·장식·입력 + DOM 테스트.
4. 브라우저 확인: dev 서버에서 문서를 새 모드로 열고 입력, 5,000줄 문서에서 키 입력→화면 반영 시간을 페이지 안 측정으로
   잰다(p95 ≤ 16ms).

## 가장 위험한 단계

3번의 입력 가로채기. CodeMirror의 기본 입력(DOM 변경 관찰)과 IME 조합을 core 편집으로 바꾸면서 조합이 끊기거나
커서가 튈 수 있다. 조합 중에는 CodeMirror 기본 입력을 그대로 두고, 조합이 끝난 뒤 core 규칙(이스케이프 등)을 적용하는
방식으로 시작한다.

## 검증

```
bun run test:file -- packages/core/src/editing-model/incremental-layout.test.ts packages/core/src/editing-model/window.test.ts
bun run test:file -- packages/app/src/editor/live/live-extension.dom.test.tsx
```

## 결과 — P2a (2026-09-29)

- `IncrementalLayout`: 무작위 문서 40개 × 편집 25번(1,000번) 모두 전체 파싱의 레이아웃과 같았다. 983번은 증분, 17번은
  전체 파싱. 처음 구현은 경계 블록 비교에서 객체 키 순서 차이로 44%가 전체 파싱으로 떨어졌다. 값으로 비교하게 고쳤다.
- `applyActionsInWindow`: 편집 fixture 57개를 긴 문서 가운데에 넣은 경우와 무작위 문서·동작 400건 모두, 문서 전체로
  돌린 결과와 원문·커서가 같았다. 링크 참조·각주 정의가 있는 문서는 문서 전체로 돌린다.
- 5,008줄 문서에서 글자 하나 입력(창 편집 + 레이아웃 갱신): p50 4.5ms, p95 6.1ms(목표 8ms).

## 결과 — P2b (2026-09-29)

- 모드 전환에 `live`(Eye 아이콘)를 추가했다. 기본 모드는 `wysiwyg` 그대로다. `live`는 `SourceEditor`를 `variant`
  Compartment로 바꿔 띄운다.
- 편집 fixture 가운데 붙여넣기·복사를 뺀 전부(53개)를 실제 EditorView의 `inputHandler`와 keymap으로 입력해 원문과
  커서가 fixture와 같다. 굵게 안 공백을 `&#x20;`로 바꾼 뒤 다음 글자가 오면 참조를 다시 공백으로 되돌리는 정리 단계를
  엔진에 넣고 fixture `escape-entity-tidied`로 고정했다. Cmd+Shift+X(취소선)·Cmd+Shift+H(형광펜)도 넣었다.
- 브라우저(dev 서버, sample.md): 숨김·서식·목록·체크박스·문자 참조가 보이고, live 모드 입력이 서버를 거쳐 디스크의
  `sample.md`까지 저장된다.
- 5,000줄 문서 키 입력 시간(페이지 안 Event Timing·Long Animation Frame 측정): **16ms 목표를 못 맞췄다.**
  - 우리 코드: 엔진 p50 3.5ms, 레이아웃 갱신 2.8ms, 장식 0.2ms, dispatch(yCollab·CodeMirror 갱신 포함) 6ms.
  - 이벤트 처리: live keypress p50 19ms + input 10ms. source 모드는 5ms + 4ms. live 모드가 약 20ms를 더한다.
    나머지 약 10ms(장식 반영, React `input` 처리)는 아직 나누지 못했다.
  - 방해 없는 첫 입력의 키 입력→화면 반영은 약 35ms다.
- 앱의 기존 문제 두 가지가 키 입력마다 수백 ms를 막는다. 두 가지 모두 source 모드에서도 같은 크기로 나타나고, live
  확장과 무관하다.
  1. `hooks/use-document-stats.ts`가 Y.Text가 바뀔 때마다 300ms 뒤 `computeBodyStats(ytext.toString())`를 돌리고,
     5,000줄에서 한 번에 330~400ms 걸린다. 입력을 300ms 넘게 쉬면 다음 키가 그만큼 늦게 그려진다.
  2. 모드와 무관하게 숨겨진 Tiptap(`.ok-mode-hidden`)이 fragment에 묶여 있고, 문서를 열 때마다 y-tiptap이
     ContentFormat 4,704개(약 1.1MB)를 쓴다. 서버의 1MB 메시지 제한(`MAX_COLLAB_MESSAGE_BYTES`)에 걸려 연결이 끊기고
     1초마다 재연결하며 같은 SyncStep2를 다시 보낸다. y-indexeddb가 이를 보관해 새로 열 때마다 1.1MB가 쌓인다(4번
     열어 4.5MB). IndexedDB를 비우고 source 모드로 입력 없이 열어도 같은 4,704개가 생겼다. 따라서 큰 문서는
     브라우저에서 편집이 서버로 가지 않는다. 1MB 제한은 올바른 방어이고 원인은 쓰는 쪽이다.
- 이어서 할 일: 16ms는 1번 해결 뒤 live 모드 몫(약 20ms)을 줄여야 닿는다. 장식 반영과 React `input` 처리를 먼저
  나눠 잰다. 2번은 Tiptap과 fragment를 없애는 P6에서 사라진다. 그 전에 큰 문서의 브라우저 동기화를 검증하려면 2번을
  따로 고쳐야 한다.

### 고침 — 줄 첫머리 블록 기호는 발동 글자에서 바뀐다 (2026-09-29)

- 사용자 확인에서 `-`만 쳐도 스페이스 전에 불렛이 나타났다. Markdown은 기호만 있는 줄(`-`, `#`, `1.`, `>`, ```` ``` ````)도
  블록으로 읽는데, 엔진이 이 미완성 기호를 원문에 그대로 넣는 예외를 두고 있었다.
- 친 기호를 이스케이프해 글자 그대로 보이게 두고(`\-`, `1\.`), 스페이스(fence·수평선·수식 블록은 Enter)를 치면
  이스케이프를 풀어 블록으로 바꾼다. 기호 뒤에 다른 글자가 와서 블록이 되지 않으면(`-5`, `#태그`, `**굵게**`)
  이스케이프를 푼다. SPEC.md 5절과 fixture 11개(`rule-*-waits`, `rule-list-trigger`, `rule-marker-released`,
  `rule-tag-after-hash`, `rule-bold-line-start`, `rule-quote-no-space`, `rule-math-fence`)에 반영했다.
- 브라우저: `-`·`##`·`1.`이 스페이스 전까지 글자로 보이고, 스페이스를 치는 순간 불렛·제목·번호 목록이 된다.
