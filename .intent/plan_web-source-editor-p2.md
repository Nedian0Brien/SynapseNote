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
| 테스트 | DOM 테스트: 실제 EditorView에서 편집 fixture를 입력해 같은 원문. IME 조합 중 원격 변경 |

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
bun run test:file -- packages/app/src/editor/live/live-editor.dom.test.tsx
```
