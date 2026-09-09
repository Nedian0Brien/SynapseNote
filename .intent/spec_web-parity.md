---
title: 웹에서도 로컬과 같은 제품이 되게 한다
slug: web-parity
stage: spec
status: accepted
intent: .intent/intent_web-parity.md
date: 2026-09-09
---

# 웹에서도 로컬과 같은 제품이 되게 한다 — 명세

## 요구사항

### P1 — 게이트가 이름대로 동작한다

- [ ] R1. `Origin` 헤더를 생략해서 `local-op` 계열 게이트를 통과하는 경로가 없다.
      지금 `POST /api/sync/trigger`가 토큰 + Origin 없음으로 202를 받는데, 이것이
      막힌다.
- [ ] R2. 로컬 정책에서 게이트 동작은 지금과 같다. 데스크톱 앱과 `bun run dev`가
      쓰는 요청(루프백 소켓, 루프백 Origin 또는 Origin 없음)은 계속 통과한다.
- [ ] R3. 원격 정책에서 게이트는 **계정 세션**을 요구한다. 사람이 비밀번호나
      패스키로 로그인해서 받은 쿠키만 통과한다.
- [ ] R4. 베어러 토큰은 통과하지 못한다. MCP 클라이언트와 CLI는 문서를 읽고 쓰는
      자격이지 운영자의 git과 GitHub 자격증명을 조종하는 자격이 아니다.
- [ ] R5. 액세스 토큰을 `/api/auth/session`으로 교환한 세션도 통과하지 못한다.
      그 세션의 주체는 토큰이지 사람이 아니다.
- [ ] R6. `AccessPrincipal`이 세션 주체를 구분해서 전달한다. 지금은 계정 세션과
      토큰 세션이 둘 다 `kind: 'session'`으로 뭉개진다.
- [ ] R7. 거절은 401이 아니라 403이다. 자격증명이 없는 것이 아니라 이 자격증명으로
      할 수 없는 일이다. 문제 유형은 새 URN 하나로 구분한다.

### P2 — 동기화

- [ ] R8. 원격 계정 세션으로 `GET /api/sync/status`와 `GET /api/sync/conflicts`가
      200을 반환한다.
- [ ] R9. `POST /api/sync/trigger`, `POST /api/sync/resolve-conflict`,
      `POST /api/sync/conflict-content`가 원격 계정 세션으로 동작한다.
- [ ] R10. 사이드바 충돌 섹션이 실제 목록을 표시한다. 충돌이 없으면 빈 상태를
      표시하고, 오류 배너는 없다.
- [ ] R11. 상단 sync 배지가 실제 상태를 표시한다.

### P3 — 프로젝트 준비

- [ ] R12. `GET /api/seed/packs`, `GET /api/seed/plan`, `POST /api/seed/apply`가
      원격 계정 세션으로 동작한다.
- [ ] R13. `skill/install-state`, `skill/install`, `installed-agents`가 원격
      계정 세션으로 동작한다.
- [ ] R14. 스타터 팩 적용과 스킬 설치가 웹에서 끝까지 된다.
- [ ] R14b. 공유·게시 5개(`share/*`)는 원격에서 계속 거절된다. GitHub 자격증명이
      없는 배포본에서는 열어도 실패한다 — 설계 절의 "배포본에는 GitHub 자격증명이
      없다" 참조.

### P4 — GitHub 읽기

- [ ] R15. `POST /api/local-op/auth/status`와 `POST /api/local-op/auth/repos`가
      원격 계정 세션으로 동작한다.
- [ ] R16. 설정 → 계정이 GitHub 연결 상태를 표시한다.
- [ ] R17. `login`·`signout`·`set-identity`는 원격에서 계속 거절된다. 이 서버의
      GitHub 자격증명을 원격에서 교체할 수 없다.

### P5 — 원격에서 성립하지 않는 것

- [ ] R18. 원격에서 403이 나는 버튼이 화면에 없다. 해당 컨트롤은 감추거나
      비활성화하고, 왜 없는지 한 줄로 적는다.
- [ ] R19. 대상: 에디터로 열기(`handoff`, `spawn-cursor`), 프로젝트 복제·초기화
      (`clone`, `ok-init`), GitHub 연결·해제, 임베딩 제공자 키, 에이전트 채팅.
- [ ] R20. 에이전트 채팅은 "이 서버에서는 아직 안 된다"고 말한다. 컨테이너에 CLI
      바이너리도 자격증명도 없다는 사실을 감추지 않는다.

### 전 구간

- [ ] R21. 기존 테스트가 그대로 통과한다. 공개 시그니처를 깨지 않는다.
- [ ] R22. `deploy/README.md`의 "Not covered here"가 실제와 맞는다.

## 설계

### 주체 구분을 `AccessPrincipal`까지 올린다 (R6)

`access-store.ts`의 `verify`는 이미 `sessionSubject(session)`로 계정 세션과 토큰
세션을 구분한다. 그런데 둘 다 `{ kind: 'session' }`으로 반환해서 그 구분이
호출자에게 도달하지 않는다.

