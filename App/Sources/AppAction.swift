import SwiftUI

/// Something the app does, with its name and key, as an entry of Morrow's `ACTIONS`. Menus, the command
/// palette and the shortcut list read the same table, so they cannot disagree.
@MainActor
struct AppAction: Identifiable {
    enum Group: String, CaseIterable {
        case general = "General"
        case page = "Page"
        case view = "View"
        case data = "Data"
    }

    let id: String
    let group: Group
    let symbol: String
    /// Extra words the palette matches.
    let keywords: String
    let shortcut: KeyboardShortcut?
    private let name: @MainActor (EditorController) -> String
    private let enabled: @MainActor (EditorController) -> Bool
    private let action: @MainActor (EditorController) -> Void

    init(
        _ id: String, _ group: Group, symbol: String, keywords: String = "", shortcut: KeyboardShortcut? = nil,
        name: @escaping @MainActor (EditorController) -> String,
        enabled: @escaping @MainActor (EditorController) -> Bool = { $0.phase == .ready },
        perform: @escaping @MainActor (EditorController) -> Void
    ) {
        self.id = id
        self.group = group
        self.symbol = symbol
        self.keywords = keywords
        self.shortcut = shortcut
        self.name = name
        self.enabled = enabled
        action = perform
    }

    init(
        _ id: String, _ group: Group, _ label: String, symbol: String, keywords: String = "", shortcut: KeyboardShortcut? = nil,
        enabled: @escaping @MainActor (EditorController) -> Bool = { $0.phase == .ready },
        perform: @escaping @MainActor (EditorController) -> Void
    ) {
        self.init(id, group, symbol: symbol, keywords: keywords, shortcut: shortcut, name: { _ in label }, enabled: enabled, perform: perform)
    }

    func label(_ controller: EditorController) -> String { name(controller) }
    func isEnabled(_ controller: EditorController) -> Bool { enabled(controller) }
    func perform(_ controller: EditorController) {
        guard enabled(controller) else { return }
        action(controller)
    }

    static func named(_ id: String) -> AppAction {
        all.first { $0.id == id }!
    }

    /// A live page is on screen, one that commands for the page can change.
    private static func onLivePage(_ controller: EditorController) -> Bool {
        guard controller.phase == .ready, let id = controller.selection else { return false }
        return controller.workspace.isShowable(id)
    }

