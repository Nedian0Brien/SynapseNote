---
title: P3i live Tabs와 Tab
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3i live Tabs와 Tab

기존 Tabs 렌더러는 Tiptap의 자식 NodeView DOM을 읽는다. `live`에서는 core 파서가 찾은 직접 자식 Tab의 범위를 사용해 탭 목록과 활성 패널을 렌더링한다. 탭 라벨과 본문 편집은 해당 자식의 원문 범위만 바꾼다. 캐시된 CodeMirror 뷰를 다시 붙여도 활성 탭과 문서 문맥을 유지한다.

## 검증

- 직접 자식 Tab, 중첩 Tabs, 라벨·본문 원문 변경 fixture를 확인한다.
- 앱 DOM에서 탭 전환, 라벨·본문 편집, 포털 수명을 확인한다.
- core·app 타입 검사와 변경 파일 Biome 검사를 실행한다.
