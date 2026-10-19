import Foundation
import Testing
@testable import SynapseNote

/// Morrow's core/diff.ts, site.ts, portability.ts and importer.ts in node, Fixtures/core/expected/{diff,site,
/// portability,importer}.json, on the guide vault with a page holding every block, a locked page and look-alike
/// names.
struct ExportTests {
    static let now = 1_792_402_200_000.0

    /// the same JSON value with object keys sorted, for records whose key order depends on how they were made
    static func canonical(_ value: JSValue) -> JSValue {
        switch value {
        case .object(let object):
            var sorted = JSObject()
            for key in object.keys.sorted() { sorted[key] = canonical(object[key]!) }
            return .object(sorted)
        case .array(let items):
            return .array(items.map(canonical))
        default:
            return value
        }
    }

    /// Morrow's build renames these words in what the app shows; the ports use the app's name
    static func renamed(_ value: JSValue) -> JSValue {
        switch value {
        case .string(let text):
            return .string(text
                .replacingOccurrences(of: "<meta name=\"generator\" content=\"Morrow\">", with: "<meta name=\"generator\" content=\"SynapseNote\">")
                .replacingOccurrences(of: "This file is not a Morrow backup.", with: "This file is not a SynapseNote backup.")
                .replacingOccurrences(of: "newer version of Morrow (format", with: "newer version of SynapseNote (format")
                .replacingOccurrences(of: "Please update Morrow.", with: "Please update SynapseNote."))
        case .array(let items): return .array(items.map(renamed))
        case .object(let object):
            var copy = JSObject()
            for (key, item) in object { copy[key] = renamed(item) }
            return .object(copy)
        default: return value
        }
    }

    static func state(_ fixture: JSValue) throws -> WorkspaceState {
        var state = WorkspaceState()
        for page in try #require(fixture["state"]?["pages"]?.array) { let meta = try #require(PageMeta(json: page)); state.pages[meta.id] = meta }
        for (id, doc) in try #require(fixture["state"]?["docs"]?.object) { state.docs[id] = try #require(doc.object) }
        return state
    }

    static func check(_ actual: JSValue, _ expected: JSValue?, _ label: String) {
        #expect(actual == expected, "\(label)\n swift \(CoreFixtures.describe(actual).prefix(900))\n morrow \(CoreFixtures.describe(expected ?? .null).prefix(900))")
    }

    static func docs(_ docs: JSRecord<DocNode>) -> JSValue {
        var object = JSObject()
        for (id, doc) in docs { object[id] = .object(doc) }
        return .object(object)
    }

    static func pages(_ pages: [PageMeta]) -> JSValue { canonical(.array(pages.map(\.json))) }

