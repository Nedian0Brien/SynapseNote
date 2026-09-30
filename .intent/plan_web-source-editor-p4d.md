---
title: P4d live 슬래시 컴포넌트·데이터베이스
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- core canonical 명세에서 메뉴 항목과 명시된 기본 속성을 가져온다. Tabs는 두 Tab을 넣고, 선택 결과를 하나의 원문 트랜잭션으로 적용한다.
- 새 데이터베이스는 기존 앱 이벤트, 연결된 데이터베이스는 DatabaseView 선택기, 인라인 데이터베이스는 새 creationId를 사용한다. DatabaseView의 내부 ID 속성 입력란은 선택기가 관리하도록 숨겼다.
- 슬래시 링크는 기존 대화상자를 열며 취소 시 변경되지 않은 임시 문구만 삭제한다. 원격 경계 삽입은 임시 문구 밖에 보존한다. 태그는 기존 선택기를 연다.
- 슬래시 DOM 8개, 링크 DOM 4개, MDX 속성 DOM 3개와 app 타입 검사 통과. 변경 파일 Biome·diff 검사 통과.
- 브라우저에서 Tabs 두 패널, 연결된 데이터베이스 선택기, 새 데이터베이스 생성·표 화면, 인라인 데이터베이스 생성·표, 링크 열기·취소, 태그 제안을 확인했다. pageerror가 없었다. 인라인 생성용 creationId가 문서 원문에 저장됐다.
- 파일 업로드, HTML preview starter와 메뉴 시각적 미리보기는 아직 남아 있다. P3 일반 HTML 지원 및 P4 나머지 기능과 P5~P6도 계속 진행한다.
