import CryptoKit
import Foundation
import Testing
@testable import SynapseNote

/// Values made by Morrow's own `planPull` and by node's crypto as Morrow's desktop app uses it, written by
/// `npm run sync-fixtures` in `web/`.
private final class FixtureBundle {}

private func fixtures() throws -> JSONValue {
    let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "sync-fixtures", withExtension: "json"))
    return try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
}

private func manifest(_ value: JSONValue?) -> SyncManifest {
    value?.objectValue?.compactMapValues(\.stringValue) ?? [:]
}

/// Morrow's fixture day, 16 October 2026 at local midnight.
private let fixtureDay: Date = {
    var parts = DateComponents()
    parts.year = 2026
    parts.month = 10
    parts.day = 16
    return Calendar.current.date(from: parts)!
}()

struct SyncPlanTests {
    @Test func plansMatchMorrows() throws {
        guard case .array(let cases) = try fixtures()["plans"] else { Issue.record("no plans"); return }
        #expect(cases.count >= 14)
        for item in cases {
            let name = item["name"]?.stringValue ?? "?"
            let plan = SyncRules.planPull(
                local: manifest(item["local"]), remote: manifest(item["remote"]), base: manifest(item["base"]),
                device: item["device"]?.stringValue ?? "", now: fixtureDay
            )
            guard case .array(let actions) = item["plan"]?["actions"] else { Issue.record("no actions in \(name)"); continue }
            let expected: [SyncAction] = actions.compactMap { action in
                let path = action["path"]?.stringValue ?? ""
                let hash = action["hash"]?.stringValue ?? ""
                switch action["kind"]?.stringValue {
                case "download": return .download(path: path, hash: hash)
                case "delete": return .delete(path: path, hash: hash)
                case "conflict": return .conflict(path: path, hash: hash, copy: action["copy"]?.stringValue ?? "")
                default: return nil
                }
            }
            #expect(plan.actions == expected, "\(name)")
            #expect(plan.base == manifest(item["plan"]?["base"]), "\(name)")
        }
    }

    @Test func conflictNamesAndSharedPathsMatchMorrows() throws {
        let data = try fixtures()
        guard case .array(let names) = data["conflictNames"], case .array(let synced) = data["synced"] else { Issue.record("missing"); return }
        for item in names {
            #expect(SyncRules.conflictName(item["path"]?.stringValue ?? "", device: item["device"]?.stringValue ?? "", date: fixtureDay) == item["name"]?.stringValue)
        }
        for item in synced {
            #expect(SyncRules.isSynced(item["path"]?.stringValue ?? "") == (item["synced"] == .bool(true)), "\(item["path"]?.stringValue ?? "")")
        }
    }

    /// Morrow's own sync tests in `core/organize.test.ts`: two computers pulling from each other in turns.
    private func pull(_ local: SyncManifest, _ remote: SyncManifest, _ base: SyncManifest, _ device: String) -> (files: SyncManifest, base: SyncManifest) {
        let plan = SyncRules.planPull(local: local, remote: remote, base: base, device: device, now: fixtureDay)
        var files = local
        for action in plan.actions {
            switch action {
            case .delete(let path, _): files.removeValue(forKey: path)
            case .download(let path, _): files[path] = remote[path]
            case .conflict(let path, _, let copy):
                files[copy] = files[path]
                files[path] = remote[path]
            }
        }
        return (files, plan.base)
    }

    private func both(_ a: SyncManifest, _ b: SyncManifest, _ base: SyncManifest) -> (left: SyncManifest, right: SyncManifest) {
        var ab = base, ba = base, left = a, right = b
        for _ in 0..<3 {
            let x = pull(left, right, ab, "Laptop")
            left = x.files
            ab = x.base
            let y = pull(right, left, ba, "Desktop")
            right = y.files
            ba = y.base
        }
        return (left, right)
    }

    @Test func copiesNewAndChangedFilesAndPassesOnDeletions() {
        let result = both(["a.md": "2", "b.md": "1", "c.md": "1", "new.md": "n"], ["a.md": "1", "b.md": "1"], ["a.md": "1", "b.md": "1", "c.md": "1"])
        #expect(result.left == ["a.md": "2", "b.md": "1", "new.md": "n"])
        #expect(result.right == result.left)
    }

    @Test func keepsBothVersionsAndSettlesOnOneName() {
        let result = both(["a.md": "laptop"], ["a.md": "desktop"], ["a.md": "old"])
        #expect(result.right == result.left)
        #expect(result.left.values.sorted() == ["desktop", "laptop"])
        #expect(result.left.keys.filter { $0.contains("conflict") }.count == 1)
    }

