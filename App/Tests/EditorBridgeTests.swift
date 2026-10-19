import Foundation
import Testing
@testable import SynapseNote

struct EditorBridgeTests {
    @Test func readsKnownMessages() {
        #expect(EditorEvent(body: ["type": "ready"]) == .ready)
        #expect(EditorEvent(body: ["type": "openPage", "pageId": "p"]) == .openPage(pageId: "p", newTab: false, find: nil))
        #expect(EditorEvent(body: ["type": "openPage", "pageId": NSNull()]) == .openPage(pageId: nil, newTab: false, find: nil))
        #expect(EditorEvent(body: ["type": "openPage", "pageId": "p", "newTab": true, "find": "milk"])
            == .openPage(pageId: "p", newTab: true, find: "milk"))
        #expect(EditorEvent(body: ["type": "shortcut", "shortcut": "escape"]) == .shortcut("escape"))
        #expect(EditorEvent(body: ["type": "openView", "view": "tag", "tag": "project"]) == .openView(.tag("project")))
        #expect(EditorEvent(body: ["type": "openView", "view": "tasks"]) == .openView(.tasks))
        #expect(EditorEvent(body: ["type": "openView", "view": "tag"]) == nil)
        #expect(EditorEvent(body: ["type": "openView", "view": "graph"]) == nil)
        #expect(EditorEvent(body: ["type": "rpc", "id": 4, "method": "readText", "params": ["a.md"]])
            == .rpc(id: 4, method: "readText", params: [.string("a.md")]))
        #expect(EditorEvent(body: ["type": "workspace", "pages": ["p": ["id": "p"]], "saveState": "saving", "saveError": NSNull()])
            == .workspace(pages: ["p": .object(["id": .string("p")])], locked: [], sourceMode: nil, saveState: "saving", saveError: nil))
        #expect(EditorEvent(body: ["type": "workspace", "pages": [:] as [String: Any], "locked": ["p"], "sourceMode": "q", "saveState": "saved", "saveError": NSNull()])
            == .workspace(pages: [:], locked: ["p"], sourceMode: "q", saveState: "saved", saveError: nil))
        #expect(EditorEvent(body: ["type": "saveFile", "name": "a.md", "mime": "text/markdown", "data": "aGk="])
            == .saveFile(name: "a.md", mime: "text/markdown", data: Data("hi".utf8)))
        #expect(EditorEvent(body: ["type": "toasts", "toasts": [["id": 2, "message": "Saved", "tone": "info", "action": "Undo"], ["id": 3, "message": "No", "tone": "error", "action": NSNull()]]])
            == .toasts([EditorToast(id: 2, message: "Saved", tone: "info", action: "Undo"), EditorToast(id: 3, message: "No", tone: "error", action: nil)]))
        #expect(EditorEvent(body: ["type": "autoBackup", "json": "{}"]) == .autoBackup(json: "{}"))
        #expect(EditorEvent(body: ["type": "customCss", "css": "a {}"]) == .customCss("a {}"))
        #expect(EditorEvent(body: ["type": "state", "json": "{\"revision\":1}"]) == .state(json: "{\"revision\":1}"))
        #expect(EditorEvent(body: ["type": "state"]) == nil)
        #expect(EditorEvent(body: ["type": "vaultFailed", "message": "gone"]) == .vaultFailed(message: "gone"))
        #expect(EditorEvent(body: ["type": "openExternal", "url": "https://example.com"]) == .openExternal(URL(string: "https://example.com")!))
    }

    @Test func dropsMalformedMessages() {
        #expect(EditorEvent(body: ["type": "eval"]) == nil)
        #expect(EditorEvent(body: "ready") == nil)
        #expect(EditorEvent(body: ["type": "rpc", "method": "scan"]) == nil)
        #expect(EditorEvent(body: ["type": "workspace", "pages": [:] as [String: Any]]) == nil)
        #expect(EditorEvent(body: ["type": "saveFile", "name": "a.md", "mime": "text/markdown", "data": "not base64!"]) == nil)
        #expect(EditorEvent(body: ["type": "toasts"]) == nil)
    }

    @Test func opensOnlyWebAndMailLinks() {
        #expect(EditorEvent(body: ["type": "openExternal", "url": "mailto:a@example.com"]) != nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "file:///etc/hosts"]) == nil)
        #expect(EditorEvent(body: ["type": "openExternal", "url": "javascript:alert(1)"]) == nil)
    }

    @Test func commandsHaveTheShapeThePageReads() {
        #expect(EditorCommand.openVault(name: "Notes", guide: true).json == .object(["type": .string("openVault"), "name": .string("Notes"), "guide": .bool(true)]))
        #expect(EditorCommand.capture("milk").json == .object(["type": .string("capture"), "text": .string("milk")]))
        #expect(EditorCommand.saveCss("a {}").json == .object(["type": .string("saveCss"), "css": .string("a {}")]))
        #expect(EditorCommand.show(pageId: nil, find: nil).json["pageId"] == .null)
        #expect(EditorCommand.show(pageId: "p", find: "milk").json["find"] == .string("milk"))
        #expect(EditorCommand.scrollToHeading(index: 2).json == .object(["type": .string("scrollToHeading"), "index": .number(2)]))
        #expect(EditorCommand.find.json == .object(["type": .string("find")]))
        #expect(EditorCommand.openToday(date: nil).json == .object(["type": .string("openToday"), "date": .null]))
        #expect(EditorCommand.openToday(date: "2026-10-19").json["date"] == .string("2026-10-19"))
        #expect(EditorCommand.createFromTemplate(templateId: "t", parentId: nil).json
            == .object(["type": .string("createFromTemplate"), "templateId": .string("t"), "parentId": .null]))
        #expect(EditorCommand.saveAsTemplate(pageId: "p").json == .object(["type": .string("saveAsTemplate"), "pageId": .string("p")]))
        #expect(EditorCommand.newTemplate.json == .object(["type": .string("newTemplate")]))
        #expect(EditorCommand.openTemplates.json == .object(["type": .string("openTemplates")]))
        #expect(EditorCommand.openHistory(pageId: "p").json == .object(["type": .string("openHistory"), "pageId": .string("p")]))
        #expect(EditorCommand.lockPage(pageId: "p").json["type"] == .string("lockPage"))
        #expect(EditorCommand.unprotectPage(pageId: "p").json["type"] == .string("unprotectPage"))
        #expect(EditorCommand.gradeCard(cardId: "c", grade: "good").json
            == .object(["type": .string("gradeCard"), "cardId": .string("c"), "grade": .string("good")]))
        #expect(EditorCommand.exportMarkdown(pageId: "p").json == .object(["type": .string("exportMarkdown"), "pageId": .string("p")]))
        #expect(EditorCommand.publish(pageId: nil).json == .object(["type": .string("publish"), "pageId": .null]))
        #expect(EditorCommand.publish(pageId: "p").json["pageId"] == .string("p"))
        #expect(EditorCommand.exportAll.json == .object(["type": .string("exportAll")]))
        #expect(EditorCommand.backup.json == .object(["type": .string("backup")]))
        #expect(EditorCommand.restore.json == .object(["type": .string("restore")]))
        #expect(EditorCommand.importMarkdown(parentId: nil).json == .object(["type": .string("importMarkdown"), "parentId": .null]))
        #expect(EditorCommand.deleteUnusedFiles.json == .object(["type": .string("deleteUnusedFiles")]))
        #expect(EditorCommand.setSourceMode(pageId: "p").json == .object(["type": .string("setSourceMode"), "pageId": .string("p")]))
        #expect(EditorCommand.toastAction(id: 4).json == .object(["type": .string("toastAction"), "id": .number(4)]))
        #expect(EditorCommand.dismissToast(id: 4).json == .object(["type": .string("dismissToast"), "id": .number(4)]))
        #expect(EditorCommand.rpcResult(id: 2, result: .success(.bool(true))).json
            == .object(["type": .string("rpcResult"), "id": .number(2), "ok": .bool(true), "value": .bool(true)]))
        #expect(EditorCommand.rpcResult(id: 2, result: .failure(.init(message: "no"))).json["error"] == .string("no"))
        let change = VaultFileSystem.Change(path: "a.md", text: nil, mtime: 1, birthtime: 0, dir: false, other: false)
        #expect(EditorCommand.vaultChanges([change]).json["changes"]
            == .array([.object(["path": .string("a.md"), "text": .null, "mtime": .number(1), "birthtime": .number(0), "dir": .bool(false), "other": .bool(false)])]))
        #expect(EditorCommand.createPage(parentId: "p").json["parentId"] == .string("p"))
        #expect(EditorCommand.createPage(parentId: "p").json["kind"] == .string("page"))
        #expect(EditorCommand.createPage(parentId: nil, kind: .database).json["kind"] == .string("database"))
        #expect(EditorCommand.createPage(parentId: nil, kind: .canvas).json["kind"] == .string("canvas"))
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