`AccessPrincipal.kind`에 `'account-session'`을 더한다. 토큰에서 교환한 세션은
`'session'`으로 남는다. 세 갈래가 된다:

| 자격증명 | kind |
|---|---|
| 루프백 admission | `loopback` |
| 액세스 토큰(`Authorization: Bearer`) | `bearer` |
| 토큰에서 교환한 쿠키 | `session` |
| 비밀번호·패스키로 로그인한 쿠키 | `account-session` |

`kind`는 이미 로그에 실려 나가므로 새 값이 진단에도 그대로 도움이 된다.

### `checkLocalOpSecurity`를 정책 인지형으로 바꾼다 (R1~R5, R7)

지금 시그니처는 `(req, res, { handler })`이고 정책을 모른다. 그래서 원격이라는
사실을 알 수가 없다. `accessPolicy`와 해당 요청의 주체를 받도록 넓힌다.

- **로컬 정책**: 지금 그대로. 루프백 소켓 + 루프백 Origin(또는 부재).
- **원격 정책**: 소켓 검사와 Origin 검사를 **버린다.** 둘 다 배포 구성에서
  의미가 없다 — 소켓은 항상 프록시라 언제나 통과하고, Origin은 없으면 통과한다.
  대신 `kind === 'account-session'`을 요구한다.

원격에서 Origin을 버려도 CSRF는 열리지 않는다. 세션 쿠키가 `SameSite=Lax`라
교차 사이트 POST에 실리지 않고, 이건 `access-control.ts`의 `authorizeOrigin`
주석이 이미 밝혀둔 근거다.

주체는 admission 게이트가 이미 계산한다. `api-extension.ts`의 `onRequest`가
`authorizeRequest`의 결과를 핸들러까지 전달하도록 한다 — 지금은 통과 여부만
보고 버린다.

### 거절 유형 (R7)

`urn:ok:error:loopback-required`는 원격에서 사실이 아닌 이름이다. 원격 거절에는
새 URN을 쓴다. 코어의 `ProblemTypeSchema`는 닫힌 열거형이므로 거기에 추가하고
스키마 스냅샷을 다시 뜬다.

### 열 엔드포인트와 두는 엔드포인트

호출 지점은 **28곳**이다(핸들러 태그 기준 전수). 게이트 자체는 한 곳에서 바뀌고,
각 호출 지점은 어느 규칙을 요구할지만 정한다.

**계정 세션으로 여는 것 (15곳)**

| 계열 | 핸들러 | 단계 |
|---|---|---|
| 동기화 | `sync-status`, `sync-conflicts`, `sync-trigger`, `sync-resolve-conflict`, `sync-conflict-content` | P2 |
| 스타터 팩 | `seed-plan`, `seed-packs`, `seed-apply` | P3 |
| 스킬 | `install-skill`, `skill-install-state`, `installed-agents` | P3 |
| GitHub 읽기 | `local-op-auth-status`, `local-op-auth-repos` | P4 |
| 진단 | `client-logs` | P3 |

**원격에서 계속 거절하는 것 (13곳)**

| 핸들러 | 이유 |
|---|---|
| `handoff`, `spawn-cursor` | 서버 머신에서 프로세스를 띄운다. 원격에서 의미가 없다 |
| `local-op-clone`, `local-op-ok-init` | 원격은 워크스페이스 하나를 보는 창이다 |
| `local-op-auth-login`, `local-op-auth-signout`, `local-op-auth-set-identity` | 서버의 GitHub 자격증명을 바꾼다 |
| `local-op-embeddings-set-key`, `local-op-embeddings-clear-key` | 머신 전역 임베딩 제공자 키를 쓴다. 이 서버 하나가 아니라 그 머신의 모든 프로젝트에 걸린다 |
| `share-construct-url`, `share-target-status`, `share-publish-owners`, `share-publish-name-check`, `share-publish` | GitHub 저장소를 만들고 push하거나 `git fetch origin`을 돈다. 아래 "배포본에는 GitHub 자격증명이 없다" 참조 |

### 배포본에는 GitHub 자격증명이 없다

P3를 계획하다 확인한 사실이다. 실행 중인 컨테이너에서:

```
$HOME/.ok/          → logs/ 와 machine-id 뿐. auth.yml 없음
/workspace          → git remote 없음
```

CLI는 GitHub 토큰을 `$HOME/.ok/auth.yml`에 두는데 compose가 `/home/node`를
**tmpfs**로 마운트한다. 재시작하면 사라진다. 그리고 그 파일을 채우는 유일한
경로인 `local-op/auth/login`은 데스크톱 전용으로 두기로 했다.

따라서 웹에서 GitHub에 의존하는 기능은 **열어도 마지막 단계에서 실패한다.**
`share/publish`는 저장소를 만들고 push하다 실패하고, `share/target-status`는
`git fetch origin`에 실패한다. 실패하는 마법사를 여는 것은 닫아두고 이유를
적는 것보다 나쁘다.

