---
title: P4b 태그와 중첩 선택기
slug: web-source-editor
stage: plan
status: active
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