    static let all: [AppAction] = [
        AppAction("page.new", .general, "New Page", symbol: "square.and.pencil", keywords: "create add note",
                  shortcut: KeyboardShortcut("n")) { $0.createPage() },
        AppAction("page.newDatabase", .general, "New Database", symbol: "tablecells", keywords: "table board calendar gallery") {
            $0.createDatabase()
        },
        AppAction("page.newCanvas", .general, "New Canvas", symbol: "scribble", keywords: "whiteboard draw board") {
            $0.createCanvas()
        },
        AppAction("go.graph", .general, "Open Graph", symbol: "point.3.connected.trianglepath.dotted", keywords: "network links map",
                  shortcut: KeyboardShortcut("g", modifiers: [.command, .shift])) { $0.go(to: .graph(nil)) },
        AppAction("page.localGraph", .page, "Open Local Graph of This Page", symbol: "point.3.connected.trianglepath.dotted",
                  keywords: "network links", enabled: onLivePage) { controller in
            if let id = controller.selection { controller.go(to: .graph(id)) }
        },
        AppAction("page.newSubpage", .page, "New Subpage", symbol: "plus", keywords: "child create",
                  shortcut: KeyboardShortcut("n", modifiers: [.command, .option]), enabled: onLivePage) { controller in
            if let id = controller.selection { controller.createPage(parent: id) }
        },
        AppAction("search", .general, "Search", symbol: "magnifyingglass", keywords: "find pages palette commands",
                  shortcut: KeyboardShortcut("k")) { controller in
            Task { await controller.searchOrLink() }
        },
        AppAction("go.home", .general, "Go to Home", symbol: "house", shortcut: KeyboardShortcut("h", modifiers: [.command, .shift])) {
            $0.go(to: .home)
        },
        AppAction("go.trash", .general, "Go to Trash", symbol: "trash", keywords: "deleted restore") { $0.go(to: .trash) },
        AppAction("daily.today", .general, "Open Today’s Note", symbol: "calendar", keywords: "daily journal date",
                  shortcut: KeyboardShortcut("d", modifiers: [.command, .shift])) { $0.openToday() },
        AppAction("page.fromTemplate", .general, "New Page from Template…", symbol: "square.on.square.dashed", keywords: "template",
                  shortcut: KeyboardShortcut("t", modifiers: [.command, .option])) { $0.choosingTemplate = true },
        AppAction("go.templates", .general, "Go to Templates", symbol: "square.on.square.dashed", keywords: "template") { $0.openTemplates() },
        AppAction("go.tasks", .general, "Go to Tasks", symbol: "checklist", keywords: "todo checklist") { $0.go(to: .tasks) },
        AppAction("go.tags", .general, "Go to Tags", symbol: "number", keywords: "hashtag label") { $0.go(to: .tags) },
        AppAction("tab.new", .view, "New Tab", symbol: "plus.square.on.square", shortcut: KeyboardShortcut("t")) { $0.newTab() },
        // the last tab stays, as in morrow
        AppAction("tab.close", .view, "Close Tab", symbol: "xmark.square", shortcut: KeyboardShortcut("w"),
                  enabled: { $0.tabs.tabs.count > 1 }) { $0.closeTab() },
        AppAction("tab.duplicate", .view, "Open This Page in a New Tab", symbol: "plus.square.on.square",
                  enabled: onLivePage) { controller in
            if let id = controller.selection { controller.openInNewTab(.page(id)) }
        },
        AppAction("tab.next", .view, "Show Next Tab", symbol: "chevron.right.square",
                  shortcut: KeyboardShortcut(.tab, modifiers: .control), enabled: { $0.tabs.tabs.count > 1 }) { $0.stepTab(1) },
        AppAction("tab.previous", .view, "Show Previous Tab", symbol: "chevron.left.square",
                  shortcut: KeyboardShortcut(.tab, modifiers: [.control, .shift]), enabled: { $0.tabs.tabs.count > 1 }) { $0.stepTab(-1) },
        AppAction("page.favorite", .page, symbol: "star", keywords: "favourite star pin",
                  name: { controller in
                      controller.selection.flatMap { controller.workspace.infos[$0] }?.favorite == true
                          ? "Remove from Favorites" : "Add to Favorites"
                  },
                  enabled: onLivePage) { controller in
            guard let id = controller.selection, let page = controller.workspace.infos[id] else { return }
            controller.perform(.setFavorite(id: id, favorite: !page.favorite))
        },
        AppAction("page.find", .page, "Find in Page", symbol: "text.magnifyingglass", keywords: "replace",
                  shortcut: KeyboardShortcut("f"), enabled: onLivePage) { $0.findInPage() },
        AppAction("page.move", .page, "Move Page To…", symbol: "arrow.right.arrow.left", enabled: onLivePage) { controller in
            controller.movingPage = controller.selection
        },
        AppAction("page.saveTemplate", .page, "Save Page as Template", symbol: "square.on.square.dashed", keywords: "template",
                  enabled: { controller in
                      onLivePage(controller) && controller.selection.flatMap { controller.workspace.infos[$0] }?.kind == "page"
                  }) { controller in
            if let id = controller.selection { controller.saveAsTemplate(id) }
        },
        AppAction("page.history", .page, "Page History", symbol: "clock.arrow.circlepath", keywords: "versions restore undo",
                  enabled: { $0.phase == .ready && $0.selection != nil }) { controller in
            if let id = controller.selection { controller.openHistory(id) }
        },
        AppAction("page.encrypt", .page, "Encrypt with a Password…", symbol: "lock", keywords: "password protect secure",
                  enabled: { controller in
                      onLivePage(controller) && controller.selection.flatMap { controller.workspace.infos[$0] }.map { $0.kind == "page" && !$0.encrypted } == true
                  }) { $0.encryptingPage = $0.selection },
        AppAction("page.lock", .page, "Lock Page Now", symbol: "lock", keywords: "password encrypt",
                  enabled: { controller in
                      guard let id = controller.selection, let page = controller.workspace.infos[id] else { return false }
                      return page.encrypted && !controller.workspace.locked.contains(id)
                  }) { controller in
            if let id = controller.selection { controller.lock(id) }
        },
        AppAction("page.unprotect", .page, "Remove Encryption", symbol: "lock.open", keywords: "password decrypt",
                  enabled: { controller in
                      guard let id = controller.selection, let page = controller.workspace.infos[id] else { return false }
                      return page.encrypted && !controller.workspace.locked.contains(id)
                  }) { controller in
            if let id = controller.selection { controller.removeEncryption(id) }
        },
        AppAction("page.source", .page, symbol: "chevron.left.forwardslash.chevron.right", keywords: "markdown source code raw text",
                  name: { $0.sourceMode != nil && $0.sourceMode == $0.selection ? "Back to the Editor" : "Edit as Markdown" },
                  enabled: { controller in
                      guard onLivePage(controller), let id = controller.selection, let page = controller.workspace.infos[id] else { return false }
                      return page.kind == "page" && !controller.workspace.locked.contains(id)
                  }) { controller in
            guard let id = controller.selection else { return }
            controller.setSourceMode(controller.sourceMode == id ? nil : id)
        },
        AppAction("page.exportMarkdown", .page, "Export Page as Markdown…", symbol: "arrow.down.doc", keywords: "download md",
                  enabled: { $0.phase == .ready && $0.selection != nil }) { controller in
            if let id = controller.selection { controller.exportMarkdown(id) }
        },
        AppAction("page.exportPdf", .page, "Export Page as PDF…", symbol: "doc.richtext", keywords: "print pdf save document",
                  enabled: { controller in
                      guard controller.phase == .ready, !controller.exportingPDF, let id = controller.selection else { return false }
                      return controller.workspace.infos[id].map { $0.kind != "canvas" } == true
                  }) { controller in
            if let id = controller.selection { controller.exportPDF(id) }
        },
        AppAction("page.publish", .page, "Publish Page as a Website…", symbol: "globe", keywords: "site html export publish share static",
                  enabled: onLivePage) { controller in
            if let id = controller.selection { controller.publish(id) }
        },
        AppAction("go.review", .general, "Review Flashcards", symbol: "graduationcap", keywords: "flashcards study cards spaced",
                  shortcut: KeyboardShortcut("r", modifiers: [.command, .shift])) { $0.go(to: .review) },
        AppAction("page.duplicate", .page, "Duplicate Page", symbol: "doc.on.doc", keywords: "copy", enabled: onLivePage) { controller in
            if let id = controller.selection { controller.duplicate(id) }
        },
        AppAction("page.trash", .page, "Move Page to Trash", symbol: "trash", keywords: "delete remove",
                  shortcut: KeyboardShortcut(.delete), enabled: onLivePage) { controller in
            if let id = controller.selection { controller.trash(id) }
        },
        AppAction("data.importMarkdown", .data, "Import Markdown Files…", symbol: "arrow.up.doc", keywords: "md markdown notion zip") {
            $0.importMarkdown()
        },
        AppAction("data.exportAll", .data, "Export Everything as Markdown…", symbol: "archivebox", keywords: "zip download") { $0.exportAll() },
        AppAction("data.publish", .data, "Publish Everything as a Website…", symbol: "globe",
                  keywords: "site html export publish share static") { $0.publish(nil) },
        AppAction("data.backup", .data, "Save a Backup…", symbol: "externaldrive", keywords: "export json") { $0.backup() },
        AppAction("data.restore", .data, "Restore from a Backup…", symbol: "externaldrive.badge.plus", keywords: "import json") {
            $0.restoreBackup()
        },
        AppAction("data.deleteUnused", .data, "Delete Unused Files", symbol: "trash.slash", keywords: "attachments clean storage") {
            $0.deleteUnusedFiles()
        },
        AppAction("sync.settings", .data, "Sync Settings…", symbol: "arrow.triangle.2.circlepath", keywords: "pair devices network computers",
                  enabled: { _ in true }) { $0.showingSyncSettings = true },
        AppAction("sync.now", .data, "Sync Now", symbol: "arrow.triangle.2.circlepath", keywords: "pull devices",
                  enabled: { $0.phase == .ready && $0.sync.config.enabled && !$0.sync.peers.isEmpty && $0.sync.busyPeer == nil }) { controller in
            Task { await controller.sync.syncAll(quiet: false) }
        },
        AppAction("vault.open", .data, "Open Folder…", symbol: "folder", keywords: "vault switch another",
                  shortcut: KeyboardShortcut("o", modifiers: [.command, .shift]), enabled: { _ in true }) { $0.choosingFolder = true },
        // one name for both: on an iPad held upright the system shows and hides the sidebar by itself
        AppAction("view.sidebar", .view, "Show or Hide Sidebar", symbol: "sidebar.left",
                  shortcut: KeyboardShortcut("s", modifiers: [.command, .control]), enabled: { !$0.focusMode }) { controller in
            controller.sidebarHidden.toggle()
        },
        AppAction("view.inspector", .view, symbol: "sidebar.right", keywords: "outline backlinks links headings",
                  shortcut: KeyboardShortcut("i", modifiers: [.command, .option]),
                  name: { $0.showingInspector ? "Hide Inspector" : "Show Inspector" },
                  enabled: { onLivePage($0) && !$0.focusMode }) { controller in
            controller.showingInspector.toggle()
        },
        AppAction("view.focus", .view, symbol: "arrow.up.left.and.arrow.down.right", keywords: "distraction zen",
                  shortcut: KeyboardShortcut("f", modifiers: [.command, .shift]),
                  name: { $0.focusMode ? "Leave Focus Mode" : "Focus Mode" }) { controller in
            controller.focusMode.toggle()
        },
        AppAction("view.shortcuts", .view, "Keyboard Shortcuts", symbol: "keyboard", keywords: "keys help",
                  shortcut: KeyboardShortcut("/"), enabled: { _ in true }) { $0.showingShortcuts = true },
        // morrow's capture; before the vault is open the sheet waits for it
        AppAction("capture", .general, "Quick Note to Today", symbol: "square.and.pencil", keywords: "capture jot inbox quick note",
                  shortcut: KeyboardShortcut("m", modifiers: [.command, .option]),
                  enabled: { if case .choosing = $0.phase { false } else { true } }) { $0.requestQuickNote() },
        AppAction("view.theme", .view, "Switch Light or Dark Theme", symbol: "circle.lefthalf.filled", keywords: "dark mode appearance",
                  shortcut: KeyboardShortcut("l", modifiers: [.command, .shift]), enabled: { _ in true }) { $0.switchTheme() },
    ] + platformActions