`local-op/auth/status`는 예외다. "연결 안 됨"이 정직한 답이고, 화면이 왜
연결할 수 없는지 적을 근거가 된다. P4에서 연다.

이 제약을 없애려면 `/home/node`를 볼륨으로 지속시키고 원격 GitHub 로그인을
허용해야 한다. 그러면 이 서버가 원격 로그인으로 쓸 수 있는 GitHub 자격증명을
갖게 된다 — 별도 결정이고 이 spec의 범위 밖이다.

이 표가 P1의 산출물이다. 호출 지점마다 둘 중 하나를 명시적으로 고르게 하고,
**기본값을 두지 않는다** — 새 `local-op` 핸들러가 생겼을 때 아무 것도 안 적으면
컴파일이 실패하도록 한다. 28곳 중 하나를 조용히 빠뜨리는 것이 이 작업의 가장
큰 위험이다.

### UI (R18~R20)

앱이 원격인지 아는 방법이 필요하다. `/api/config` 응답에 접근 모드를 실어
보내는 것이 가장 싸다 — 이미 부팅 시 한 번 읽는 값이고 새 요청이 늘지 않는다.

## 버린 대안

**원격에서 `local-op`를 전부 여는 것.** 베어러 토큰까지 통과하게 되고, MCP
클라이언트가 운영자의 git을 돌릴 수 있다. 지금도 그렇게 되지만 그건 고칠 결함이지
따를 선례가 아니다.

**원격에서 Origin이 공개 오리진과 일치할 것을 요구하는 것.** 계정 세션 요구와
겹치는 방어이고, 앱이 상대 경로로 부르는 요청에는 Origin이 붙지만 서버가 보낸
헤더를 다시 믿는 구조라 새로 얻는 게 적다. `SameSite=Lax`가 같은 일을 더 확실히
한다.

**게이트를 그냥 지우고 admission 게이트에 맡기는 것.** 그러면 토큰 하나로 git
동기화까지 도달한다. 자격증명 종류마다 할 수 있는 일이 다르다는 것이 이 설계의
핵심이다.

**단계마다 별도 intent를 만드는 것.** 목표가 하나라 intent를 쪼개면 P1만 하고
멈췄을 때 그게 완료로 보인다. 단계는 intent 안의 표로 두고, plan을 단계별로
만든다.

## 함정

- **`checkLocalOpSecurity` 호출 지점은 28곳이다.** 처음 세었을 때 14개로 봤는데
  그건 UI 기능 단위였다. 공유 5개와 임베딩 키 2개가 빠져 있었다. 시그니처를
  넓히면 28곳을 전부 고쳐야 하고, 하나를 빠뜨리면 그 경로만 조용히 옛 규칙으로
  남는다. 그래서 새 인자에 기본값을 두지 않는다.
- **`AccessPrincipal.kind`는 닫힌 유니온이고 로그·테스트가 참조한다.** 값을
  더하면 그 값을 다루지 않는 `switch`가 컴파일 에러 없이 통과할 수 있다.
- **데스크톱 앱은 이 서버를 그대로 쓴다.** Electron 유틸리티 프로세스는 로컬
  정책으로 뜨므로 P1이 로컬 분기를 건드리면 데스크톱이 먼저 깨진다.
- **`/api/sync/trigger`는 실제로 git을 돌린다.** 원격에서 열면 원격 요청이
  운영자의 GitHub 토큰으로 push한다. 계정 세션 요구가 유일한 방어선이 된다.
- **스키마 스냅샷.** 새 URN을 넣으면 `bun run schema:dump`를 다시 돌려야 하고,
  안 돌리면 `check-schema-snapshot-clean.sh`가 잡는다.
- **원격 모드 실서버 없이는 재현되지 않는다.** 로컬에서 curl로 치면 소켓이
  루프백이라 게이트가 통과해 버린다. 확인에는 `Origin` 헤더를 반드시 붙인다.

## 완료 기준

각 단계는 자기 plan의 확인 절차를 갖는다. 전체 종료 조건은 P5까지다.

```
bun run --filter @nedian0brien/synapsenote-server test:unit
bun run --filter @nedian0brien/synapsenote-server test:contract
bun run --cwd packages/app test:dom
bash scripts/check-schema-snapshot-clean.sh
```

원격 모드 실서버에서, 배포판 브라우저와 같은 헤더로:

```
# 계정 세션 → 200
curl -H "Cookie: synapsenote_session=..." -H "Origin: https://<origin>" .../api/sync/conflicts

# 베어러 토큰 → 403 (지금은 202/200이 나온다)
curl -H "Authorization: Bearer <token>" -X POST .../api/sync/trigger

# Origin 생략으로도 → 403
curl -H "Authorization: Bearer <token>" -X POST .../api/sync/trigger
```

그리고 `https://synapse.lawdigest.kr`에서 오류 배너 없이 충돌 목록이 보이고,
403이 나는 버튼이 화면에 없다.
