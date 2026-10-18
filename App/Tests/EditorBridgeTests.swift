import Foundation
import Testing
@testable import SynapseNote

struct EditorBridgeTests {
    @Test func readsKnownMessages() {
        #expect(EditorEvent(body: ["type": "ready"]) == .ready)
        #expect(EditorEvent(body: ["type": "openPage", "pageId": "p"]) == .openPage(pageId: "p"))
        #expect(EditorEvent(body: ["type": "openPage", "pageId": NSNull()]) == .openPage(pageId: nil))
        #expect(EditorEvent(body: ["type": "rpc", "id": 4, "method": "readText", "params": ["a.md"]])
            == .rpc(id: 4, method: "readText", params: [.string("a.md")]))
        #expect(EditorEvent(body: ["type": "workspace", "pages": ["p": ["id": "p"]], "saveState": "saving", "saveError": NSNull()])
            == .workspace(pages: ["p": .object(["id": .string("p")])], saveState: "saving", saveError: nil))
        #expect(EditorEvent(body: ["type": "vaultFailed", "message": "gone"]) == .vaultFailed(message: "gone"))
        #expect(EditorEvent(body: ["type": "openExternal", "url": "https://example.com"]) == .openExternal(URL(string: "https://example.com")!))
    }

    @Test func dropsMalformedMessages() {
        #expect(EditorEvent(body: ["type": "eval"]) == nil)
        #expect(EditorEvent(body: "ready") == nil)
        #expect(EditorEvent(body: ["type": "rpc", "method": "scan"]) == nil)
        #expect(EditorEvent(body: ["type": "workspace", "pages": [:] as [String: Any]]) == nil)
    }

    @Test func opensOnlyWebAndMailLinks() {
        #expect(EditorEvent(body: ["type": "openExternal", "url": "mailto:a@example.com"]) != nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "file:///etc/hosts"]) == nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "javascript:alert(1)"]) == nil)
    }

    @Test func commandsHaveTheShapeThePageReads() {
        #expect(EditorCommand.openVault(name: "Notes").json == .object(["type": .string("openVault"), "name": .string("Notes")]))
        #expect(EditorCommand.show(pageId: nil).json["pageId"] == .null)
        #expect(EditorCommand.rpcResult(id: 2, result: .success(.bool(true))).json
            == .object(["type": .string("rpcResult"), "id": .number(2), "ok": .bool(true), "value": .bool(true)]))
        #expect(EditorCommand.rpcResult(id: 2, result: .failure(.init(message: "no"))).json["error"] == .string("no"))
        let change = VaultFileSystem.Change(path: "a.md", text: nil, mtime: 1, birthtime: 0, dir: false, other: false)
        #expect(EditorCommand.vaultChanges([change]).json["changes"]
            == .array([.object(["path": .string("a.md"), "text": .null, "mtime": .number(1), "birthtime": .number(0), "dir": .bool(false), "other": .bool(false)])]))
        #expect(EditorCommand.createPage(parentId: "p").json["parentId"] == .string("p"))
        #expect(EditorCommand.theme(dark: true).json["theme"] == .string("dark"))
    }

    @Test func rpcRunsVaultCalls() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "rpc-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let files = VaultFileSystem(root: root, trash: { _ in throw CocoaError(.featureUnsupported) })
        let written = try VaultRPC.run("apply", [.array([.object(["op": .string("write"), "path": .string("a.md"), "text": .string("hello")])])], on: files)
        #expect(written == .array([.object(["ok": .bool(true)])]))
        #expect(try VaultRPC.run("readText", [.string("a.md")], on: files) == .string("hello"))
        #expect(try VaultRPC.run("exists", [.string("b.md")], on: files) == .bool(false))
        #expect(try VaultRPC.run("createFile", [.string("x.bin"), .string("AQI=")], on: files) == .null)
        #expect(try VaultRPC.run("readBytes", [.string("x.bin")], on: files) == .string("AQI="))
        let scan = try VaultRPC.run("scan", [], on: files)
        #expect(scan["files"]?.objectValue == nil)
        if case .array(let scanned)? = scan["files"] { #expect(scanned.count == 1) } else { Issue.record("scan has no files") }
        #expect(throws: (any Error).self) { try VaultRPC.run("readText", [.string("../outside.md")], on: files) }
        #expect(throws: (any Error).self) { try VaultRPC.run("eval", [], on: files) }
    }
}
