# App Store 등록 초안

App Store Connect에 넣을 글의 초안이다. 앱 화면이 영어이므로 영어로 쓴다. 등록할 때 사용자가 고친다.

## 기본 정보

- 이름: SynapseNote
- 부제(30자 이내): Notes that stay in your folder
- 분류: Productivity (Info.plist `LSApplicationCategoryType`과 같음)
- 플랫폼: iPhone, iPad, Mac (bundle ID 하나, Universal Purchase)
- 최소 OS: iOS·iPadOS 26, macOS 26
- 연령 등급: 4+ (사용자 글만 다루고, 앱이 고른 웹 내용이 없다)

## 설명

SynapseNote is a calm place to write, plan and keep what you know. Every page is a plain Markdown file in a folder you choose, so your notes stay yours.

- Write with headings, checklists, tables, columns, callouts, code, maths and diagrams. Type / for any block.
- Link pages with [[ ]], mention dates with @, and see every connection in the graph.
- Keep a daily note, collect tasks from every page, and start pages from templates.
- Build databases with table, board, calendar, list and gallery views, relations and formulas.
- Sketch on an endless canvas of cards, pages and freehand ink.
- Turn any line into a flashcard and review what is due.
- Lock a page with a password. Look back through every version of a page.
- Sync your own iPhone, iPad and Mac directly over your network, encrypted, with no server in between.
- Import Markdown, export a page as PDF or a whole vault as Markdown, or publish pages as a small website.

No account, no subscription, no ads, no tracking and no AI. Nothing you write is sent anywhere.

## 키워드(100자 이내)

notes,markdown,journal,daily,tasks,database,canvas,wiki,links,vault,offline,private,sync,flashcards

## 개인정보 라벨

- Data Not Collected(수집하는 데이터 없음). 앱에 계정, 분석, 광고, 추적이 없다. 근거: `App/PrivacyInfo.xcprivacy`.
- 네트워크를 쓰는 경우는 두 가지이고 모두 사용자가 시작한다: 같은 네트워크의 자기 기기와 동기화(암호화, 서버 없음), 페이지 안 웹 그림의 Load image.

## App Review 메모

- No account or sign in is needed. Open the app, choose "New Folder on This Device" (iPhone, iPad) or pick any folder (Mac). A first-run guide is added to an empty folder and shows every feature.
- Local network: the permission prompt appears when sync is turned on in Settings > Sync. Sync works between two devices with SynapseNote on the same network: turn on sync on both, choose Pair a Device on one, and type the code it shows on the other. No server is involved.
- `synapsenote://capture` and the "Quick Note" shortcut open a quick note that is added to today's note.
- Encrypted pages use a password the person chooses; there is no recovery and no server copy.

## 스크린샷

TestFlight 빌드가 나온 뒤 실기기에서 찍는다. 크기는 App Store Connect가 요구하는 iPhone 6.9형, iPad 13형, Mac 화면을 따른다.
