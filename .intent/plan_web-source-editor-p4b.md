---
title: P4b 태그와 중첩 선택기
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4b 태그와 중첩 선택기

기존 태그 검색·순위·새 태그 판별을 Tiptap 플러그인에서 분리하고 CodeMirror 선택기에서 재사용한다. 태그를 선택하면 원문 `#태그 `를 쓴다. top-level에 이미 등록된 위키 링크 선택기를 실제 브라우저에서 확인하고, 중첩 live 편집기에는 같은 위키·태그·슬래시 자동완성을 제공한다.

## 검증

- 태그 순위·새 태그 판별의 기존 테스트, live DOM 삽입·실행 취소·코드 영역 비활성화.
- 실제 브라우저 태그·위키 링크 메뉴 선택과 저장, 중첩 본문 선택기 확인.
- app 타입 검사와 변경 파일 Biome 검사.

## 결과

- 태그 API·정렬·새 태그 판별을 `tag-suggestion-data.ts`로 분리해 기존 Tiptap과 live 선택기가 공유한다. 선택은 `#태그 ` 원문 한 트랜잭션으로 적용한다.
- 중첩 live 편집기에 자동완성 상태와 공유 위키 선택기를 연결했다. 태그·슬래시·위키 선택기는 코드 영역에서 비활성화한다.
- 슬래시 검색 결과를 재사용하는 `validFor`를 제거해 검색어 변경마다 명령 목록을 다시 거른다.
- 브라우저 확인 문서 `http://localhost:5183/#/notes/p4b-suggestions-review-1790696600000`에서 top-level 태그·위키 메뉴와 콜아웃 내부 `#project`·위키 선택을 확인했다. 디스크 원문이 유지됐고 페이지 오류는 없었다.
- 기존 태그 24개, live 태그·중첩 DOM 4개, slash DOM 4개, 기존 live DOM 129개와 app 타입 검사가 통과했다.