    @Test func prefersAnEditOverADeletionAndIgnoresToolFolders() {
        let result = both(["a.md": "edited", ".obsidian/x.json": "mine"], [".obsidian/x.json": "theirs"], ["a.md": "old"])
        #expect(result.left["a.md"] == "edited")
        #expect(result.right["a.md"] == "edited")
        #expect(result.right[".obsidian/x.json"] == "theirs")
    }
}

struct SyncCryptoTests {
    @Test func keysAndSealingMatchMorrowsDesktop() throws {
        let crypto = try #require(try fixtures()["crypto"])
        let secret = try #require(Data(base64Encoded: crypto["secret"]?.stringValue ?? ""))
        let peerKey = SyncCrypto.peerKey(secret: secret, deviceId: "device-bbbbbbbb", peerId: "device-aaaaaaaa")
        #expect(peerKey.withUnsafeBytes { Data($0) }.base64EncodedString() == crypto["peerKey"]?.stringValue)
        let pairingKey = SyncCrypto.pairingKey(code: crypto["code"]?.stringValue ?? "", deviceId: "device-aaaaaaaa")
        #expect(pairingKey.withUnsafeBytes { Data($0) }.base64EncodedString() == crypto["pairingKey"]?.stringValue)
        // sealing the same bytes with the same nonce gives node's output, and node's output opens here
        let iv = try #require(Data(base64Encoded: crypto["iv"]?.stringValue ?? ""))
        let body = Data((crypto["body"]?.stringValue ?? "").utf8)
        let sealed = try SyncCrypto.seal(body: body, iv: iv, with: peerKey)
        #expect(sealed.data == crypto["data"]?.stringValue)
        let opened = try SyncCrypto.openBody(.init(iv: crypto["iv"]?.stringValue ?? "", data: crypto["data"]?.stringValue ?? ""), with: peerKey)
        #expect(opened == body)
    }

    @Test func refusesOldReplayedAndForeignMessages() throws {
        let key = SymmetricKey(size: .bits256)
        let opener = SyncOpener()
        let now = Date()
        let envelope = try SyncCrypto.seal(.object(["op": .string("hello")]), with: key, now: now)
        #expect(try opener.open(envelope, with: key, now: now)["op"] == .string("hello"))
        #expect(throws: SyncCrypto.Failure.replayed) { try opener.open(envelope, with: key, now: now) }
        let old = try SyncCrypto.seal(.null, with: key, now: now.addingTimeInterval(-6 * 60))
        #expect(throws: SyncCrypto.Failure.tooOld) { try opener.open(old, with: key, now: now) }
        let other = try SyncCrypto.seal(.null, with: SymmetricKey(size: .bits256), now: now)
        #expect(throws: SyncCrypto.Failure.badMessage) { try opener.open(other, with: key, now: now) }
    }

    @Test func codesLookLikeMorrows() {
        let code = SyncCrypto.newCode()
        #expect(code.count == 19)
        #expect(code.split(separator: "-").map(\.count) == [4, 4, 4, 4])
        #expect(SyncCrypto.normalized(code: code.lowercased()) == code.replacingOccurrences(of: "-", with: ""))
        #expect(SyncCrypto.normalized(code: "ab18-9z") == "ABZ")
    }
}

struct SyncHTTPParserTests {
    @Test func readsRequestsWithABody() {
        let raw = Data("POST /morrow/v1 HTTP/1.1\r\nHost: a\r\nContent-Length: 5\r\n\r\n{\"a\"".utf8)
        #expect(SyncHTTPParser.parse(raw, maxBody: 100) == .incomplete)
        #expect(SyncHTTPParser.parse(raw + Data("}".utf8), maxBody: 100) == .request(method: "POST", path: "/morrow/v1", body: Data("{\"a\"}".utf8)))
        #expect(SyncHTTPParser.parse(Data("POST /morrow/v1 HTTP/1.1\r\n".utf8), maxBody: 100) == .incomplete)
        let full = Data("POST /morrow/v1 HTTP/1.1\r\ncontent-length: 2\r\n\r\n{}".utf8)
        #expect(SyncHTTPParser.parse(full, maxBody: 100) == .request(method: "POST", path: "/morrow/v1", body: Data("{}".utf8)))
        #expect(SyncHTTPParser.parse(Data("GET /morrow/v1/id HTTP/1.1\r\n\r\n".utf8), maxBody: 100) == .request(method: "GET", path: "/morrow/v1/id", body: Data()))
        #expect(SyncHTTPParser.parse(Data("POST / HTTP/1.1\r\nContent-Length: 500\r\n\r\n".utf8), maxBody: 100) == .invalid)
        #expect(SyncHTTPParser.parse(Data("POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n".utf8), maxBody: 100) == .invalid)
    }
}

