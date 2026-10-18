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
        AppAction("page.duplicate", .page, "Duplicate Page", symbol: "doc.on.doc", keywords: "copy", enabled: onLivePage) { controller in
            if let id = controller.selection { controller.duplicate(id) }
        },
        AppAction("page.trash", .page, "Move Page to Trash", symbol: "trash", keywords: "delete remove",
                  shortcut: KeyboardShortcut(.delete), enabled: onLivePage) { controller in
            if let id = controller.selection { controller.trash(id) }
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
    ] + platformActions

    #if os(macOS)
    private static let platformActions = [
        AppAction("vault.reveal", .data, "Show Vault Folder in Finder", symbol: "folder") { $0.revealVault() },
    ]
    #else
    private static let platformActions: [AppAction] = []
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

    var body: some View {
        Button(action.label(controller), systemImage: action.symbol) { action.perform(controller) }
            .keyboardShortcut(action.shortcut)
            .disabled(!action.isEnabled(controller))
    }
}
