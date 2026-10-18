# 1단계 페이지 관리 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/page-management`
- 환경: Xcode 27.0, macOS 27, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5), iPhone 17 Pro Max)
- 시험 vault: `scripts/make-test-vault.sh`. 앱 컨테이너 안에서만 시험했다. 파일 위치와 `.morrow/workspace.json`으로 결과를 확인했다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` / `build` | 통과(웹 테스트 15개) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 38개. Morrow `core/tree.ts`와 같은 형제 순서·유효 부모·휴지통 판정·드롭 위치, Morrow 명령 형식, 이모지 파일 이름 규칙(`emojiSrc`), 번들 이모지 목록 |
| macOS, iPad, iPhone 빌드 | 통과 |

## 기능

| 항목 | iPadOS | iPhone | macOS | 확인 방법 · 비고 |
|---|---|---|---|---|
| 펼치기·접기 | 통과 | 미확인 | 미확인 | Projects 화살표로 Launch 표시 |
| 즐겨찾기 | 통과 | 미확인 | 미확인 | 행 메뉴 → `workspace.json`에 `favorite: true`, 즐겨찾기 섹션 표시. 휴지통에 보내면 섹션에서 빠지고, 복원하면 즐겨찾기 상태로 돌아옴 |
| 아이콘 | 통과 | 미확인 | 미확인 | 이모지 선택 화면(Fluent 그림, 그룹 탭, 검색) → frontmatter `icon: 😀`, 사이드바와 페이지 머리에 같은 그림 |
| 복제 | 통과 | 미확인 | 미확인 | `Reading notes (copy).md` 생성, 바로 선택 |
| Move To… | 통과 | 미확인 | 미확인 | 파일이 `Projects/` 아래로 이동. 옮길 수 없는 대상은 목록에서 빠짐 |
| 드래그 앤 드롭 | 미확인 | 미확인 | 미확인 | 시뮬레이터 합성 터치와 macOS 합성 드래그로는 드래그 세션이 시작되지 않았다. 위치 계산은 단위 테스트로만 확인 |
| 휴지통 보내기·화면·복원 | 통과 | 통과(화면 이동) | 미확인 | 복원하면 원래 자리로 돌아오고 `.trash` 정리 |
| 영구 삭제 | 통과 | 미확인 | 미확인 | 버튼 위치에 확인 대화상자. iPad: `.morrow/deleted/<시각>-Reading notes.md`로 보관, 레지스트리 항목 제거 |
| 휴지통 비우기 | 미확인 | 미확인 | 미확인 | 영구 삭제와 같은 경로(`trash.empty`) |
| Finder에서 보기 | 해당 없음 | 해당 없음 | 미확인 | 행 메뉴는 우클릭이 필요해 자동 조작하지 못했다 |
| vault 전환·최근 목록 | 미확인 | 미확인 | 미확인 | 폴더 선택 대화상자를 자동 조작할 수 없다 |
| 웹 프로세스 종료 복구 | 통과 | 미확인 | 미확인 | iPad: 앱의 WebContent 프로세스를 강제 종료 → "process ended, reopening the vault" → 편집기와 vault 다시 열림, 같은 페이지 표시 |

## 구현 중 발견하고 고친 것

1. **영구 삭제가 멈추고 이후 저장도 모두 멈춤**: `FileManager.trashItem`을 파일 조정 블록 안에서 부르자 iOS 27에서 돌아오지 않았다. vault 작업은 하나씩 처리하므로 이후 저장도 멈췄다. 조정 밖에서 부르게 고쳤다.
2. **iOS에서 삭제한 파일이 사라짐**: iOS의 `trashItem`은 시뮬레이터 어디에서도 찾을 수 없게 파일을 없앴다. iOS·iPadOS는 시스템 휴지통이 없는 것으로 보고 vault의 `.morrow/deleted/`에 보관한다(Morrow의 대체 동작과 같음). macOS는 Finder 휴지통을 쓴다.
3. **iPhone에서 휴지통으로 넘어가지 않음**: 사이드바 선택값을 페이지·휴지통 열거형으로 바꿨다.
4. 휴지통 시각이 "in 0 seconds"로 보이던 문제, iPad 확인 대화상자 위치, iOS에서 저장 상태 표시와 편집기 토스트가 겹치던 문제를 고쳤다.

## 사용자 확인 요청

1. macOS 사이드바에서 페이지를 끌어 다른 페이지 위(앞)·가운데(안)·아래(뒤)에 놓아 보고, Finder에서 파일 위치가 맞는지 본다.
2. macOS 행 우클릭 → Show in Finder.
3. File > Open Folder…로 다른 vault를 열고, File > Open Recent로 앞 vault로 돌아온다.
4. 휴지통 비우기 → Finder 휴지통에 파일이 들어갔는지 본다.
