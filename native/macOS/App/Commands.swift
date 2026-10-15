import AppKit
import SwiftUI

/// Menu bar commands. Editing commands go to the first responder (the
/// focused `SourceTextView`), so they act on the document being edited.
struct EditorCommands: Commands {
    @FocusedValue(\.newItemAction) private var newItem

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("새 문서") { newItem?(.document) }
                .keyboardShortcut("n")
                .disabled(newItem == nil)
            Button("새 폴더") { newItem?(.folder) }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .disabled(newItem == nil)
        }
        CommandGroup(after: .textEditing) {
            Button("찾기…") { Self.textFinder(.showFindInterface) }
                .keyboardShortcut("f")
            Button("찾아서 바꾸기…") { Self.textFinder(.showReplaceInterface) }
                .keyboardShortcut("f", modifiers: [.command, .option])
            Button("다음 찾기") { Self.textFinder(.nextMatch) }
                .keyboardShortcut("g")
            Button("이전 찾기") { Self.textFinder(.previousMatch) }
                .keyboardShortcut("g", modifiers: [.command, .shift])
        }
        CommandGroup(after: .toolbar) {
            Button("원문 보기") { Self.send(#selector(SourceTextView.toggleSourceView(_:))) }
                .keyboardShortcut("e", modifiers: [.command, .shift])
        }
        CommandMenu("서식") {
            Button("굵게") { Self.send(#selector(SourceTextView.toggleBoldMark(_:))) }.keyboardShortcut("b")
            Button("기울임") { Self.send(#selector(SourceTextView.toggleItalicMark(_:))) }.keyboardShortcut("i")
            Button("인라인 코드") { Self.send(#selector(SourceTextView.toggleCodeMark(_:))) }.keyboardShortcut("e")
            Button("취소선") { Self.send(#selector(SourceTextView.toggleStrikeMark(_:))) }.keyboardShortcut("x", modifiers: [.command, .shift])
            Button("강조") { Self.send(#selector(SourceTextView.toggleHighlightMark(_:))) }.keyboardShortcut("h", modifiers: [.command, .shift])
            Divider()
            Button("본문") { Self.send(#selector(SourceTextView.setParagraphBlock(_:))) }.keyboardShortcut("0", modifiers: [.command, .option])
            Button("제목 1") { Self.send(#selector(SourceTextView.setHeading1(_:))) }.keyboardShortcut("1", modifiers: [.command, .option])
            Button("제목 2") { Self.send(#selector(SourceTextView.setHeading2(_:))) }.keyboardShortcut("2", modifiers: [.command, .option])
            Button("제목 3") { Self.send(#selector(SourceTextView.setHeading3(_:))) }.keyboardShortcut("3", modifiers: [.command, .option])
            Button("제목 4") { Self.send(#selector(SourceTextView.setHeading4(_:))) }.keyboardShortcut("4", modifiers: [.command, .option])
            Button("제목 5") { Self.send(#selector(SourceTextView.setHeading5(_:))) }.keyboardShortcut("5", modifiers: [.command, .option])
            Button("제목 6") { Self.send(#selector(SourceTextView.setHeading6(_:))) }.keyboardShortcut("6", modifiers: [.command, .option])
            Divider()
            Button("번호 목록") { Self.send(#selector(SourceTextView.setOrderedList(_:))) }.keyboardShortcut("7", modifiers: [.command, .shift])
            Button("글머리표 목록") { Self.send(#selector(SourceTextView.setBulletList(_:))) }.keyboardShortcut("8", modifiers: [.command, .shift])
            Button("할 일 목록") { Self.send(#selector(SourceTextView.setTaskList(_:))) }.keyboardShortcut("9", modifiers: [.command, .shift])
            Button("인용") { Self.send(#selector(SourceTextView.setQuoteBlock(_:))) }.keyboardShortcut("b", modifiers: [.command, .shift])
            Button("코드 블록") { Self.send(#selector(SourceTextView.setCodeBlock(_:))) }.keyboardShortcut("c", modifiers: [.command, .option])
            Divider()
            Button("블록 위로 이동") { Self.send(#selector(SourceTextView.moveBlockUp(_:))) }.keyboardShortcut(.upArrow, modifiers: [.command, .shift])
            Button("블록 아래로 이동") { Self.send(#selector(SourceTextView.moveBlockDown(_:))) }.keyboardShortcut(.downArrow, modifiers: [.command, .shift])
        }
    }

    @MainActor static func send(_ action: Selector) {
        NSApp.sendAction(action, to: nil, from: nil)
    }

    @MainActor static func textFinder(_ action: NSTextFinder.Action) {
        let item = NSMenuItem()
        item.tag = action.rawValue
        NSApp.sendAction(#selector(NSResponder.performTextFinderAction(_:)), to: nil, from: item)
    }
}
