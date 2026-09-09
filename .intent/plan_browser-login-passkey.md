---
title: 브라우저 로그인 — 패스키와 비밀번호
slug: browser-login-passkey
stage: plan
status: accepted
intent: .intent/intent_browser-login-passkey.md
spec: .intent/spec_browser-login-passkey.md
date: 2026-09-09
---

# 브라우저 로그인 — 패스키와 비밀번호 — 구현 계획

## 바뀌는 파일

### 새로 만드는 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/auth/password-hash.ts` | scrypt 해시·검증. 파라미터를 레코드에 동봉 |
| `packages/server/src/auth/password-hash.test.ts` | 해시 왕복, 파라미터 이행, 타이밍 안전 비교 |
| `packages/server/src/auth/account-store.ts` | 계정 1개 + 패스키 목록. `accounts.json` |
| `packages/server/src/auth/account-store.test.ts` | 저장·재적재·손상 파일·패스키 CRUD |
| `packages/server/src/auth/login-throttle.ts` | 계정별 실패 카운터, 창·잠금 |
| `packages/server/src/auth/login-throttle.test.ts` | 임계·창 만료·잠금 해제 |
| `packages/server/src/webauthn/ceremony.ts` | @simplewebauthn 래핑 + 챌린지 저장소 |
| `packages/server/src/webauthn/ceremony.test.ts` | 챌린지 1회성·만료, 카운터 역행 거절 |
| `packages/server/src/api-auth-login.test.ts` | 로그인 라우트의 HTTP 동작 |
| `packages/server/src/auth/password-login.ts` | 비밀번호 검증 규칙 한 벌 (구현 중 추가) |
| `packages/cli/src/ui/read-password.ts` | 무에코 터미널 입력 (구현 중 추가) |
| `packages/cli/src/ui/read-password.test.ts` | 백스페이스·Ctrl-C·화살표·비TTY |
| `packages/cli/src/commands/access/account.ts` | `create` / `passwd` / `show` |
| `packages/cli/src/commands/access/account.test.ts` | 대화형 입력 주입, 중복 계정 거부 |
| `packages/app/src/lib/auth-login.ts` | 브라우저측 로그인·패스키 호출 |
| `packages/app/src/components/settings/PasskeySection.tsx` | 패스키 등록·삭제 |
| `packages/app/src/components/settings/PasskeySection.dom.test.tsx` | 등록·삭제·미지원 브라우저 |

### 고치는 것

| 파일 | 무엇을 |
|---|---|
| `packages/server/src/auth/access-store.ts` | `SessionRecord.subject` 도입, `tokenId` 하위호환 읽기 |
| `packages/server/src/auth/access-store.test.ts` | 옛 레코드 읽기 케이스 추가 |
| `packages/server/src/api-extension.ts` | 로그인 라우트 5개, 게이트 면제 경로 집합화 |
| `packages/server/src/api-auth-session.test.ts` | 면제 경로 변경 반영 |
| `packages/server/src/boot.ts` | 계정 저장소·챌린지 저장소·throttle 배선 |
| `packages/server/src/index.ts` | 새 모듈 export |
| `packages/server/src/oauth/http.ts` | 동의 화면 로그인 단계를 사용자명·비밀번호로 |
| `packages/server/src/oauth/http.test.ts` | 위 변경 반영 |
| `packages/app/src/components/SignInGate.tsx` | 토큰 칸 제거, 패스키+비밀번호 |
| `packages/app/src/components/SignInGate.dom.test.tsx` | 위 변경 반영 |
| `packages/app/src/lib/auth-session.ts` | `signIn(token)` 제거, 401 신호는 유지 |
| `packages/app/src/lib/client-fetch.ts` | 면제 경로 목록 반영 |
| `packages/app/src/components/settings/SettingsDialogBody.tsx` | 패스키 섹션 추가 |
| `packages/app/src/locales/*` | i18n 재추출 |
| `deploy/README.md` | 로그인 절차로 갱신 |
| `.changeset/remote-access-mode.md` | 로그인 항목 추가 |
| `THIRD_PARTY_NOTICES.md` | `bun run notices` |

## 작업 순서

각 단계 끝에 해당 테스트가 초록이어야 다음으로 간다.

1. **password-hash** — scrypt 해시·검증.
   확인: `bun test packages/server/src/auth/password-hash.test.ts`
2. **account-store** — 계정·패스키 레코드.
   확인: `bun test packages/server/src/auth/account-store.test.ts`
3. **access-store의 subject 확장** — 기존 세션 레코드가 그대로 읽히는지가 핵심.
   확인: `bun test packages/server/src/auth/access-store.test.ts` (기존 36건 + 신규)
4. **login-throttle** — 순수 함수.
   확인: `bun test packages/server/src/auth/login-throttle.test.ts`
5. **webauthn/ceremony** — 챌린지 저장소와 래핑.
   확인: `bun test packages/server/src/webauthn/ceremony.test.ts`
6. **api-extension 라우트 + 면제 경로** — 로그인 5개 엔드포인트.
   확인: `bun test packages/server/src/api-auth-login.test.ts packages/server/src/api-auth-session.test.ts`
7. **boot 배선** — 저장소들을 조립.
   확인: `bun run --filter @nedian0brien/synapsenote-server typecheck`
8. **CLI account 명령** — 대화형 입력.
   확인: `bun test packages/cli/src/commands/access/account.test.ts`
9. **OAuth 동의 화면 로그인 교체**.
   확인: `bun test packages/server/src/oauth/http.test.ts`
