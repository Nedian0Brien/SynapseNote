import Foundation
import Testing
@testable import SynapseNote

/// Morrow's loadVault and its page rendering on the vaults of Fixtures/core/expected/vaults.json, run with the
/// scan, clock and ids web/scripts/core-fixtures.ts used.
struct VaultLoadTests {
    /// Date.UTC(2026, 9, 19, 9, 30, 0)
    static let fixedNow: Double = {
        var parts = DateComponents()
        (parts.year, parts.month, parts.day, parts.hour, parts.minute) = (2026, 10, 19, 9, 30)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: parts)!.timeIntervalSince1970 * 1000
    }()

    static func counter(_ prefix: String) -> () -> String {
        var next = 0
        return {
            next += 1
            return "\(prefix)\(next)"
        }
    }

    /// scanOf in core-fixtures.ts
    static func scan(_ files: JSObject) throws -> VaultLoad.Scan {
        var scan = VaultLoad.Scan()
        var folders = JSSet()
        for (path, value) in files {
            let text = value.string ?? ""
            var dir = Paths.dirname(path)
            while !dir.isEmpty {
                folders.insert(dir)
                dir = Paths.dirname(dir)
            }
            if path == ".morrow/workspace.json" { scan.registry = try JSJSON.parse(text) }
            else if path == ".morrow/recent.json" { scan.recent = try JSJSON.parse(text) }
            else if Paths.isHiddenPath(path) { continue }
            else if Paths.isPageFile(path) { scan.files.append(.init(path: path, text: text, mtime: fixedNow - 1000, birthtime: fixedNow - 2000)) }
            else { scan.others.append(path) }
        }
        for folder in folders.items.sorted(by: { $0.jsLess($1) }) where !Paths.isHiddenPath(folder) {
            scan.folders.append(.init(path: folder, mtime: fixedNow - 1000, empty: false))
        }
        return scan
    }

    static func useFixtureEnvironment() {
        JSEnvironment.locale = Locale(identifier: "en-US")
        JSEnvironment.timeZone = TimeZone(identifier: "UTC")!
    }

    static func loadedJSON(_ loaded: VaultLoad.Loaded) -> JSValue {
        [
            "pages": .array(loaded.pages.map(\.json)),
            "docs": .object(JSObject(loaded.docs.map { ($0.key, JSValue.object($0.value)) })),
            "problems": .array(loaded.problems.map(JSValue.string)),
            "unreadable": .array(loaded.unreadable.map(JSValue.string)),
            "layout": .array(loaded.layout.map { [.string($0.key), $0.value.json] }),
            "folderOnly": .array(loaded.folderOnly.items.map(JSValue.string)),
            "sources": .array(loaded.sources.map { [.string($0.key), $0.value.json] }),
            "texts": .array(loaded.texts.map { [.string($0.key), .string($0.value)] }),
            "reserved": .array(loaded.reserved.items.map(JSValue.string)),
            "registryChanged": .bool(loaded.registryChanged),
        ]
    }

    /// rendered in core-fixtures.ts: what morrow writes for every page as if each had just been edited
    static func rendered(_ files: JSObject) throws -> JSObject {
        let loaded = VaultLoad.loadVault(try scan(files), newId: counter("v"), now: fixedNow)
        var pages = JSRecord<PageMeta>()
        for page in loaded.pages { pages[page.id] = page }
        let targets = VaultLayout.linkTargets(loaded.layout)
        var result = JSObject()
        for page in loaded.pages {
            guard let placement = loaded.layout[page.id], let file = placement.file else { continue }
            let doc = loaded.docs[page.id]
            if page.kind == .canvas {
                result[file] = .string(CanvasFile.writeCanvas(CanvasFile.canvasFromDoc(doc)) { loaded.layout[$0]?.file })
                continue
            }
            guard let doc else {
                result[file] = .null
                continue
            }
            let dir = Paths.dirname(file)
            let body = MarkdownSerialize.docToMarkdown(doc, .init(
                titleOf: { pages[$0].map(Model.displayTitle) },
                linkTarget: { targets[$0] },
                filePath: { $0.utf16.contains(0x2F) || $0.utf16.contains(0x2E) ? Paths.relativePath(dir, $0) : nil },
            ))
            let parent = page.parentId.flatMap { pages[$0] }
            var source = loaded.sources[page.id]
            let managed = PageFile.managedFrontmatter(page, fileBase: Paths.basename(placement.folder),
                                                      parentDatabase: parent?.kind == .database ? parent?.database : nil)
            source?.body = nil
            result[file] = .string(PageFile.renderPageText(PageFile.composeFrontmatter(managed, source), loaded.sources[page.id], body))
        }
        return result
    }

    @Test func vaultsLoadAsMorrowLoadsThem() throws {
        Self.useFixtureEnvironment()
        let vaults = try #require(CoreFixtures.load("vaults").array)
        #expect(vaults.count == 3)
        for vault in vaults {
            let name = vault["name"]?.string ?? "?"
            let files = try #require(vault["files"]?.object)
            let loaded = VaultLoad.loadVault(try Self.scan(files), newId: Self.counter("v"), now: Self.fixedNow)
            let actual = try JSJSON.parse(JSJSON.stringify(Self.loadedJSON(loaded)))
            let expected = try #require(vault["loaded"])
            for key in expected.object?.keys ?? [] where actual[key] != expected[key] {
                Issue.record("\(name) \(key)\nswift:\n\(CoreFixtures.describe(actual[key] ?? .null).prefix(3000))\nmorrow:\n\(CoreFixtures.describe(expected[key] ?? .null).prefix(3000))")
            }
        }
    }

    @Test func pagesAreWrittenAsMorrowWritesThem() throws {
        Self.useFixtureEnvironment()
        let vaults = try #require(CoreFixtures.load("vaults").array)
        for vault in vaults {
            let name = vault["name"]?.string ?? "?"
            let files = try #require(vault["files"]?.object)
            let actual = try Self.rendered(files)
            let expected = try #require(vault["rendered"]?.object)
            #expect(actual.keys == expected.keys, "\(name) files")
            for (file, text) in expected where actual[file] != text {
                Issue.record("\(name) \(file)\nswift:\n\(CoreFixtures.describe(actual[file] ?? .null))\nmorrow:\n\(CoreFixtures.describe(text))")
            }
        }
    }
}
