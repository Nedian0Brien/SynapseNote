---
title: P4a live 슬래시 명령
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- 기존 CodeMirror 자동완성 UI에서 기본 블록 명령과 표·수평선·수식·Mermaid·주석 삽입을 제공한다. 코드 블록 안에는 열리지 않는다.
- 자동완성 함수 참조를 고정해 메뉴가 대기 상태에 머무는 결함을 방지했다. 메뉴가 활성화되면 Enter·Tab이 live 줄바꿈·들여쓰기로 전달되지 않는다.
- 빈 문단의 제목 변환을 core에서 고쳤고 trigger 제거·블록 적용은 한 트랜잭션으로 실행 취소된다.
- 브라우저 `http://localhost:5183/#/notes/p4a-slash-review-1790696500000`에서 `/h2` 메뉴, Enter 선택, 제목 입력과 디스크 저장을 확인했다.
- core edit·fixture 121개, app live DOM 129개와 slash DOM 4개, core·app 타입 검사가 통과했다.
