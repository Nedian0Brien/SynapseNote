---
title: 서버 문서 동기화 결함 수정 — P4b 저장 경로
slug: server-bridge-fixes
stage: plan
status: accepted
intent: .intent/intent_server-bridge-fixes.md
spec: .intent/spec_server-bridge-fixes.md
date: 2026-09-28
---

# P4b 저장 경로 — 구현 계획

이 계획은 구현과 같은 날 사후에 적었다(P4a 측정 직후 원인이 저장 경로로 좁혀져 바로 고쳤다).

## 문제

P4a 뒤 5,000줄 `Y.Text` 부하에서 반영 지연 p95 367ms, API p95 305ms. 저장(`onStoreDocument`)이
2~10초마다 fragment 전체를 JSON으로 만들고 전체 직렬화한 뒤 `Y.Text`와 비교했다. 어긋나면 전체 파싱까지 했다.

## 설계

- **`fragment-derivation.ts`**: 문서별로 "fragment는 이 `Y.Text` 문자열을 파싱한 결과"를 기록한다. Observer B가
  fragment를 쓴 뒤 남기고, 다른 origin이 fragment를 바꾸면 지운다.
- **저장**: 저장할 텍스트가 표시된 텍스트와 같으면 fragment는 구성상 그 파싱 결과이므로, 전체 검사는 문서가
  멈춘 상태(quiescent)이고 그 문서의 마지막 검사에서 60초가 지났을 때만 돌린다. 이 검사는 왕복 불안정 원격
  측정을 그대로 남기고, 어긋나면 전체 파싱으로 fragment를 다시 맞추므로 증분 파서의 안전망도 된다(P4a
  계획 3단계를 대신한다 — 따로 전체 파싱 비교 함수를 두지 않는다).
- **매핑 보호**: `reconcileFragmentNow`는 `OBSERVER_SYNC_ORIGIN`으로 fragment를 쓴다. Observer B는 자기 쓰기 중에만
  표시(`bWritingFragment`)를 세우고, 같은 origin이라도 B가 아닌 쓰기는 B의 매핑을 비운다.

## 바뀌는 파일

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/fragment-derivation.ts` (새) | 표시 저장소 |
| `packages/server/src/fragment-derivation.test.ts` (새) | `Y.Text` 편집 뒤 표시 = 현재 텍스트, 클라이언트 fragment 편집 뒤 표시 없음 |
| `packages/server/src/server-observers.ts` | 표시 남기기·지우기, B 자기 쓰기 표시 |
| `packages/server/src/persistence.ts` | 표시가 맞으면 검사를 멈춘 상태·60초 간격으로만 |

## 검증

```
bun run test:file -- packages/server/src/fragment-derivation.test.ts
bun run test:file -- packages/server/src/persistence-ytext-truth.test.ts   # 외 관찰자·bridge·persistence 전체
bun native/editor-spike/scripts/server-load.ts --port 5181 --doc <5,000줄> --mode text --seconds 30
```

## 결과 (2026-09-28)

- 관찰자·bridge·저장·증분·서로게이트·agent-patch 테스트 파일 전부 통과. 처음 구현(표시가 맞으면 검사를
  아예 건너뜀)은 `persistence-ytext-truth` 2개를 실패시켰다(저장 시점 왕복 불안정 원격 측정이 사라짐). 멈춘
  상태·60초 간격 검사로 바꿔 통과.
- dev 서버 5,000줄 `Y.Text` 부하(초당 10회 30초), 서버 재시작 뒤 두 번째 실행부터 세 번: 반영 지연 p95 4 /
  4 / 5ms, 최대 918 / 907 / 902ms, `GET /api/config` p95 14 / 13 / 17ms. 재시작 직후 첫 실행은 p95 618ms(코드
  예열 전).
- 남은 멈춤: 문서를 연 뒤 첫 편집 약 0.9초(증분 파서 캐시가 없어 전체 파싱 + mdast 파싱), 10초 무렵 약
  0.1초(저장). 첫 편집 멈춤은 문서 로드 시 파서를 미리 채우면 없앨 수 있으나 로드 시간이 늘어나 이번에는
  하지 않는다.
