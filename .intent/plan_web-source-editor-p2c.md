---
title: 웹 편집기가 원문을 직접 편집한다 — P2c 기존 편집기 편집 동작 옮기기
slug: web-source-editor
stage: plan
status: accepted
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P2c 기존 편집기 편집 동작 옮기기 — 구현 계획

사용자 확인에서 live 모드에 기존 편집기(Tiptap)의 편집 동작이 빠져 있었다(불렛 항목에서 `1. `를 쳐도 번호 목록이
되지 않음). 기존 편집기의 입력 규칙·키·단축키·붙여넣기 동작 목록을 코드에서 뽑아 대조하고 빠진 것을 옮긴다.
기존 편집기의 버그로 보이는 네 가지는 사용자 결정에 따라 다르게 둔다: ```` ``` ````는 언어+Enter로 코드 블록,
제목 첫머리 Backspace는 제목→문단, 체크된 작업 항목의 Enter는 체크 안 된 새 항목, `[ ] `는 작업 항목으로 바꾼다.

## 옮길 동작

| 무엇 | 기존 편집기 근거 |
|---|---|
| 목록 항목 첫머리에서 `1. ` `- ` `[ ] `로 항목의 목록 종류 바꾸기 | `core/extensions/list.ts` convertListItemInput |
| 입력 규칙 직후 Backspace로 되돌리기 | Tiptap `undoInputRule` |
| `---`는 세 번째 `-`에서, `***␣` `___␣`는 공백에서 수평선 | `thematic-break-fidelity.ts` |
| `~~~lang␣` 코드 블록 | Tiptap code-block 입력 규칙 |
| Enter: 인용 이어가기·빠져나가기, 제목 가운데 나누기, 코드 블록 안 줄바꿈, 중첩 빈 항목 내어쓰기 | Keymap `splitBlock`·`liftEmptyBlock`·`newlineInCode`, `splitListItem` |
| Shift-Enter·Cmd-Enter: 코드 블록 빠져나가기 | `exitCode` |
| Tab·Shift-Tab: 부모 항목 폭만큼 들이기, 중첩 번호 1부터, 최상위 Shift-Tab은 문단, 코드 블록 안 공백 2칸 | `list-editing-shortcuts.ts`, code-block Tab |
| 중첩 항목 첫머리 Backspace는 목록 밖 문단, Delete는 다음 블록 합치기 | `ListEditingShortcuts`, `joinForward` |
| 번호 목록 표시 번호는 Markdown 해석(시작 번호+순서) | `normalizeOrderedListStarts` |
| Cmd-Alt-0~6, Cmd-Shift-7/8/9, Cmd-Shift-B, Cmd-Alt-C, Cmd-Shift-S, Cmd-Shift-↑/↓ | 각 확장의 단축키, `block-mover.ts` |
| 붙여넣기: Markdown처럼 보이는 글은 Markdown, Cmd-Shift-V는 글자 그대로, 코드 블록 안은 그대로 | `clipboard/handle-paste.ts` |

범위 밖: 슬래시 메뉴·위키 링크·태그 선택기·Cmd-K 링크 창(P4 화면 기능), 일반 문단 Tab 들여쓰기(탭으로 시작하는
Markdown 줄은 코드 블록이 되어 원문으로 표현할 수 없음), Cmd-U 밑줄(Markdown 구문 없음).

## 파일

- `packages/core/src/editing-model/edit.ts`: 위 동작. `EditState.undo`(되돌릴 상태), 블록 동작 `block`·`move`.
- `packages/core/src/editing-model/layout.ts`: 번호 목록 표시 번호를 list-marker 위젯의 `label`로.
- `packages/core/src/editing-model/fixtures.ts`, `fixtures/edit.json`, `SPEC.md` 5~8절.
- `packages/app/src/editor/live/live-extension.ts`: 단축키, `undo`를 커서 의도 필드에 보관, 붙여넣기 분기, 번호 표시.

## 검증

```
bun run test:file -- $(ls packages/core/src/editing-model/*.test.ts)
bun run test:file -- packages/app/src/editor/live/live-extension.dom.test.tsx
```

브라우저: sample 문서에서 불렛→번호 전환, Backspace 되돌리기, Tab 중첩 번호, 인용 Enter, 단축키를 입력해 본다.

## 결과 (2026-09-29)

- 위 표의 동작을 모두 옮겼다. fixture 43개를 더해 edit fixture는 112개다. core 테스트 158개와 live DOM 테스트
  108개(fixture를 실제 CodeMirror 키 입력으로 재생)가 통과한다. 무작위 편집 2,840건 실패 0건.
- 동작마다 같은 원문의 레이아웃을 여러 번 파싱하던 것을 마지막 원문 하나를 캐시해 줄였다. 5,008줄 창 편집은
  p50 3.4ms, p95 5.0ms다(P2a 6.1~6.4ms).
- 블록 위젯이 그려지기 전(P3)에는 코드·수식·표 등 블록 안의 커서가 블록 앞으로 옮겨져 입력이 블록 밖에 들어갔다.
  블록 안에서는 원문을 그대로 편집하도록 고쳤다.
- 브라우저(sample 문서, 실제 키 입력): 불렛 항목에서 `1. ` → 번호 목록, 바로 다음 Backspace → `- 1\. ` 글자로
  되돌림, 번호 항목 Tab → `   1. `(중첩 번호 1부터), 인용 Enter → 인용 안 새 문단, Cmd+Alt+2 → 제목,
  Cmd+Shift+↑ → 블록 이동을 확인했다.
- 확정하지 못한 것: 첫 브라우저 확인 때 sample 문서의 `## Lists` 아래에 입력하지 않은 `- 1\. ` 줄이 생겨 있었다.
  같은 문서·같은 입력을 Y.Text 관찰기를 켠 채 되풀이하자 변경은 로컬 한 건(`-`→`1.`)뿐이었고 줄은 생기지 않았다.
  그 전 약 20분 동안 입력이 없었는데도 서버 로그에 sample의 fragment 변경이 여러 번 있었다(코드 저장마다 Vite가
  페이지를 다시 불러오고 숨겨진 Tiptap이 fragment를 다시 쓴 것으로 보인다). 이 변경은 서버 브리지의 병합으로
  Y.Text에 들어간다. 따라서 브리지 병합이 가장 유력한 후보다. 편집 엔진은 입력 위치 밖을 바꾸지 않는다는 것을
  fixture와 창 편집 차등 테스트가 확인한다. 줄이 생긴 순간의 Y.Text 기록이 없어 확정하지 못했다.
