---
title: 웹 동등성 P5 — 원격에서 성립하지 않는 것
slug: web-parity-p5
stage: plan
status: accepted
intent: .intent/intent_web-parity.md
spec: .intent/spec_web-parity.md
date: 2026-09-10
---

# P5 — 원격에서 성립하지 않는 것 — 구현 계획

R18~R20. 원격에서 403이 나는 버튼을 화면에서 없애고, 왜 없는지 적는다.

이 intent의 종료 조건이다.

## 원칙 두 가지

**감추는 판단은 앱이, 허용하는 판단은 서버가.** `useIsRemote()`는 컨트롤을
그릴지 말지에만 쓴다. 동작을 허용할지는 서버가 정하고, 서버만이 정할 수 있다.
앱의 플래그가 틀려도 보안이 무너지지 않아야 한다.

**컨트롤마다 한 곳에서 막는다.** 렌더 지점마다 고치면 새 지점이 생길 때
빠진다. 잎 컴포넌트가 스스로 판단한다.

## 작업 순서

1. **접근 모드 배선** — `/api/config`에 `accessMode`, `AccessModeProvider`,
   `useIsRemote()`. **(완료)**
   확인: `bun run --cwd packages/app typecheck`

2. **공유·게시** — `ShareButton`이 원격에서 렌더하지 않는다. 배포본에 GitHub
   자격증명이 없어 게시가 push 단계에서 실패한다.
   확인: `ShareButton.dom.test.tsx`

3. **설정 → 계정** — GitHub 연결 상태는 보이되(P4가 열었다) 연결·해제 버튼은
   원격에서 감추고 데스크톱에서 하라고 적는다.
   확인: `AccountSection.dom.test.tsx`

4. **설정 → 임베딩 키** — 원격에서 감춘다. 머신 전역 키라 이 서버 하나가 아니라
   그 머신의 모든 프로젝트에 걸린다.
   확인: `EmbeddingsKeySection.dom.test.tsx`

5. **에이전트 채팅** — 왜 없는지 적는다. 컨테이너에 CLI 바이너리도 자격증명도
   없다는 사실을 감추지 않는다.

6. **문서** — `deploy/README.md`의 "Not covered here"를 실제와 맞춘다. changeset에
   웹에서 되는 것과 안 되는 것을 적는다.

7. **i18n·회귀** — `bun run i18n`, 앱 DOM 테스트, 서버 테스트.

## 이미 괜찮은 것

**"Open with AI" 서브메뉴.** 웹 호스트에서는 `terminalLaunch`가 null이고 설치된
타겟이 비어 있어 비활성 힌트를 그린다. P3가 `installed-agents`를 열어 403 대신
빈 목록이 오므로 "확인 실패"가 아니라 "없음"이 된다. 손대지 않는다.

**프로젝트 전환·복제.** `ProjectSwitcher`에 이미 데스크톱 가드가 있다. 웹 셸에서
`CloneDialog`에 도달하는 경로가 없으므로 이번에는 두고, 도달 경로가 확인되면
그때 막는다.

## 위험

**플래그가 늦게 도착한다.** `/api/config` 응답 전 한 프레임 동안 `local`이라
컨트롤이 잠깐 보일 수 있다. `singleFile`이 같은 성질을 갖고 있고 그쪽이
받아들인 절충이다. 잘못된 `local`은 눌렀을 때 실패하는 버튼이고, 잘못된
`remote`는 없는 기능처럼 보인다 — 후자가 더 나쁘므로 기본값은 `local`이다.

**감추기만 하고 서버를 안 막으면 보안이 아니다.** 이 단계는 UI만 다룬다.
서버 쪽 거절은 P1~P4가 이미 했고, `api-sync-remote.test.ts`가 지킨다.

## 검증

```
bun run --cwd packages/app typecheck
bun run --cwd packages/app test:dom src/components/ShareButton.dom.test.tsx \
  src/components/settings/AccountSection.dom.test.tsx \
  src/components/settings/EmbeddingsKeySection.dom.test.tsx
bash scripts/check-i18n-drift.sh
bun run --filter @nedian0brien/synapsenote-server test:unit
```

배포 후 `https://synapse.lawdigest.kr`에서 403이 나는 버튼이 화면에 없는 것.
