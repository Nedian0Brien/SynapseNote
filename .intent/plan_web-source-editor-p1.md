---
title: 웹 편집기가 원문을 직접 편집한다 — P1 core 편집 모델
slug: web-source-editor
stage: plan
status: accepted
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P1 core 편집 모델 — 구현 계획

## 만들 것

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/editing-model/layout.ts` (새) | `computeLayout(source)`. frontmatter를 떼고 core 파서(`parseToMdast`)의 위치로 숨긴 범위(여는·닫는 기호, 줄 첫머리 기호, 이스케이프 `\`, 강제 줄바꿈 `\`)와 위젯 범위(목록·작업 기호, 문자 참조, 이미지, 블록)를 계산한다. 서식 구간(`marks`: 종류, 여는 범위, 닫는 범위, 경계 포함 여부)도 돌려준다 |
| `packages/core/src/editing-model/edit.ts` (새) | `applyActions(state, actions)`. 상태는 원문, anchor·head, 커서 방향(기본·밖), 대기 서식이다. SPEC 4~8절의 커서 정규화, 입력(입력 규칙 → 이스케이프 판정), 서식 켜고 끄기, 삭제, Enter, Tab, 붙여넣기, 복사를 순수 함수로 구현한다. 원문 해석은 매 동작 `computeLayout`으로 한다(속도는 P2에서 편집기가 증분 파서로 맞춘다) |
| `packages/core/src/editing-model/index.ts` (새) + core `index.ts` | 공개 API |
| `layout.test.ts`, `edit.test.ts` (새) | `hide.json`·`edit.json` fixture를 모두 돌린다 |

## 판정 방식

- **이스케이프:** 친 글자 앞뒤의 레이아웃(숨긴 범위·위젯)을 비교한다. 삽입 위치로 옮긴 이전 레이아웃과 새 레이아웃이
  다르면 해석이 바뀐 것이다. 이때 입력 규칙의 발동이 아니면 친 글자를 이스케이프한다.
  - 발동으로 보는 경우: 새 서식 구간의 닫는 기호가 커서에서 끝나거나, 공백·Enter가 줄 첫머리 기호를 완성할 때다.
  - 빈 줄에서 줄 첫머리 기호(`#`, `-`, `1.`, `>`, ```` ``` ````, `---` 등)를 치는 중간 상태는 판정에서 뺀다.
    예를 들어 `#`만 쳐도 빈 제목이 되지만 이는 입력 중인 상태다.
- **경계 입력:** 두 표시 글자 사이의 숨긴 기호 묶음 안에서 삽입 위치를 고른다.
  - 닫는 기호 쪽: 경계를 포함하지 않는 서식(링크) 가운데 가장 바깥 것의 닫는 기호 뒤에 넣는다. 그런 서식이 없으면
    닫는 기호들 앞에 넣는다.
  - 여는 기호 쪽: 여는 기호들 앞에 넣는다.
  - 줄 첫머리 기호: 그 뒤에 넣는다.

## 작업 순서

1. `layout.ts` + `layout.test.ts`. 확인: 숨김 fixture 30개 통과.
2. `edit.ts` + `edit.test.ts`. 확인: 편집 fixture 55개 통과.
3. core 공개 API, 린트, 타입 검사.

## 가장 위험한 단계

2번의 이스케이프 판정. 레이아웃 비교가 너무 민감하면 평범한 입력까지 이스케이프하고, 너무 둔하면 편집한 곳 밖의
표시가 바뀐다. fixture 외에 무작위 문단에 무작위 글자를 넣는 속성 테스트를 붙여, 이스케이프가 난 경우와 표시가 바뀐
경우를 센다.

## 검증

```
bun run test:file -- packages/core/src/editing-model/layout.test.ts packages/core/src/editing-model/edit.test.ts packages/core/src/editing-model/fixtures.test.ts
```
