---
title: P3j 참조 이미지와 정의 위젯
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3j 참조 이미지와 정의 위젯

`![alt][id]`·`![alt][]`·`![id]`의 대상 URL을 같은 문서의 첫 번째 Markdown 정의에서 찾는다. `live` 화면에는 이미지를 렌더링하고, 대체 텍스트는 이미지 위치에서, URL은 공유 정의의 원문 범위에서 고친다. 정의 줄도 압축된 위젯으로 보여 주고 편집한다.

정의 색인은 기존 `IncrementalLayout`의 정의 블록으로부터 지연 생성한다. 정의 변경 때만 전체 레이아웃이 다시 파싱되는 현재 규칙을 사용한다. 일반 키 입력마다 문서 전체를 다시 파싱하는 경로는 만들지 않는다.

## 검증

- 세 참조 형태, 중복 정의의 첫 항목 우선, 주변 원문 보존, 정의 변경 후 이미지 갱신 fixture를 확인한다.
- 앱 DOM에서 이미지·정의 위젯과 범위별 편집을 확인한다.
- core·app 타입 검사, 변경 파일 Biome 검사, 실제 브라우저 이미지 표시·저장을 확인한다.
