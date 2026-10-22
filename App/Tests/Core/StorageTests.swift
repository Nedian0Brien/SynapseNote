import Foundation
import Testing
@testable import SynapseNote

/// Morrow's session, save queue and vault repository on an in-memory vault, Fixtures/core/expected/storage.json:
/// the same steps (edits over hours, page history, outside edits, a conflict, encryption, attachments) give the
/// same file operations, history files included, the same outside-edit patches and the same workspace.
struct StorageTests {
    private static func change(_ json: JSValue) -> VaultChange {
        VaultChange(path: json["path"]?.string ?? "", text: json["text"]?.string, mtime: json["mtime"]?.number ?? 0,
                    birthtime: json["birthtime"]?.number ?? 0, dir: json["dir"] == .bool(true), other: json["other"] == .bool(true))
    }

    private static func commands(_ json: JSValue?, _ name: String) throws -> [CoreCommand] {
        try #require(json?.array, "\(name): commands").map { try #require(CoreCommand(json: $0), "\(name): \(CoreFixtures.describe($0).prefix(160))") }
    }

    private static func outcome(_ result: Result<WorkspaceState, CommandFailure>) -> JSValue {
        switch result {
        case .success: ["ok": true]
        case .failure(let error): ["ok": false, "error": .string(error.message)]
        }
    }

    /// page records compared as records: key order in Morrow's objects follows how each was spread together
    private static func samePages(_ swift: JSRecord<PageMeta>, _ expected: JSValue?, _ name: String) {
        guard case .object(let pages) = expected else {
            Issue.record("\(name): no pages")
            return
        }
        #expect(swift.keys == pages.keys, "\(name): page ids")
        for (id, json) in pages {
            let page = PageMeta(json: json)
            if swift[id] != page { Issue.record("\(name): page \(id)\n swift \(CoreFixtures.describe(swift[id]?.json ?? .null))\n morrow \(CoreFixtures.describe(json))") }
        }
    }

    private static func samePatch(_ swift: (patch: ExternalPatch, accepted: [String])?, _ expected: JSValue?, _ name: String) {
        guard let expected, !expected.isNull else {
            #expect(swift == nil, "\(name): no patch expected")
            return
        }
        guard let swift else {
            Issue.record("\(name): no patch")
            return
        }
        #expect(JSValue.array(swift.accepted.map(JSValue.string)) == expected["accepted"], "\(name): accepted")
        let patch = expected["patch"]
        let pages = patch?["pages"]?.array ?? []
        #expect(swift.patch.pages.count == pages.count, "\(name): patch pages")
        for (page, json) in zip(swift.patch.pages, pages) where page != PageMeta(json: json) {
            Issue.record("\(name): patch page \(page.id)\n swift \(CoreFixtures.describe(page.json))\n morrow \(CoreFixtures.describe(json))")
        }
        let swiftJSON = swift.patch.json
        for key in ["docs", "removed", "unreadable", "readable"] {
            #expect(swiftJSON[key] == patch?[key], "\(name): patch \(key)\n swift \(CoreFixtures.describe(swiftJSON[key] ?? .null).prefix(600))\n morrow \(CoreFixtures.describe(patch?[key] ?? .null).prefix(600))")
        }
    }

    @Test func storesAsMorrowDoes() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("storage")
        let start = try #require(fixture["start"])
        let steps = try #require(fixture["steps"]?.array)
        #expect(steps.count == 25)
        var clock = try #require(start["clock"]?.number)
        var snapshotIds = Int(start["snapshotIds"]?.number ?? 0)
        let vault = MemoryVault()
        let writer = VaultWriter(bridge: vault, newId: VaultLoadTests.counter("r"), now: { clock },
                                 random: CryptoTests.randomSource(from: Int(start["randomByte"]?.number ?? 0)))
        let session = CoreSession.open(try vault.scan(), writer: writer, now: { clock }, newSnapshotId: {
            snapshotIds += 1
            return "00000000-0000-4000-8000-" + String(repeating: "0", count: 12 - String(snapshotIds).count) + String(snapshotIds)
        })