10. **SignInGate 교체 + 패스키 설정 섹션**.
    확인: `bun run --cwd packages/app test:dom src/components/SignInGate.dom.test.tsx src/components/settings/PasskeySection.dom.test.tsx`
11. **i18n 재추출, notices, changeset, 문서**.
    확인: `bash scripts/check-i18n-drift.sh`, `bash scripts/check-notices-clean.sh`
12. **실제 서버로 확인** — 아래 검증 절 참조.

## 가장 위험한 단계

**3단계, `SessionRecord`의 subject 확장.** 지금 배포된 서버의 `access.json`에 세션
레코드가 살아 있고, 그 형태를 바꾼다. 잘못하면 운영자가 로그아웃되고 — 더 나쁘게는 —
`verify`가 옛 레코드에서 주체를 못 찾아 조용히 `null`을 돌려 모든 세션이 죽는다.

방어: 읽기는 `subject ?? {kind:'token', id: tokenId}`로 폴백한다. 쓰기는 새 형태로만
한다. 옛 형태 JSON을 직접 넣고 읽히는지 확인하는 테스트를 3단계에 포함한다.

되돌리기: 이 단계는 단일 커밋으로 남긴다. `git revert` 한 번으로 되돌아간다. 배포본은
컨테이너 이미지를 이전 태그로 되돌리면 되고, `access.json`은 새 필드가 추가만 되므로
옛 코드가 읽어도 무시한다.

**두 번째 위험: 게이트 면제 경로 확대(6단계).** 면제를 넓히다 실수하면 인증 없이 닿는
경로가 늘어난다. 면제 목록을 상수 집합으로 두고, "면제 목록에 없는 `/api/auth/*` 경로는
401"을 확인하는 테스트를 같이 넣는다.

## 구현 중 계획과 달라진 것

**`auth/password-login.ts`를 새로 뺐다.** `/api/auth/password`와 OAuth 동의
화면이 같은 비밀번호 규칙을 써야 하는데, 계획은 각자 구현하는 모양이었다. 두 벌이
되면 한쪽만 계정 존재를 흘리는 식으로 갈라지기 쉬운 부분이라 — 균일한 거절, 없는
사용자명에도 소비하는 해시 한 번, 비교보다 먼저 도는 스로틀 — 규칙을 한 곳에 두고
둘 다 부른다. 실서버에서 API로 10번 실패시킨 뒤 동의 화면이 429를 주는 것으로
확인했다.

**`ui/read-password.ts`를 CLI 쪽에 새로 만들었다.** 계획은 "대화형으로 두 번
받는다"까지만 적었고, readline에 마스킹 모드가 없다는 점은 구현에서 드러났다.
raw 모드로 키를 직접 모으고, 화살표가 보내는 이스케이프 시퀀스를 상태 기계로
걸러낸다.

**R29의 "계정이 없으면 로그인 화면이 그렇게 말한다"는 항상 보이는 안내문으로
했다.** 계정 유무를 알려주는 미인증 엔드포인트를 새로 두면 "이 서버는 아직
설정 전"이라는 사실이 인터넷에 노출된다. 대신 로그인 화면과 동의 화면 모두
`synapsenote access account create <username>` 를 상시 표시한다.

## 검증

### 자동

```
bun test packages/server/src/auth/ packages/server/src/webauthn/
bun test packages/server/src/api-auth-login.test.ts packages/server/src/api-auth-session.test.ts
bun test packages/server/src/oauth/
bun test packages/cli/src/commands/access/
bun run --cwd packages/app test:dom src/components/SignInGate.dom.test.tsx src/components/settings/PasskeySection.dom.test.tsx
bun run --filter @nedian0brien/synapsenote-server test:unit
bun run --filter @nedian0brien/synapsenote-server test:contract
bash scripts/check-i18n-drift.sh
bash scripts/check-notices-clean.sh
```

### 로컬 실서버

원격 모드로 띄우고 수용 기준을 순서대로 확인한다. A1·A2·A3·A4·A10·A11은 curl로,
A5·A7·A8은 테스트로 덮는다.

```
OK_ACCESS_MODE=remote OK_PUBLIC_ORIGIN=... OK_TRUSTED_PROXY_HOPS=1 \
  bun packages/cli/src/cli.ts start --port 8892 --react-shell-dist-dir packages/app/dist
```

### 브라우저 (A6·A9·R21·R24)

패스키는 실제 인증기가 필요해 curl로 확인할 수 없다. 배포 후 사용자가 직접 확인한다.

1. `https://synapse.lawdigest.kr` 접속 → 로그인 화면에 토큰 칸이 없고 패스키 버튼과
   비밀번호 폼이 보인다
2. 사용자명·비밀번호로 로그인 → 워크스페이스 진입
3. 설정 → 패스키 등록 → Touch ID 프롬프트 → 등록됨
4. 로그아웃 후 패스키 버튼 → Face ID·Touch ID로 진입
5. 설정에서 패스키 삭제 → 목록에서 사라짐

이 다섯 가지는 제가 대신할 수 없다. 배포 후 확인을 요청한다.

## 배포

구현이 끝나면 오라클 호스트에 반영하고, 계정 생성은 사용자가 직접 한 줄 실행한다.

```
docker compose -f deploy/compose.yml exec synapsenote \
  node /app/dist/cli.mjs access account create libera3920
```

비밀번호는 이 명령이 대화형으로 받는다. 인자로 넘기지 않는다.
