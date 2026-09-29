---
title: P3m 수평선·각주·주석 위젯
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3m 수평선·각주·주석 위젯

core 파서가 이미 구분하는 수평선, 각주 참조·정의, 인라인 주석을 `live` 위젯으로 그린다. 각주 본문과 주석 본문은 원문 구분자를 숨긴 채 편집하고 해당 원문 범위만 바꾼다. 블록 주석 생성 단계에서 누락된 mdast 위치를 보존해 위젯 범위를 만들 수 있게 한다.

## 검증

- 수평선·각주·인라인/블록 주석 fixture와 원문 범위 편집 사례를 확인한다.
- 앱 DOM에서 기호가 숨겨지고 본문 편집이 원문에 반영되는지 확인한다.
- core·app 타입 검사, 변경 파일 Biome 검사, 실제 브라우저 화면을 확인한다.