        for step in steps {
            let name = step["name"]?.string ?? "?"
            let action = try #require(step["action"])
            clock = try #require(step["at"]?.number)
            var result = JSValue.null
            var external: (patch: ExternalPatch, accepted: [String])?
            switch action["type"]?.string {
            case "commands":
                let list = try Self.commands(action["commands"], name)
                if action["all"] == .bool(true) {
                    result = [Self.outcome(session.executeAll(list))]
                } else {
                    result = .array(list.map { Self.outcome(session.execute($0)) })
                }
                session.flush()
            case "edits":
                for command in try Self.commands(action["commands"], name) {
                    clock += try #require(action["every"]?.number)
                    session.execute(command)
                    session.flush()
                }
            case "external":
                for command in try Self.commands(action["before"] ?? .array([]), name) { session.execute(command) }
                let changes = try #require(action["changes"]?.array).map(Self.change)
                vault.external(changes)
                external = session.receive(changes)
                session.flush()
            case "protect":
                result = Self.outcome(session.protectPage(action["id"]!.string!, action["password"]!.string!))
            case "lock":
                session.lockPage(action["id"]!.string!)
            case "unlock":
                result = Self.outcome(session.unlockPage(action["id"]!.string!, action["password"]!.string!))
            case "unprotect":
                result = Self.outcome(session.unprotectPage(action["id"]!.string!))
            case "restore":
                let list = session.listSnapshots(action["id"]!.string!)
                let snapshot = list[Int(action["index"]!.number!)]
                switch session.restoreSnapshot(snapshot) {
                case .success: result = ["ok": true, "snapshot": .string(snapshot.id)]
                case .failure(let error): result = ["ok": false, "error": .string(error.message)]
                }
                session.flush()
            case "putFiles":
                let files = try #require(action["files"]?.array).map { file in
                    let data = Data(base64Encoded: file["base64"]?.string ?? "") ?? Data()
                    return (meta: FileMeta(id: "new", name: file["name"]?.string ?? "", type: file["type"]?.string ?? "", size: Double(data.count), createdAt: clock), data: data)
                }
                switch session.addFiles(files) {
                case .success(let metas): result = ["ok": true, "files": .array(metas.map(\.json))]
                case .failure(let error): result = ["ok": false, "error": .string(error.message)]
                }
            case "deleteFiles":
                try session.deleteFiles(try #require(action["ids"]?.array).map { $0.string! })
                result = ["files": .array(session.listFiles().map { .string($0.id) })]
            case "meta":
                try session.writeMeta(action["name"]!.string!, action["text"]!.string!)
                result = ["read": session.readMeta(action["name"]!.string!).map(JSValue.string) ?? .null,
                          "refused": session.readMeta("../escape.json").map(JSValue.string) ?? .null]
            case "snapshots":
                result = .array(session.listSnapshots(action["id"]!.string!).map { snapshot in
                    ["id": .string(snapshot.id), "title": .string(snapshot.title), "createdAt": .number(snapshot.createdAt), "doc": .object(snapshot.doc)]
                })
            default:
                Issue.record("\(name): unknown action")
            }

            #expect(result == (step["result"] ?? .null), "\(name): result\n swift \(CoreFixtures.describe(result).prefix(800))\n morrow \(CoreFixtures.describe(step["result"] ?? .null).prefix(800))")
            Self.samePatch(external, step["external"], name)
            let ops = vault.takeFullLog()
            let expectedOps = try #require(step["ops"]?.array)
            if ops != expectedOps {
                let first = Array(zip(ops, expectedOps)).firstIndex { $0.0 != $0.1 } ?? min(ops.count, expectedOps.count)
                Issue.record("""
                    \(name): \(ops.count) ops, Morrow \(expectedOps.count); first difference at \(first)
                     swift \(first < ops.count ? CoreFixtures.describe(ops[first]).prefix(1500) : "none")
                     morrow \(first < expectedOps.count ? CoreFixtures.describe(expectedOps[first]).prefix(1500) : "none")
                    """)
            }
            Self.samePages(session.state.pages, step["pages"], name)
            for (id, doc) in step["docs"]?.object ?? JSObject() where session.state.docs[id].map(JSValue.object) != doc {
                Issue.record("\(name): doc \(id)\n swift \(CoreFixtures.describe(session.state.docs[id].map(JSValue.object) ?? .null).prefix(600))\n morrow \(CoreFixtures.describe(doc).prefix(600))")
            }
            for id in step["goneDocs"]?.array ?? [] { #expect(session.state.docs[id.string!] == nil, "\(name): doc \(id) should be gone") }
            #expect(Set(session.unreadable.items) == Set((step["unreadable"]?.array ?? []).map { $0.string! }), "\(name): unreadable")
            #expect(JSValue.object(session.activity()) == step["activity"], "\(name): activity")
            #expect(session.saveStatus.state.rawValue == step["status"]?.string, "\(name): status")
        }

        // the files left at the end, page history and morrow's own files included
        let files = try #require(fixture["files"]?.object)
        #expect(vault.files.keys.sorted() == files.keys.sorted())
        for (path, text) in files where vault.text(path) != text.string {
            Issue.record("file \(path)\n swift \(vault.text(path)?.prefix(400) ?? "none")\n morrow \(text.string?.prefix(400) ?? "")")
        }
    }
}
