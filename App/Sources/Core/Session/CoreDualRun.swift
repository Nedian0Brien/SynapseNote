import Foundation

/// The debug check of 11c-2: the editor page applies every command itself and sends it to the Swift session, which
/// owns the vault. Both must hold the same workspace; the page's copy (StateMirror, from its state deltas) is
/// compared with the session page by page and document by document.
nonisolated enum CoreDualRun {
    struct Report: Sendable {
        var pages = 0
        var docs = 0
        var differences: [String] = []
    }

    static func compare(session: WorkspaceState, unreadable: JSSet, web: WorkspaceState, webUnreadable: JSSet) -> Report {
        var report = Report(pages: session.pages.count, docs: session.docs.count)
        func note(_ text: String) { report.differences.append(text) }

        for id in session.pages.keys where !web.pages.has(id) { note("page \(id) only in Swift") }
        for id in web.pages.keys where !session.pages.has(id) { note("page \(id) only in the web") }
        for (id, page) in session.pages {
            guard let other = web.pages[id], let mine = page.json.object, let theirs = other.json.object else { continue }
            for key in mine.keys where !same(mine[key], theirs[key]) {
                note("page \(id) \(key): Swift \(describe(mine[key])), web \(describe(theirs[key]))")
            }
        }
        for id in session.docs.keys where !web.docs.has(id) { note("doc \(id) only in Swift") }
        for id in web.docs.keys where !session.docs.has(id) { note("doc \(id) only in the web") }
        for (id, doc) in session.docs {
            guard let other = web.docs[id] else { continue }
            if let path = firstDifference(.object(doc), .object(other), at: "") { note("doc \(id) differs at \(path)") }
        }
        for id in unreadable where !webUnreadable.has(id) { note("page \(id) unreadable only in Swift") }
        for id in webUnreadable where !unreadable.has(id) { note("page \(id) unreadable only in the web") }
        return report
    }

    /// Equal JSON values whatever the order of their keys.
    private static func same(_ a: JSValue?, _ b: JSValue?) -> Bool {
        switch (a, b) {
        case (nil, nil): return true
        case (let a?, let b?): return firstDifference(a, b, at: "") == nil
        default: return false
        }
    }

    private static func firstDifference(_ a: JSValue, _ b: JSValue, at path: String) -> String? {
        switch (a, b) {
        case (.object(let x), .object(let y)):
            for key in x.keys where !y.has(key) { return "\(path)/\(key)" }
            for key in y.keys where !x.has(key) { return "\(path)/\(key)" }
            for (key, value) in x { if let found = firstDifference(value, y[key]!, at: "\(path)/\(key)") { return found } }
            return nil
        case (.array(let x), .array(let y)):
            if x.count != y.count { return "\(path) (\(x.count) vs \(y.count) items)" }
            for (index, pair) in zip(x, y).enumerated() {
                if let found = firstDifference(pair.0, pair.1, at: "\(path)/\(index)") { return found }
            }
            return nil
        default:
            return a == b ? nil : path.isEmpty ? "/" : path
        }
    }

    private static func describe(_ value: JSValue?) -> String {
        value.map { String(JSJSON.stringify($0).prefix(120)) } ?? "nothing"
    }
}
