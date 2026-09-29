---
title: P3c live 편집기 문서 속성 연결
slug: web-source-editor
stage: plan
status: implemented
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-29
---

# P3c live 편집기 문서 속성 연결

`live` 모드는 현재 source 화면 경로를 타서 `PageHeader`·`PropertyPanel`을 숨기고 YAML 원문을 편집기에 그대로 보인다.
기존 속성 패널은 `Y.Text('source')`의 frontmatter에 이미 연결되어 있다.

## 구현

1. `live`에서 기존 문서 헤더·속성 패널과 데이터베이스 레코드 속성 화면을 렌더링한다. `source` 모드의 원문 화면은 유지한다.
2. `live` 편집기의 frontmatter 원문 범위를 블록 장식으로 숨긴다. 속성 변경은 기존 패널의 원문 변경 경로를 사용한다.
3. 문서 속성의 표시·수정·새로고침, 데이터베이스 보호 경로, 모드 전환을 실제 앱에서 확인한다.

## 검증

- `live-extension.dom.test.tsx`의 frontmatter 표시·원문 보존 사례와 관련 UI 테스트를 실행한다.
- 앱 타입 검사와 변경 파일 Biome 검사를 실행한다.

## 결과 (2026-09-29)

- `live`에서 기존 `DatabaseRecordPageChrome`·`PageHeader`·`PropertyPanel`을 연결하고, 편집기 안의 frontmatter 원문을 블록 장식으로 숨겼다.
- `live` 편집기의 사용자 트랜잭션이 숨겨진 YAML 범위를 바꾸지 못하게 막았다. 속성 패널의 기존 Y.Text 바인딩은 그대로 동작한다.
- live DOM 테스트 116개와 앱 타입 검사 통과. 브라우저에서 속성 값을 바꾼 뒤 원문·새로고침 상태를 확인했다.
- `source` 모드에서는 YAML 원문을, `wysiwyg`와 `live`에서는 속성 패널을 확인했다. 실제 데이터베이스 레코드를 열어 `live` 속성 화면과 숨겨진 `_sn`의 사용자 삭제 차단도 확인했다.
