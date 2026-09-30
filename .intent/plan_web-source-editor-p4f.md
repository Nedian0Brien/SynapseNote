---
title: P4f live 코드 미리보기·HTML 예제
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4f live 코드 미리보기·HTML 예제

기존 HTML preview 코드 블록의 공통 헤더·테마·CSP 보고·자동 높이·편집 창·확대 창·크기 조절을 live 위젯에 연결한다. core는 코드 울타리 메타 범위를 제공하고 설정은 해당 범위만 고친다. 슬래시 HTML·기존 예제 항목은 동일한 원문 예제를 삽입한다.

## 검증

- core 메타·본문 범위 변경과 원문 보존 fixture.
- live DOM 미리보기 표시·토글·설정·원격 변경 시 상태 유지.
- 브라우저 실제 iframe 렌더링·편집·예제 삽입·저장 및 관련 타입 검사.
