# SynapseNote-Native

macOS, iPadOS, iOS용 SwiftUI 노트 앱. [Morrow](https://github.com/Aarav2709/Morrow)의 기능을 옮기며, 완성되면 기존 SynapseNote를 계승한다.

블록 에디터는 Morrow의 TipTap 에디터를 그대로 쓰고 SwiftUI `WebView`(iOS·macOS 26 이상) 안에서 띄운다. 나머지 화면과 데이터 계층은 Swift로 작성한다.

현재 상태: 노트 폴더(vault)를 열어 페이지를 읽고, 편집하고, 새로 만들고, 휴지통으로 보낼 수 있다. 페이지는 폴더 안의 Markdown 파일이고 Morrow·Obsidian vault와 호환된다. 저장 계층은 Morrow의 TS 코드를 그대로 쓰고, 파일 입출력은 Swift가 맡는다. 검증 결과는 [docs/verification/](docs/verification/)에 있다.

## 필요한 것

- Xcode 27 이상 (iOS·macOS 26 SDK 포함)
- Node.js 20.19 이상
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)

## 빌드

```sh
git clone --recurse-submodules <저장소 주소>
cd SynapseNote-Native
npm --prefix web ci
xcodegen generate
open SynapseNote.xcodeproj
```

이미 클론했다면 `git submodule update --init`으로 Morrow를 받는다.

Xcode 빌드의 첫 단계(`scripts/build-editor.sh`)가 `web/`을 빌드해 `App/Resources/Editor/`에 에디터 번들을 만든다. `web/`이나 Morrow 소스가 바뀌었을 때만 다시 빌드한다.

### 시험 vault

`scripts/make-test-vault.sh <폴더>`가 Obsidian 형식의 시험 vault를 만든다. macOS 디버그 빌드는 `-SynapseNoteDebugVault <폴더>` 실행 인자로 파일 대화상자 없이 vault를 연다. 샌드박스가 허용하는 위치(예: `~/Library/Containers/com.synapsenote.native/Data/`)여야 한다.

## 검사

```sh
npm --prefix web run typecheck
npm --prefix web test
xcodebuild -scheme SynapseNote -destination 'platform=macOS' test
```

## 구조

| 경로 | 내용 |
|---|---|
| `App/Sources` | SwiftUI 앱, `WebPage` 브리지, vault 파일 시스템(`VaultFileSystem`, `VaultWatcher`, `VaultLocation`), URL 스킴 핸들러 |
| `App/Tests` | Swift 단위 테스트 |
| `web/vendor/morrow` | Morrow, git submodule, `a2daae1` 고정, 수정하지 않음 |
| `web/src` | 에디터 진입점과 JS 쪽 브리지 |
| `web/src/host` | Morrow 앱 모듈 중 Electron·Morrow 상태에 묶인 것을 대신하는 모듈. `web/vite.config.ts`가 빌드할 때 바꿔 끼운다 |
| `.intent` | 변경마다 남기는 intent, spec, plan |

## 보안 설정

- 에디터 페이지는 `synapse-editor://app/`에서 앱 번들 안의 파일을, `synapse-vault://vault/`에서 열린 vault의 파일만 읽는다. Content-Security-Policy와 navigation decider가 원격 요청과 다른 주소로의 이동을 막는다.
- vault 파일 작업은 Morrow 데스크톱 셸과 같은 규칙을 따른다. vault 밖 경로와 심볼릭 링크로 나가는 쓰기를 거부하고, 페이지는 지우지 않고 휴지통으로 보내며, `.morrow/` 아래 파일만 직접 지운다.
- macOS 엔타이틀먼트(`App/SynapseNote-macOS.entitlements`): App Sandbox, network client(WebKit 콘텐츠 프로세스 실행에 필요, 에디터 페이지는 원격 리소스를 읽지 않음), 사용자가 고른 파일 읽기·쓰기, 앱 범위 bookmark.
- vault 관리 파일은 Morrow와 같은 `.morrow/` 폴더에 둔다.
- 코드 서명은 개발 팀을 정하기 전까지 로컬 실행용(`-`)이다.

## 라이선스

이 저장소는 Apache License 2.0인 Morrow 코드를 포함한다. 출처와 바꾼 파일은 [NOTICE](NOTICE)에, Morrow 라이선스 전문은 [LICENSES/Morrow-Apache-2.0.txt](LICENSES/Morrow-Apache-2.0.txt)에 있다. 이 저장소 자체의 라이선스는 아직 정하지 않았다.
