import Foundation

/// 11a's check in debug builds: the Swift data core reads the vault the editor page opened, and what it makes
/// of it is compared with the page's Morrow session, page by page and document by document.
nonisolated enum CoreDualRun {
    struct Report: Sendable {
        var pages = 0
        var docs = 0
        var differences: [String] = []
    }

    /// The scan the editor page received, with the registry and recent list read from their text so their keys
    /// keep the file's order.
    static func scan(_ scan: VaultFileSystem.Scan, registry: String?, recent: String?) -> VaultLoad.Scan {
        VaultLoad.Scan(
            files: scan.files.map { .init(path: $0.path, text: $0.text, mtime: $0.mtime, birthtime: $0.birthtime) },
            folders: scan.folders.map { .init(path: $0.path, mtime: $0.mtime, empty: $0.empty) },
            others: scan.others,
            registry: registry.flatMap { try? JSJSON.parse($0) },
            recent: recent.flatMap { try? JSJSON.parse($0) },
        )
    }

    /// `web` is the page's answer to the `state` query: `{ pages, docs, unreadable, problems }`.
    static func compare(_ loaded: VaultLoad.Loaded, web: JSValue) -> Report {
        var report = Report(pages: loaded.pages.count, docs: loaded.docs.count)
        func note(_ text: String) { report.differences.append(text) }

        var webPages = JSObject()
        for page in web["pages"]?.array ?? [] { if let id = page["id"]?.string { webPages[id] = page } }
        var swiftPages = JSObject()
        for page in loaded.pages { swiftPages[page.id] = page.json }
        for id in swiftPages.keys where !webPages.has(id) { note("page \(id) only in Swift") }
        for id in webPages.keys where !swiftPages.has(id) { note("page \(id) only in the web") }
        for (id, page) in swiftPages {
            guard let other = webPages[id] else { continue }
            for key in Set(page.object!.keys + (other.object?.keys ?? [])).sorted() where !same(page[key], other[key]) {
                note("page \(id) \(key): Swift \(describe(page[key])), web \(describe(other[key]))")
            }
        }

        let webDocs = web["docs"]?.object ?? JSObject()
        for (id, _) in loaded.docs where !webDocs.has(id) { note("doc \(id) only in Swift") }
        for (id, _) in webDocs where !loaded.docs.has(id) { note("doc \(id) only in the web") }
        for (id, doc) in loaded.docs {
            guard let other = webDocs[id] else { continue }
            if let path = firstDifference(.object(doc), other, at: "") { note("doc \(id) differs at \(path)") }
        }

        let webUnreadable = JSSet((web["unreadable"]?.array ?? []).compactMap(\.string))
        let swiftUnreadable = JSSet(loaded.unreadable)
        for id in swiftUnreadable where !webUnreadable.has(id) { note("page \(id) unreadable only in Swift") }
        for id in webUnreadable where !swiftUnreadable.has(id) { note("page \(id) unreadable only in the web") }
        let webProblems = (web["problems"]?.array ?? []).compactMap(\.string)
        if webProblems.count != loaded.problems.count || !zip(webProblems, loaded.problems).allSatisfy({ $0.jsEquals($1) }) {
            note("problems: Swift \(loaded.problems), web \(webProblems)")
        }
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
