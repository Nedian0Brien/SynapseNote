---
title: P3h HTML details 아코디언
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3h HTML details 아코디언

core 파서가 `HtmlDetailsAccordion`으로 판별한 `<details>` 원문을 기존 아코디언 위젯으로 보여 준다. `<summary>` 제목과 본문은 원문 범위를 직접 편집하며, `open`·`name`·`id` 속성과 주변 원문은 보존한다.

## 검증

- 한 줄·여러 줄 details의 제목·본문 변경 fixture와 앱 DOM 위젯 테스트를 실행한다.
- core·app 타입 검사 및 변경 파일 Biome 검사를 실행한다.

## 결과

- core 파서가 `HtmlDetailsAccordion`으로 판별한 한 줄·여러 줄 `<details>`를 기존 아코디언 위젯에 연결했다.
- 제목과 본문 입력은 `<summary>` 내용과 본문 원문 범위만 바꾼다. `open`·`name`·`id`는 그대로 보존한다.
- core 위젯·fixture 테스트 51개, 앱 live DOM 테스트 124개, core·app 타입 검사가 통과했다.
