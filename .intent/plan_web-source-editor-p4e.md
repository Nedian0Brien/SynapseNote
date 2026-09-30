---
title: P4e live 파일 업로드
slug: web-source-editor
stage: plan
status: implemented
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

## 결과

- 파일 형식 분류·상대 경로 계산을 Tiptap에서 독립된 source-shape 모듈로 옮겨 두 편집기가 공유한다. 기존 URL-only uploadFile 계약은 유지하고 uploadAsset은 서버의 src/path/deduped를 함께 반환한다.
- 슬래시 File, 붙여넣기, 드롭은 같은 live 업로드 컨트롤러를 사용한다. 로딩 위치는 원격 변경으로 이동하고 실패·편집기 폐기 시 정리한다.
- JSX 이미지·동영상·음악, 파일 위키 임베드, Markdown 문서 위키 링크, 기타 상대 Markdown 링크를 원문으로 넣는다. 업로드로 Markdown 파일명이 바뀌면 반환된 이름을 대상으로 사용한다.
- live 업로드 DOM 4개, 업로드 API 14개, 파일 분류 10개, 상대 경로 9개, 슬래시 DOM 8개와 app 타입 검사 통과. 변경 파일 Biome·diff 검사 통과.
- 브라우저에서 슬래시 파일 선택→실제 POST 업로드→이미지 표시, 파일 붙여넣기, 파일 드롭, 새로고침 후 세 이미지 유지·정상 로딩을 확인했다. pageerror 없음.
- 다음 P4 구간은 HTML preview starter·코드 블록 미리보기다. P3 일반 HTML, 메뉴 미리보기, 서식 도구 막대, 메모·앵커, 협업 표시, PDF 내보내기 및 P5~P6가 남아 있다.
