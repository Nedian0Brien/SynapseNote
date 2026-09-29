---
title: P3g 들여쓴 코드 블록
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3g 들여쓴 코드 블록

core 파서가 코드 블록으로 판별한 네 칸 들여쓰기·탭 들여쓰기 원문을 기존 코드 위젯에 연결한다. 위젯에는 본문을 들여쓰기 없이 보여 주고, 본문 변경은 원문의 해당 블록에 다시 들여쓰기를 붙여 기록한다. 울타리 코드의 언어 입력은 유지하고 들여쓴 코드에는 보이지 않는다.

## 검증

- 네 칸·탭 들여쓰기와 주변 문단 보존 fixture, 앱 DOM 입력 테스트를 실행한다.
- 기존 울타리 코드 테스트와 core·app 타입 검사, 변경 파일 Biome 검사를 실행한다.

## 결과

- 네 칸·탭 들여쓰기 코드의 Markdown 접두어를 숨기고 기존 코드 본문 입력에 연결했다. 들여쓴 코드에는 언어 입력을 숨긴다.
- core 파서가 코드 블록으로 판별한 범위에서만 들여쓰기 모델을 만든다. 입력한 본문은 기존 들여쓰기 종류로 원문에 기록한다.
- core 위젯·fixture 49개, 앱 live DOM 123개, core·app 타입 검사와 변경 파일 Biome 검사가 통과했다.
