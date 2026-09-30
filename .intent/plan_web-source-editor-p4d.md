---
title: P4d live 슬래시 컴포넌트·데이터베이스
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4d live 슬래시 컴포넌트·데이터베이스

슬래시 메뉴에 core 등록 명세의 canonical 컴포넌트를 연결한다. 명세에 명시한 기본 속성만 원문에 넣고 Tabs는 두 Tab을 준비한다. 새 데이터베이스는 기존 앱 생성 화면을 열고, 연결된 데이터베이스는 인라인 선택기를, 인라인 데이터베이스는 기존 creationId 흐름을 사용한다. 링크는 대화상자를 열고 태그는 기존 선택기를 사용한다.

## 검증

- 실제 CodeMirror 메뉴에서 컴포넌트·기본 속성·Tabs 삽입과 한 번의 Undo.
- 데이터베이스 생성 이벤트, 연결 선택기 원문, 인라인 생성 ID.
- 브라우저 메뉴 선택·위젯 렌더링·저장. app 타입 검사와 변경 파일 검사.
- 파일 업로드와 HTML preview starter는 다음 P4 구간에서 기존 삽입·렌더링 동작을 함께 옮긴다.
