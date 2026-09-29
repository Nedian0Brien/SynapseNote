---
title: 세 작성자가 동시에 편집해도 편집이 중복·삭제되지 않는다
slug: concurrent-edit-duplication
stage: spec
status: accepted
intent: .intent/intent_concurrent-edit-duplication.md
date: 2026-09-29
---

# 세 작성자 동시 편집의 중복·삭제 — spec

## 원인 가설 (확인 전)

soak에서 본 모양과 코드 경로로 세운 후보다. P0의 재현으로 확인하거나 버린다.

- **H1 paired write의 fragment 재구성.** agent-patch는 `Y.Text`를 고친 뒤 fragment를 `parse(전체 본문)`로
  `updateYFragment`한다(`agent-sessions.ts` `applyAgentMarkdownWrite`, 새 mapping). 서버 fragment에 Observer A가
  아직 `Y.Text`로 옮기지 않은 웹 편집이 있거나, 웹 클라이언트의 update가 전송 중이면, 교체된 노드와 그 안에
  들어온 편집이 함께 남거나 함께 사라질 수 있다.
- **H2 뒤처진 기준본의 3-way 병합.** Observer A의 Path B·잔여 병합은 raw·canonical witness를 기준본으로 쓴다.
  기준본이 양쪽보다 많이 뒤처지면 충돌 해결기(`mergeConflictRegion`, 문자 단위 DMP)가 바뀐 줄을 한 충돌 구간에
  모은다. 5,000줄 실행에서 앱이 고친 문단 47개가 한 제목 아래에 한꺼번에 들어간 모양과 같다.
- **H3 블록 재작성과 동시 삽입.** Observer B의 `updateYFragment`나 Observer A의 전체 경로가 블록을 지우고 다시
  쓰는 동안 다른 클라이언트가 그 블록에 넣은 글자가 지워진 항목에 붙어 사라진다(삭제의 후보).

## 요구사항

- [ ] R1 결정적 재현: 네트워크 없이 서버 문서(관찰자 포함)와 클라이언트 문서 사이의 update 전달 순서를 seed로
      정하는 시뮬레이터가 있고, 앱(`Y.Text` 편집)·웹(ProseMirror 트랜잭션 → `updateYFragment`)·에이전트
      (`applyAgentMarkdownWrite` patch) 세 작성자를 돌린다. 수렴 뒤 마커별로 중복·삭제·쪼개짐을 판정한다.
- [ ] R2 판정 기준: 마커가 두 번 이상 나오면 중복. 마커 글자가 순서대로 남아 있고 사이에 다른 글자만 끼었으면
      쪼개짐(유실 아님). 글자가 빠졌으면 삭제.
- [ ] R3 원인마다 최소 재현 테스트(seed 고정 또는 손으로 쓴 순서)가 있고, 수정 뒤 통과한다. 테스트는
      `server-test-manifest.ts`에 등록된다.
- [ ] R4 시뮬레이터 1,000 seed에서 중복 0, 삭제 0.
- [ ] R5 실제 서버 soak(스파이크 `soak.ts`, 세 작성자, 삽입 전용, 38줄·1,000줄·5,000줄 각 10분)에서 중복 0,
      삭제 0, 해시 수렴, 크기 상한 안. 5,000줄은 서버가 뒤처지면(`large-doc-concurrent-load` 범위) 1,000줄
      결과와 시뮬레이터로 판정하고 그 사실을 적는다.
- [ ] R6 웹 작성자 단독 성능 유지: `bench-bridge-drain.ts` 5,000줄 fragment p95 ≤ 10ms, text p95 ≤ 10ms.

## 설계

- **P0 재현.** `packages/server/src/concurrent-writers.test-helper.ts`(테스트 도우미)와 퍼징 스크립트. 서버 `Y.Doc`에
  `setupServerObservers`와 서로게이트 정규화를 붙이고(persistence 없음), 클라이언트 `Y.Doc` 둘(앱, 웹)을 둔다.
  update는 방향별 큐에 쌓고 seed로 정한 시점에 묶어서 전달한다. 서버가 받은 update는 연결별 origin으로
  적용한다(Hocuspocus와 같음). 에이전트는 서버 문서에 per-session origin으로 `applyAgentMarkdownWrite` patch를
  쓴다. 판정기는 R2를 구현한다. 중복·삭제가 나오는 seed를 모으고 최소화한다.
- **P1 이후.** 재현으로 확인한 원인마다 한 단계씩 고친다. 원인과 수정 방법은 확인한 뒤 이 spec에 추가한다.
- **측정 도구(스파이크 브랜치).** soak의 유실 판정을 R2 기준으로 바꾼다(쪼개짐을 따로 센다).

## 버린 대안

- **기존 `bridge-convergence.fuzz.test.ts` 확장.** 연산이 대부분 문서 끝에 새 문단을 붙이는 것이라 기존 문단
  안의 동시 편집을 만들지 않고, 실제 서버와 타이머를 써서 seed 재현이 흔들린다(파일 머리말에 적힌 알려진
  flake). 새 시뮬레이터는 전달 순서를 seed로만 정한다.
- **soak만으로 조사.** 재현이 비결정적이고 한 번에 10분이 걸린다.
