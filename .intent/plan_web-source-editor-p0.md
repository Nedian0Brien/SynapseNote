---
title: 웹 편집기가 원문을 직접 편집한다 — P0 편집 모델 명세
slug: web-source-editor
stage: plan
status: accepted
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P0 편집 모델 명세 — 구현 계획

## 만들 것

| 파일 | 무엇을 |
|---|---|
| `packages/core/src/editing-model/SPEC.md` (새) | 편집 모델 명세. 용어(원문, 표시 텍스트, 숨긴 범위, 블록 위젯, 커서 위치), 구문별 숨김 규칙, 커서·선택, 서식 경계 입력, 삭제, Enter, 입력 규칙, 이스케이프, 복사·붙여넣기, 원문 보기, IME. 규칙마다 fixture id를 적는다 |
| `packages/core/src/editing-model/fixtures/*.json` (새) | 적합성 사례. `hide.json`(원문 → 표시 텍스트·숨긴 범위), `edit.json`(원문+커서·선택 → 동작 → 원문+커서). 커서는 원문 안의 `│`, 선택은 `⟪…⟫`로 표시한다 |
| `packages/core/src/editing-model/fixtures.ts` (새) | fixture 타입과 로더(웹 테스트와 이후 구현이 쓴다) |
| `packages/core/src/editing-model/fixtures.test.ts` (새) | 형식 검사: id 중복 없음, 커서·선택 표시가 올바름, SPEC.md가 모든 fixture id를 가리키고 모든 fixture가 SPEC 규칙을 가리킨다, 원문이 core 파서로 파싱된다 |

## 결정 기준

- 지금 편집기(Tiptap)의 동작을 기본으로 따르되, 원문 충실도(spec R6)와 "편집은 편집한 곳 밖의 표시를 바꾸지 않는다"를
  우선한다. 지금 동작과 다르게 정한 규칙은 SPEC.md에 "현재와 다름"으로 표시한다.
- 네이티브 스파이크가 탭한 문단에서 기호를 보이는 동작은 이 명세로 대체한다(intent 답 3).

## 작업 순서

1. SPEC.md 초안과 fixture 형식·로더·형식 검사. 확인: `fixtures.test.ts` 통과.
2. 구문별 fixture를 채운다(숨김 20개 이상, 편집 40개 이상). 확인: 형식 검사 통과, 모든 규칙에 fixture가 하나 이상.

## 가장 위험한 단계

2번. 규칙이 서로 부딪히는 경우(예: 이스케이프와 입력 규칙)를 fixture가 드러낸다. 부딪히면 규칙의 우선순위를 SPEC.md에
적는다. 사용자가 정해야 할 동작 차이(현재와 다른 규칙)는 결과에 모아 보고한다.

## 검증

```
bun run test:file -- packages/core/src/editing-model/fixtures.test.ts
```
