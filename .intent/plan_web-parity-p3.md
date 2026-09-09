---
title: 웹 동등성 P3 — 프로젝트 준비
slug: web-parity-p3
stage: plan
status: accepted
intent: .intent/intent_web-parity.md
spec: .intent/spec_web-parity.md
date: 2026-09-09
---

# P3 — 프로젝트 준비 — 구현 계획

R12~R14를 만족시킨다. 스타터 팩과 스킬 설치가 웹에서 되게 한다.

## 계획을 세우다 범위가 줄었다

spec은 P3에 `share/*` 5개를 넣어 뒀는데, 배포본 컨테이너에 GitHub 자격증명이
없다는 것을 확인하고 뺐다. 근거는 spec의 "배포본에는 GitHub 자격증명이 없다"
절에 적었다. 요지는 `$HOME`이 tmpfs라 `auth.yml`이 살아남지 못하고, 그 파일을
채우는 유일한 경로는 데스크톱 전용이라는 것이다. 열어도 실패하는 마법사가 된다.

남은 7곳은 전부 워크스페이스 안에서 끝나는 동작이라 GitHub 없이 성립한다.

## 여는 것 7곳

| 핸들러 | 경로 | 무엇을 |
|---|---|---|
| `seed-packs` | `GET /api/seed/packs` | 설치 가능한 스타터 팩 목록 |
| `seed-plan` | `GET /api/seed/plan` | 적용 시 무엇이 생기는지 미리보기 |
| `seed-apply` | `POST /api/seed/apply` | 워크스페이스에 팩을 쓴다 |
| `install-skill` | `POST /api/skill/install` | 스킬 설치 |
| `skill-install-state` | `GET /api/skill/install-state` | 설치 상태 |
| `installed-agents` | `GET /api/installed-agents` | 설치된 에이전트 CLI 목록 |
| `client-logs` | `POST /api/client-logs` | 브라우저 진단 로그 수집 |

`seed-packs`와 `install-skill`은 CLI 서브프로세스를 띄우지만
`localOpCliArgs`가 `[process.execPath, process.argv[1]]`이라 컨테이너 안에서
`node /app/dist/cli.mjs`로 돈다. 실행 파일은 이미지에 있고 GitHub는 필요 없다.

## 남는 의문 하나

`installed-agents`는 그 머신에 설치된 에이전트 CLI를 센다. 컨테이너에는 하나도
없으므로 웹에서는 항상 빈 목록이다. 그것이 정직한 답이고, 왜 비어 있는지는
P5가 화면에 적는다. 여는 이유는 지금 403이 나면서 UI가 "확인 실패"를 그리기
때문이다 — 빈 목록이 실패보다 정확하다.

## 작업 순서

1. **7개 호출 지점** — `remote: 'account-session'`.
   확인: `bun run --filter @nedian0brien/synapsenote-server typecheck`

2. **테스트** — `api-sync-remote.test.ts`의 `STILL_CLOSED` 표본에서 `seed-apply`를
   빼고, P3가 여는 7개와 남은 표본을 확인하는 케이스를 더한다.
   확인: `bun test packages/server/src/api-sync-remote.test.ts`

3. **회귀**.
   확인: `test:unit`, `test:contract`, `test:filesystem`

## 위험

**`seed-apply`는 워크스페이스에 파일을 쓴다.** 계정 세션만 통과하므로 방어선은
P1이 세운 것과 같다. 다만 실수로 팩을 적용하면 문서가 늘어나므로, 되돌리기는
사용자가 문서를 지우는 것이다 — git 이력이 남으니 복구는 된다.

**`client-logs`는 브라우저가 보내는 것을 서버 로그에 쓴다.** 원격에서 열면
원격 클라이언트가 로그를 부풀릴 수 있다. 계정 세션 요구가 방어선이고, 운영자
한 명이므로 실질적 위험은 낮다.

## 검증

```
bun test packages/server/src/api-sync-remote.test.ts
bun run --filter @nedian0brien/synapsenote-server test:unit
bun run --filter @nedian0brien/synapsenote-server test:contract
```

원격 모드 실서버에서 계정 세션으로 7개가 403이 아니고, 토큰으로는 403인 것.

## 다음 단계

P4는 `local-op/auth/{status,repos}`다. 배포본에서 그 답은 "연결 안 됨"이지만,
그것이 P5가 화면에 이유를 적을 근거가 된다.