    #if os(macOS)
    private static let platformActions = [
        // the settings window's own menu item has ⌘,; this one is for search
        AppAction("settings", .general, "Settings…", symbol: "gearshape", keywords: "preferences appearance theme font name",
                  enabled: { _ in true }) { $0.showingSettings = true },
        AppAction("vault.reveal", .data, "Show Vault Folder in Finder", symbol: "folder") { $0.revealVault() },
        AppAction("data.showBackups", .data, "Show Automatic Backups in Finder", symbol: "clock.arrow.circlepath",
                  keywords: "backup folder", enabled: { _ in true }) { _ in AutoBackup.reveal() },
    ]
    #else
    private static let platformActions = [
        AppAction("settings", .general, "Settings…", symbol: "gearshape", keywords: "preferences appearance theme font name",
                  shortcut: KeyboardShortcut(","), enabled: { _ in true }) { $0.showingSettings = true },
    ]
    #endif
}

extension KeyboardShortcut {
    /// The key as menus print it, such as ⇧⌘F.
    var label: String {
        var text = ""
        if modifiers.contains(.control) { text += "⌃" }
        if modifiers.contains(.option) { text += "⌥" }
        if modifiers.contains(.shift) { text += "⇧" }
        if modifiers.contains(.command) { text += "⌘" }
        switch key {
        case .tab: text += "⇥"
        case .delete: text += "⌫"
        case .return: text += "↩"
        case .escape: text += "⎋"
        default: text += String(key.character).uppercased()
        }
        return text
    }
}

