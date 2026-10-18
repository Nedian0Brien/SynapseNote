import Foundation

/// A place the main column shows.
nonisolated enum Destination: Hashable, Codable, Sendable {
    case home
    case page(String)
    case trash
    case tasks
    case tags
    /// The pages with one tag.
    case tag(String)
    /// The graph of pages, or of the pages near one.
    case graph(String?)
    /// Flashcards due for review.
    case review

    var pageId: String? {
        if case .page(let id) = self { id } else { nil }
    }
}

/// Tabs that each remember a place, as Morrow's `src/app/tabs.ts`: the open tab follows wherever you go.
nonisolated struct TabList: Hashable, Codable, Sendable {
    struct Tab: Hashable, Codable, Sendable, Identifiable {
        let id: String
        var destination: Destination
    }

    static let limit = 20

    private(set) var tabs: [Tab]
    private(set) var activeId: String

    init(_ destination: Destination = .home) {
        let tab = Tab(id: Self.newId(), destination: destination)
        tabs = [tab]
        activeId = tab.id
    }

    private static func newId() -> String { UUID().uuidString.lowercased() }

    var active: Tab { tabs.first { $0.id == activeId } ?? tabs[0] }

    var activeIndex: Int { tabs.firstIndex { $0.id == activeId } ?? 0 }

    /// The open tab goes somewhere else.
    mutating func navigate(to destination: Destination) {
        tabs[activeIndex].destination = destination
    }

    /// A new tab right after the open one, made the open one. With as many tabs as allowed the open tab
    /// goes there instead.
    mutating func open(_ destination: Destination) {
        guard tabs.count < Self.limit else {
            navigate(to: destination)
            return
        }
        let tab = Tab(id: Self.newId(), destination: destination)
        tabs.insert(tab, at: activeIndex + 1)
        activeId = tab.id
    }

    mutating func activate(_ id: String) {
        if tabs.contains(where: { $0.id == id }) { activeId = id }
    }

    /// Closes a tab, the open one when none is named. The last tab stays. Closing the open tab opens the
    /// one that takes its place, or the one before when it was last.
    @discardableResult
    mutating func close(_ id: String? = nil) -> Bool {
        let id = id ?? activeId
        guard tabs.count > 1, let index = tabs.firstIndex(where: { $0.id == id }) else { return false }
        tabs.remove(at: index)
        if id == activeId { activeId = tabs[min(index, tabs.count - 1)].id }
        return true
    }

    /// The next or previous tab, wrapping around.
    mutating func step(_ direction: Int) {
        guard tabs.count > 1 else { return }
        let count = tabs.count
        activeId = tabs[((activeIndex + direction) % count + count) % count].id
    }

    /// Puts a tab at a position, counted as if it were not in the list.
    mutating func move(_ id: String, to position: Int) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let tab = tabs.remove(at: index)
        tabs.insert(tab, at: max(0, min(tabs.count, position)))
    }

    /// Tabs remembered from an earlier launch, checked as Morrow's `load`: unreadable data gives nil.
    static func restore(_ data: Data?) -> TabList? {
        guard let data, var list = try? JSONDecoder().decode(TabList.self, from: data) else { return nil }
        list.tabs = Array(list.tabs.prefix(limit))
        guard !list.tabs.isEmpty else { return nil }
        if !list.tabs.contains(where: { $0.id == list.activeId }) { list.activeId = list.tabs[0].id }
        return list
    }
}