struct SyncVaultTests {
    private func vault() throws -> (SyncVault, URL) {
        let root = FileManager.default.temporaryDirectory.appending(path: "syncvault-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let files = VaultFileSystem(root: root, trash: { _ in throw CocoaError(.featureUnsupported) })
        return (SyncVault(files: files, name: "Notes"), root)
    }

    @Test func manifestHoldsSharedFilesWithTheirHashes() throws {
        let (vault, root) = try vault()
        defer { try? FileManager.default.removeItem(at: root) }
        for (path, text) in ["a.md": "hello", "sub/b.md": "b", ".trash/c.md": "c", ".morrow/workspace.json": "{}", ".morrow/history/x.json": "h", ".obsidian/app.json": "o"] {
            try vault.files.writeBytes(path, data: Data(text.utf8))
        }
        let manifest = try vault.manifest()
        #expect(Set(manifest.keys) == ["a.md", "sub/b.md", ".trash/c.md", ".morrow/workspace.json"])
        // sha-256 of "hello"
        #expect(manifest["a.md"] == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }

    @Test func identityIsMadeOnceAndBasesAreKeptPerDevice() throws {
        let (vault, root) = try vault()
        defer { try? FileManager.default.removeItem(at: root) }
        let id = try vault.identity()
        #expect(SyncVault.isValidId(id))
        #expect(try vault.identity() == id)
        let written = try String(contentsOf: root.appending(path: ".morrow/vault.json"), encoding: .utf8)
        #expect(written == "{\n \"version\": 1,\n \"id\": \"\(id)\"\n}\n")
        try vault.saveBase(["a.md": "1"], for: "peer-12345678")
        #expect(vault.base(for: "peer-12345678") == ["a.md": "1"])
        #expect(vault.base(for: "peer-other000") == [:])
    }

    @Test func writesOnlyWhenTheFileIsStillWhatThePlanSaw() throws {
        let (vault, root) = try vault()
        defer { try? FileManager.default.removeItem(at: root) }
        #expect(try vault.write("a.md", data: Data("one".utf8), expect: nil) == .ok)
        #expect(try vault.write("a.md", data: Data("two".utf8), expect: nil) == .changed)
        #expect(try vault.write("a.md", data: Data("two".utf8), expect: SyncVault.hash(Data("one".utf8))) == .ok)
        #expect(throws: (any Error).self) { try vault.write(".morrow/history/x.json", data: Data(), expect: nil) }
        #expect(vault.read(".obsidian/app.json") == nil)
    }

    @Test func copiesStartOnlyInEmptyFolders() throws {
        let (_, root) = try vault()
        defer { try? FileManager.default.removeItem(at: root) }
        try SyncVault.prepareCopy(in: root, vaultId: "vault-12345678")
        #expect(FileManager.default.fileExists(atPath: root.appending(path: ".morrow/vault.json").path(percentEncoded: false)))
        try Data("x".utf8).write(to: root.appending(path: "page.md"))
        #expect(throws: (any Error).self) { try SyncVault.prepareCopy(in: root, vaultId: "vault-12345678") }
    }
}

/// Two devices in one process talking over the loopback network, through the same server, crypto and pull.
@MainActor
struct SyncLoopbackTests {
    private func device(_ name: String, ports: [UInt16]) throws -> (SyncService, SyncVault, URL) {
        let base = FileManager.default.temporaryDirectory.appending(path: "sync-\(name)-\(UUID().uuidString)")
        let vaultRoot = base.appending(path: "vault")
        try FileManager.default.createDirectory(at: vaultRoot, withIntermediateDirectories: true)
        let service = SyncService(folder: base.appending(path: "support"), secrets: MemorySyncSecrets(), defaultName: name)
        service.serverPorts = ports
        service.usesDiscovery = false
        let vault = SyncVault(files: VaultFileSystem(root: vaultRoot, trash: { _ in throw CocoaError(.featureUnsupported) }), name: "Notes")
        service.vault = vault
        return (service, vault, base)
    }

    @Test func pairsPullsKeepsConflictsAndAnswersPullRequests() async throws {
        let (laptop, laptopVault, laptopBase) = try device("Laptop", ports: [0])
        let (desktop, desktopVault, desktopBase) = try device("Desktop", ports: [0])
        defer {
            laptop.stop()
            desktop.stop()
            try? FileManager.default.removeItem(at: laptopBase)
            try? FileManager.default.removeItem(at: desktopBase)
        }
        // the desktop shows a code, the laptop types it in with the desktop's address
        let code = await desktop.startPairing()
        let paired = await laptop.pair(with: (id: nil, address: "127.0.0.1", port: desktop.listeningPort), code: code)
        #expect(paired.ok, "\(paired.error ?? "")")
        #expect(paired.name == "Desktop")
        #expect(desktop.config.peers.map(\.name) == ["Laptop"])
        #expect(desktop.pairingCode == nil)
        await desktop.setEnabled(true)

        // both are copies of one vault
        let id = try desktopVault.identity()
        try laptopVault.files.writeBytes(SyncVault.identityFile, data: SyncVault.identityJSON(id))
        try desktopVault.files.writeBytes("Plans.md", data: Data("from the desktop".utf8))
        try desktopVault.files.writeBytes("attachments/a.png", data: Data([0, 1, 2]))
        try laptopVault.files.writeBytes("Laptop.md", data: Data("from the laptop".utf8))

        let desktopId = desktop.config.deviceId
        var changed: Set<String> = []
        laptop.filesChanged = { changed.formUnion($0) }
        let first = await laptop.sync(with: desktopId, askBack: false)
        #expect(first.ok, "\(first.error ?? "")")
        #expect(first.received == 2)
        #expect(changed == ["Plans.md", "attachments/a.png"])
        #expect(laptopVault.read("Plans.md") == Data("from the desktop".utf8))
        #expect(laptopVault.read("attachments/a.png") == Data([0, 1, 2]))

        // both change the same page: one name keeps the larger hash, the other version is kept beside it
        try laptopVault.files.writeBytes("Plans.md", data: Data("laptop edit".utf8))
        try desktopVault.files.writeBytes("Plans.md", data: Data("desktop edit".utf8))
        let laptopId = laptop.config.deviceId
        let second = await laptop.sync(with: desktopId, askBack: false)
        #expect(second.ok)
        let third = await desktop.sync(with: laptopId, askBack: false)
        #expect(third.ok, "\(third.error ?? "")")
        let fourth = await laptop.sync(with: desktopId, askBack: false)
        #expect(fourth.ok)
        let laptopFiles = try laptopVault.manifest().filter { !$0.key.hasPrefix(".morrow") }
        let desktopFiles = try desktopVault.manifest().filter { !$0.key.hasPrefix(".morrow") }
        #expect(laptopFiles == desktopFiles)
        #expect(laptopFiles.keys.filter { $0.contains("(conflict from ") }.count == 1)
        #expect(laptopFiles["Laptop.md"] != nil)

        // asking the other device to pull makes it fetch this device's change
        try laptopVault.files.writeBytes("Asked.md", data: Data("pull this".utf8))
        _ = try await laptop.request(desktopId, ["op": .string("pull")])
        for _ in 0..<40 where desktopVault.read("Asked.md") == nil {
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(desktopVault.read("Asked.md") == Data("pull this".utf8))

        // a vault with another id is refused with Morrow's message
        try laptopVault.files.writeBytes(SyncVault.identityFile, data: SyncVault.identityJSON("other-vault-1234"))
        let refused = await laptop.sync(with: desktopId, askBack: false)
        #expect(!refused.ok)
        #expect(refused.error == "Desktop has a different vault open (Notes). Open the same vault on both, or copy it over first.")
    }

    @Test func wrongCodesAreRefused() async throws {
        let (laptop, _, laptopBase) = try device("Laptop", ports: [0])
        let (desktop, _, desktopBase) = try device("Desktop", ports: [0])
        defer {
            laptop.stop()
            desktop.stop()
            try? FileManager.default.removeItem(at: laptopBase)
            try? FileManager.default.removeItem(at: desktopBase)
        }
        await desktop.startPairing()
        let wrong = await laptop.pair(with: (id: nil, address: "127.0.0.1", port: desktop.listeningPort), code: "AAAA-AAAA-AAAA-AAAA")
        #expect(!wrong.ok)
        #expect(wrong.error == "That code is not right.")
        await desktop.stopPairing()
        await desktop.setEnabled(true)
        let closed = await laptop.pair(with: (id: desktop.config.deviceId, address: "127.0.0.1", port: desktop.listeningPort), code: "AAAA-AAAA-AAAA-AAAA")
        #expect(closed.error == "This computer is not waiting to pair.")
    }
}
