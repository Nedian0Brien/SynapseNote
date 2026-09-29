---
title: P3a 코드 블록과 표 위젯
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3a 코드 블록과 표 위젯

P3를 코드 블록과 표부터 옮긴다. 두 블록은 원문 기호를 숨긴 채 내부를 편집해야 한다. 표는 칸의 원문 범위만 수정한다.

## 구현

1. core 파서의 위치 정보를 이용해 코드 본문·언어와 표 칸의 원문 범위를 구하는 순수 함수를 만든다. 표의 공백·정렬선·파이프는 그대로 둔다.
2. `live` 모드의 CodeMirror 블록 장식으로 코드와 표를 그린다. 코드 본문과 언어를 따로 편집하고, 표 칸은 기존 `live` 편집 규칙을 쓰는 작은 편집기로 편집한다.
3. 위젯 편집을 부모 `Y.Text`의 해당 범위 변경으로 전달한다. 원격 변경 때도 활성 입력의 DOM과 커서가 유지되도록 갱신한다.
4. 명세·fixture와 직접 해당 DOM 테스트를 추가하고, 코드·표가 있는 문서를 브라우저에서 확인한다.

## 검증

- core의 새 범위 테스트와 `live-extension.dom.test.tsx`만 실행한다.
- 코드 본문·언어, 표의 한 칸을 수정한 뒤 다른 원문 바이트가 그대로인지 검사한다.
- P3의 나머지 블록은 다음 세부 단계에서 구현한다.
