---
title: P3k MDX 속성 편집과 Mirror 이동
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- 일반 MDX 위젯에 문자열·숫자·불리언·JSON 속성 입력을 연결했다. 등록된 컴포넌트의 필수·선택 속성을 추가할 수 있고 숨김 속성은 제어판에 노출하지 않는다. JSON 입력이 유효하지 않으면 원문을 보존하고 오류를 표시한다.
- 리터럴 값은 해당 속성 표현식 범위만 고친다. 실행 가능한 표현식은 기존처럼 평가하지 않는다.
- Mirror에 기존 편집기와 같은 문서·앵커 링크를 제공했다. 브라우저 확인 문서 `http://localhost:5183/#/notes/p3k-mirror-review-1790696200000`에서 Mirror 렌더링, 소스 이동, 속성 저장을 확인했다. 별도 소스 문서를 `live`에서 수정했을 때 열린 Mirror가 갱신됐고 페이지 오류는 없었다.
- core 위젯·fixture 66개, 앱 live DOM 125개와 MDX DOM 3개, core·app 타입 검사가 통과했다.