/// Builds a menu item for an action from the table.
struct ActionButton: View {
    let action: AppAction
    let controller: EditorController
    /// False for a copy of a menu bar item, such as in the page menu over the page: the key belongs to the menu bar.
    var takesShortcut = true

    var body: some View {
        Button(action.label(controller), systemImage: action.symbol) { action.perform(controller) }
            .keyboardShortcut(takesShortcut ? action.shortcut : nil)
            .disabled(!action.isEnabled(controller))
    }
}

/// The open page's actions, Morrow's page menu: the Page menu of the menu bar, and the page menu button over the
/// page, which is the way to them on a touch screen.
struct PageActionItems: View {
    let controller: EditorController
    var takesShortcuts = true

    private func item(_ id: String) -> ActionButton {
        ActionButton(action: .named(id), controller: controller, takesShortcut: takesShortcuts)
    }

    var body: some View {
        item("page.find")
        item("page.favorite")
        item("page.duplicate")
        item("page.move")
        item("page.saveTemplate")
        item("page.history")
        item("page.encrypt")
        item("page.lock")
        item("page.unprotect")
        item("page.source")
        item("page.localGraph")
        Divider()
        item("page.exportMarkdown")
        item("page.exportPdf")
        item("page.publish")
        item("tab.duplicate")
        Divider()
        item("page.trash")
    }
}
