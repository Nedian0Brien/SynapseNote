# SynapseNote

macOS, iPadOS, iOS용 SwiftUI 노트 앱. [Morrow](https://github.com/Aarav2709/Morrow)의 기능을 옮겼다. SynapseNote-Native 저장소에서 만들었고, 2026-10-22에 이 저장소로 옮겨 기존 SynapseNote를 계승한다. 기존 SynapseNote(웹 편집기, CLI, 협업 서버, macOS 데스크톱 앱)는 [references/legacy/](references/legacy/)에 참고용으로 남겼다.

화면, 편집기, 데이터 계층 모두 Swift로 작성했다. Morrow의 TypeScript 코드는 앱에 들어가지 않고, `web/`의 도구가 그 코드를 돌려 Swift 이식과 비교할 자료를 만든다.

현재 상태: Morrow의 페이지·데이터베이스·캔버스·일간 노트·템플릿·검색·그래프·복습·기록·암호화·내보내기·가져오기·동기화를 앱에서 쓴다. 페이지는 노트 폴더(vault) 안의 Markdown 파일이고 Morrow·Obsidian vault와 호환된다. 검증 결과는 [docs/verification/](docs/verification/)에 있다.

## 필요한 것

- Xcode 27 이상 (iOS·macOS 26 SDK 포함)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)
- 비교 자료나 `App/Renderers`·`App/Emoji`·`App/Resources/WelcomeGuide.json`을 다시 만들 때만: Node.js 20.19 이상과 Morrow submodule

## 빌드

```sh
git clone <저장소 주소>
cd SynapseNote
xcodegen generate
open SynapseNote.xcodeproj
```

앱 빌드에는 node가 필요 없다. 앱이 쓰는 KaTeX·Mermaid·highlight.js(`App/Renderers`), 이모지(`App/Emoji`), 환영 안내(`App/Resources/WelcomeGuide.json`)는 저장소에 들어 있다.

### 비교 자료와 함께 넣은 파일 다시 만들기

```sh
git submodule update --init
npm --prefix web ci
npm --prefix web run core-fixtures      # 그 밖의 *-fixtures도 같다
npm --prefix web run guide-resource
npm --prefix web run vendor-renderers
npm --prefix web run vendor-emoji
```

### 시험 vault

`scripts/make-test-vault.sh <폴더>`가 Obsidian 형식의 시험 vault를 만든다. macOS 디버그 빌드는 `-SynapseNoteDebugVault <폴더>` 실행 인자로 파일 대화상자 없이 vault를 연다. 샌드박스가 허용하는 위치(예: `~/Library/Containers/com.synapsenote.native/Data/`)여야 한다.

## 검사

```sh
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
npm --prefix web run typecheck
npm --prefix web test
```

## 구조

| 경로 | 내용 |
|---|---|
| `App/Sources` | SwiftUI 앱과 편집기, vault 파일 시스템(`VaultFileSystem`, `VaultWatcher`, `VaultLocation`) |
| `App/Sources/Core` | Morrow `src/core`·`src/storage`의 Swift 이식: 명령, 세션, 저장 큐, vault 읽기·쓰기, Markdown, 질의, 내보내기 |
| `App/Tests` | Swift 단위 테스트, `Fixtures/core`는 `web/scripts`가 Morrow 코드로 만든 비교 자료 |
| `App/Renderers`, `App/Emoji`, `App/Resources` | 앱에 들어가는 KaTeX·Mermaid·highlight.js, 이모지, 환영 안내 |
| `web/vendor/morrow` | Morrow, git submodule, `a2daae1` 고정, 수정하지 않음 |
| `web/scripts` | 비교 자료와 위 파일을 만드는 도구 |
| `web/src` | 질의 답(`queries.ts`)과 환영 안내 문구의 시험 |
| `.intent` | 변경마다 남기는 intent, spec, plan |
| `references/legacy` | 기존 SynapseNote 전체(옮기기 전 `main` ddabafa6). 빌드·CI 대상이 아니다 |

## 보안 설정

- vault 파일 작업은 Morrow 데스크톱 셸과 같은 규칙을 따른다. vault 밖 경로와 심볼릭 링크로 나가는 쓰기를 거부하고, 페이지는 지우지 않고 휴지통으로 보내며, `.morrow/` 아래 파일만 직접 지운다.
- 수식·다이어그램은 화면 밖 `WKWebView`에서 앱 번들의 `App/Renderers`로 그리고, PDF는 앱이 만든 HTML을 같은 방식으로 인쇄한다. 그 웹 뷰가 읽는 vault 파일은 `synapse-vault://vault/`로만 받는다.
- macOS 엔타이틀먼트(`App/SynapseNote-macOS.entitlements`): App Sandbox, network client(동기화 요청과 WebKit 콘텐츠 프로세스 실행), network server(동기화), 사용자가 고른 파일 읽기·쓰기, 앱 범위 bookmark.
- vault 관리 파일은 Morrow와 같은 `.morrow/` 폴더에 둔다.
- 코드 서명은 개발 팀을 정하기 전까지 로컬 실행용(`-`)이다.

## 라이선스

이 저장소는 Apache License 2.0인 Morrow 코드를 포함한다. 출처와 바꾼 파일은 [NOTICE](NOTICE)에, Morrow 라이선스 전문은 [LICENSES/Morrow-Apache-2.0.txt](LICENSES/Morrow-Apache-2.0.txt)에 있다. 이 저장소 자체의 라이선스는 아직 정하지 않았다. `references/legacy/`의 기존 SynapseNote 코드는 [GPL-3.0](references/legacy/LICENSE)이다.
