# Spec: 6단계 페이지 히스토리·암호화 페이지·플래시카드

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- 히스토리: `core/history.ts`, `core/diff.ts`, `app/components/HistoryDialog.tsx`, `operations.ts`(`restoreVersion`)
- 암호화: `core/crypto.ts`, `storage/session.ts`(`protectPage`, `unprotectPage`, `unlockPage`, `lockPage`), `EncryptDialog.tsx`(`EncryptDialog`, `LockedPage`), `pageMenu.ts`
- 플래시카드: `core/flashcards.ts`, `app/review.ts`, `ReviewView.tsx`

## 설계 결정

- **히스토리 대화상자는 웹에서 쓴다.** 각 버전 미리보기는 편집기 확장으로 문서를 그리고, 줄 단위 비교와 복원도 TS 코어에 있다. 페이지 본문을 보는 화면이므로 4·5단계와 같은 근거로 편집기 WebView에서 연다.
- **암호 입력은 SwiftUI로 만든다.**
  - 시스템 보안 입력 칸(SecureField)과 비밀번호 자동 완성 규칙을 따르려는 것이다.
  - 암호화와 해제는 Morrow 세션 API가 하고, Swift는 결과(성공 또는 오류 문구)를 받는다.
  - WebCrypto는 편집기 페이지에서 쓸 수 있다. 시뮬레이터에서 `isSecureContext`와 `crypto.subtle`이 모두 true임을 확인했다.
- **플래시카드 복습은 SwiftUI로 만든다.** 홈·작업처럼 페이지 밖의 앱 화면이다. 카드 수집, 마감 계산, SM-2 일정은 TS 코어 함수를 쓴다.
- **복습 기록 저장**: Morrow `app/review.ts`는 채점 0.8초 뒤에 `.morrow/review.json`을 쓰는데, 앱을 그 사이에 끄면 기록이 빠진다. 같은 코어 함수(`readReviewLog`, `schedule`, `writeReviewLog`)를 쓰는 `web/src/review.ts`를 두고, 앱 종료 전 저장(flush)에 포함한다.

## 요구사항

1. **페이지 히스토리**
   - 페이지 메뉴와 동작 표의 "Page History"로 연다(Morrow `page.history`).
   - Morrow `HistoryDialog`가 버전 목록, 미리보기, 비교를 보여 주고 버전을 복원한다.
2. **암호화**
   - 일반 페이지의 메뉴에 "Encrypt with a Password…"를 둔다. 시트에 암호 두 칸을 두고, 8자 미만이거나 두 칸이 다르면 안내하고 막는다. 잊으면 복구할 수 없다는 경고를 보여 준다. 성공하면 Morrow 안내를 보여 준다.
   - 잠금이 풀린 암호화 페이지에는 "Lock Now"와 "Remove Encryption"을 둔다(Morrow와 같음).
   - 잠긴 페이지를 열면 본문 자리에 암호 입력 화면을 보여 준다. 틀리면 Morrow 오류 문구를 보여 주고 칸을 비운다.
   - 워크스페이스 메시지에 잠긴(읽을 수 없는) 페이지 목록을 더한다.
   - 사이드바와 탭에서 암호화된 페이지는 자물쇠 아이콘으로 보인다(4단계에서 추가함).
3. **플래시카드**
   - `질문 :: 답` 줄이 카드가 된다(Morrow 규칙).
   - 복습 화면
     - 마감 카드 수, 오늘 복습한 수, 전체 카드 수
     - 카드 앞면 → Show Answer(Space) → 뒷면 → Again·Hard·Good·Easy(1~4)
     - Again은 이번 복습 끝에 다시 나온다. 복습 목록은 시작할 때 정해진다.
     - "From 페이지"를 누르면 카드 앞면을 찾을 문자열로 해서 그 페이지를 연다.
     - 카드가 없을 때와 모두 끝났을 때 Morrow 안내를 보여 준다.
   - 사이드바 Review 행에 마감 수를 표시한다. 동작 표에 Review Flashcards를 둔다(Morrow `go.review`).
   - 목적지 `review`를 추가한다.

## 받아들이는 기준

- 웹·Swift 테스트가 통과한다. 복습 조회, 채점 저장과 flush, 새 메시지, 잠긴 페이지 목록 디코딩을 테스트한다.
- 시뮬레이터와 macOS에서 다음을 조작하고 vault 파일로 결과를 확인해 `docs/verification/phase6-history-encryption-review.md`에 기록한다.
  - 히스토리 대화상자, 버전 복원
  - 암호화(파일이 암호문인지), 잠그기·풀기, 틀린 암호, 암호화 해제(파일이 평문인지)
  - 카드 복습, `.morrow/review.json`
- 시험 암호는 테스트 값만 쓰고, 문서와 보고에 적지 않는다.

## 범위 밖

- Markdown 소스 편집(Edit as Markdown): 7단계
