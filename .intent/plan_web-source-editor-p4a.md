---
title: P4a live 슬래시 명령
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4a live 슬래시 명령

CodeMirror의 기존 자동완성 UI에 live 슬래시 명령을 등록한다. 문단·제목·목록·인용·코드는 core 편집 명령으로 적용하고 표·수평선·수식·Mermaid·주석은 원문 블록을 삽입한다. 메뉴가 열렸을 때 Enter·Tab·화살표·Escape를 자동완성에 먼저 전달한다. 코드 블록 안에는 메뉴를 열지 않는다.

데이터베이스 생성, 미디어 업로드, 전체 컴포넌트 카탈로그, 중첩 live 편집기의 선택기는 후속 P4 구간에서 기존 작업 흐름에 연결한다. P3의 일반 HTML 해석 차이도 남은 점검 항목으로 유지한다.

## 검증

- 명령 선택이 trigger만 제거하고 원문 블록을 한 트랜잭션으로 만드는 DOM 테스트.
- 코드 안 비활성화, 명령 검색, 메뉴 키 입력 처리.
- 실제 브라우저의 슬래시 메뉴 선택·저장, app 타입 검사와 변경 파일 Biome 검사.
