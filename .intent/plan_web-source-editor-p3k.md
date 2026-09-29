---
title: P3k MDX 속성 편집과 Mirror 이동
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P3k MDX 속성 편집과 Mirror 이동

일반 MDX 위젯에서 리터럴 문자열·숫자·불리언·JSON 속성을 원문 범위별로 고친다. 등록된 컴포넌트의 속성 정의를 사용해 현재 값이 없는 속성도 추가할 수 있게 한다. 실행 가능한 MDX 표현식은 평가하거나 자동 변경하지 않는다.

Mirror는 기존 편집기와 같은 문서·앵커 해시로 소스 열기 링크를 제공한다. MirrorSource의 본문은 기존 중첩 live 편집 경로를 유지한다.

## 검증

- 문자열·숫자·불리언·JSON 속성의 수정·추가와 인접 원문 보존 fixture.
- 앱 DOM에서 속성 입력과 Mirror 링크, 실제 브라우저에서 Mirror 렌더링·소스 이동 확인.
- core·app 타입 검사와 변경 파일 Biome 검사.
