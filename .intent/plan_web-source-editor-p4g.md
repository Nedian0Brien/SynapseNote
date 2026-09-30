---
title: P4g live 선택 서식 도구 막대
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4g live 선택 서식 도구 막대

선택한 텍스트에 CodeMirror tooltip으로 shadcn 서식 막대를 보여 준다. core의 bold·italic·strike·code·highlight, 문단·제목·목록·인용·코드 블록 명령, 기존 링크 대화상자에 연결한다. 버튼 누름과 선택 범위 이동·원격 편집 후에도 현재 원문 선택 범위를 사용한다.

## 남은 전체 이전 범위

밑줄 `<u>`는 현재 core 파서가 일반 텍스트로 읽어 별도 파서·편집 모델 지원이 필요하다. 각주·메모·AI 편집 버튼과 미디어 도구도 후속 구간에서 옮긴다. 이 계획은 기본 서식 막대 구간이며 R5 전체 완료를 뜻하지 않는다.

## 검증

- 실제 선택 막대에서 서식 추가·해제·문단 변경과 Undo.
- 원격 변경 후 현재 선택에 적용, 코드 내부에서 막대 숨김.
- 브라우저 선택·클릭·저장과 app 타입 검사.

## 결과

- CodeMirror 선택 tooltip 안에 shadcn Button·DropdownMenu를 사용한다. 다섯 서식, 문단·제목·목록·인용·코드 블록, 링크 대화상자를 연결했다.
- 현재 선택을 사용하며 원격 편집 후 이동한 범위에 적용한다. 활성 서식은 aria-pressed와 배경으로 표시하고 문단 메뉴 종료 후 편집기로 포커스를 돌린다.
- 서식 막대 DOM 테스트 2개와 app 타입 검사 통과. 원격 범위 이동·굵게 추가/해제·Undo·코드/빈 선택 숨김을 확인했다.
- 브라우저에서 선택·굵게 버튼·Heading 2 전환·링크 대화상자를 확인했다. 문단 메뉴가 닫힌 뒤 CodeMirror 포커스와 이어 입력을 확인했고 pageerror는 없었다.
- 남은 전체 이전 범위는 위 목록대로 유지한다. P3 일반 HTML 및 P4 나머지와 P5~P6는 완료 전이다.
