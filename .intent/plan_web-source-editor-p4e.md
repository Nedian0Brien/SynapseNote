---
title: P4e live 파일 업로드
slug: web-source-editor
stage: plan
status: active
intent: .intent/intent_web-source-editor.md
spec: .intent/spec_web-source-editor.md
date: 2026-09-30
---

# P4e live 파일 업로드

기존 업로드 API와 확장자별 삽입 정책을 재사용한다. live의 슬래시 File 항목·파일 붙여넣기·드롭이 같은 업로드 경로를 사용한다. 로딩 표시와 삽입 위치는 원격 트랜잭션에 따라 이동하며 편집기가 폐기되면 삽입을 멈춘다. 성공 원문은 이미지·동영상·음악 JSX, 파일 위키 임베드, Markdown 문서 위키 링크, 기타 Markdown 링크로 적용한다.

## 검증

- 확장자별 원문 형식과 첨부 경로, API 성공·실패 계약.
- 업로드 중 앞쪽 원격 편집·편집기 폐기·실패 시 로딩 정리.
- 브라우저 실제 파일 선택·업로드·표시·저장. 관련 app 타입 검사와 변경 파일 검사.
- HTML preview starter와 코드 블록 미리보기는 다음 P4 구간에서 함께 옮긴다.