    @Test func diffsLines() throws {
        for item in try #require(CoreFixtures.load("diff").array) {
            let lines = Diff.diffLines(item["before"]!.string!, item["after"]!.string!)
            Self.check(.array(lines.map(\.json)), item["lines"], "diff of \(item["before"]!.string!.prefix(40))")
        }
    }

    @Test func buildsSitesAsMorrowDoes() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("site")
        let state = try Self.state(fixture)
        for item in try #require(fixture["sites"]?.array) {
            let math = item["math"] == .bool(true)
            let options = Site.Options(rootId: item["rootId"]?.string, title: item["title"]!.string!,
                                       renderMath: math ? { latex, display in "<math display=\"\(display ? "block" : "inline")\">\(latex.utf16.count)</math>" } : nil,
                                       now: Self.now)
            let built = Site.buildSite(state, options)
            let expected = Self.renamed(item["files"] ?? .null).array ?? []
            #expect(built.files.count == expected.count, "\(item["title"]!.string!): files")
            for (file, want) in zip(built.files, expected) {
                Self.check(["path": .string(file.path), "content": .string(file.content)], want, "\(item["title"]!.string!): \(file.path)")
            }
            Self.check(.array(built.assets.keys.map { [.string($0), .string(built.assets[$0]!)] }), item["assets"], "assets")
        }
    }

    @Test func backsUpRestoresAndExportsAsMorrowDoes() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("portability")
        let state = try Self.state(fixture)
        let file = Portability.BackupFile(meta: FileMeta(id: "f1", name: "pic.png", type: "image/png", size: 3, createdAt: 5), data: "AQID")
        Self.check(Self.canonical(Portability.createBackup(state, now: Self.now, files: [file])), Self.canonical(fixture["backup"]!), "backup")

        for item in try #require(fixture["parses"]?.array) {
            let expected = Self.renamed(item["result"]!)
            switch Portability.parseBackup(item["input"]!.string!) {
            case .failure(let error):
                Self.check(["ok": false, "error": .string(error.message)], expected, "parse")
            case .success(let parsed):
                #expect(expected["ok"] == true)
                let value = expected["value"]!
                Self.check(Self.pages(parsed.pages), Self.canonical(value["pages"]!), "parsed pages")
                Self.check(Self.docs(parsed.docs), value["docs"], "parsed docs")
                Self.check(.array(parsed.files.map(\.json)), value["files"], "parsed files")
                Self.check(.array(parsed.problems.map(JSValue.string)), value["problems"], "parsed problems")
            }
        }

        guard case .success(let older) = Portability.parseBackup(fixture["restoreText"]!.string!) else { Issue.record("older backup"); return }
        let restore = Portability.planRestore(state, older, VaultLoadTests.counter("re"))
        let wantRestore = fixture["restore"]!
        Self.check(Self.pages(restore.pages), Self.canonical(wantRestore["pages"]!), "restore pages")
        Self.check(Self.docs(restore.docs), wantRestore["docs"], "restore docs")
        Self.check(.number(Double(restore.skipped)), wantRestore["skipped"], "restore skipped")
        Self.check(.array(restore.problems.map(JSValue.string)), wantRestore["problems"], "restore problems")

        let files = try #require(fixture["markdownFiles"]?.array).map { Portability.MarkdownFile(name: $0["name"]!.string!, text: $0["text"]!.string!) }
        let imported = Portability.planMarkdownImport(state, files, "rich", VaultLoadTests.counter("mi"), now: Self.now)
        Self.check(Self.pages(imported.pages), Self.canonical(fixture["markdownImport"]!["pages"]!), "markdown import pages")
        Self.check(Self.docs(imported.docs), fixture["markdownImport"]!["docs"], "markdown import docs")

        for item in try #require(fixture["pageMarkdown"]?.array) {
            Self.check(.string(Portability.pageMarkdown(state, item["id"]!.string!)), item["text"], "markdown of \(item["id"]!.string!)")
        }
        var metas = JSRecord<FileMeta>()
        for (id, meta) in try #require(fixture["metas"]?.object) {
            metas[id] = FileMeta(id: meta["id"]!.string!, name: meta["name"]!.string!, type: meta["type"]!.string!, size: meta["size"]!.number!, createdAt: meta["createdAt"]!.number!)
        }
        let exported = Portability.workspaceMarkdownFiles(state, metas)
        Self.check(.array(exported.files.map { ["path": .string($0.path), "content": .string($0.content)] }), fixture["workspace"]!["files"], "workspace files")
        Self.check(.array(exported.attachments.keys.map { [.string($0), .string(exported.attachments[$0]!)] }), fixture["workspace"]!["attachments"], "workspace attachments")
        let names = Portability.attachmentNames(["x", "attachments/pic.png", "y", "missing", "x", "attachments/report Q3.pdf"], metas)
        Self.check(.array(names.keys.map { [.string($0), .string(names[$0]!)] }), fixture["attachmentNames"], "attachment names")
        for item in try #require(fixture["safeFileNames"]?.array) {
            Self.check(.string(Portability.safeFileName(item["title"]!.string!)), item["name"], "safe name of \(item["title"]!.string!)")
        }
    }

    @Test func importsArchivesAsMorrowDoes() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("importer")
        let state = try Self.state(fixture)
        func entries(_ key: String) throws -> [Importer.Entry] {
            try #require(fixture[key]?.array).map { Importer.Entry(path: $0["path"]!.string!, data: Data(base64Encoded: $0["data"]!.string!)!) }
        }
        for (entriesKey, planKey, parent, prefix) in [("entries", "plan", nil as String?, "ai"), ("flatEntries", "flat", "rich", "fl")] {
            let plan = Importer.planArchiveImport(state, try entries(entriesKey), parent, VaultLoadTests.counter(prefix), now: Self.now)
            let want = fixture[planKey]!
            Self.check(Self.pages(plan.pages), Self.canonical(want["pages"]!), "\(planKey) pages")
            Self.check(Self.docs(plan.docs), want["docs"], "\(planKey) docs")
            Self.check(.array(plan.files.map { ["meta": $0.meta.json, "data": .string($0.data.base64EncodedString())] }), want["files"], "\(planKey) files")
            Self.check(.array(plan.problems.map(JSValue.string)), want["problems"], "\(planKey) problems")
        }
        for item in try #require(fixture["csv"]?.array) {
            Self.check(.array(Importer.parseCsv(item["text"]!.string!).map { .array($0.map(JSValue.string)) }), item["rows"], "csv \(item["text"]!.string!)")
        }
        for item in try #require(fixture["mime"]?.array) {
            Self.check(.string(Importer.mimeType(item["name"]!.string!)), item["type"], "mime of \(item["name"]!.string!)")
        }
    }
}
