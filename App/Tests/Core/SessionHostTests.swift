import Foundation
import Testing
@testable import SynapseNote

/// The Swift session behind the editor page (11c-2), on a real folder: the page's storage calls, commands applied
/// in order, saves, and outside edits that wait for the page's answer while nothing else writes.
@MainActor
struct SessionHostTests {
    /// what the host sent the page
    final class Page {
        var external: [(id: Int, json: String)] = []
        var info: [String] = []
        var resync: [String] = []
    }

    private func folder(_ files: [String: String]) throws -> URL {
        let root = FileManager.default.temporaryDirectory.appending(path: "host-\(UUID().uuidString)")
        for (path, text) in files {
            let url = root.appending(path: path)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: url)
        }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func host(_ root: URL, _ page: Page) -> SessionHost {
        let files = VaultFileSystem(root: root, trash: { _ in throw CocoaError(.featureUnsupported) })
        let host = SessionHost(files: files, sendExternal: { page.external.append(($0, $1)) }, sendInfo: { page.info.append($0) },
                               sendResync: { page.resync.append($0) })
        host.begin { Issue.record("could not open: \($0)") }
        return host
    }

    private func call(_ host: SessionHost, _ method: String, _ params: [String] = []) async -> Result<JSONValue, EditorCommand.RPCFailure> {
        await withCheckedContinuation { continuation in
            host.call(method, params.map(JSONValue.string)) { continuation.resume(returning: $0) }
        }
    }

    private func json(_ result: Result<JSONValue, EditorCommand.RPCFailure>) throws -> JSValue {
        guard case .success(.string(let text)) = result else { throw EditorCommand.RPCFailure(message: "\(result)") }
        return try JSJSON.parse(text)
    }

    private func text(_ root: URL, _ path: String) -> String? {
        (try? Data(contentsOf: root.appending(path: path))).map { String(decoding: $0, as: UTF8.self) }
    }

    /// lets work queued on the main actor by the host run
    private func settle() async {
        for _ in 0..<20 { await Task.yield() }
        try? await Task.sleep(for: .milliseconds(50))
    }

    @Test func opensSavesAndRenamesAsThePageAsks() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let host = host(root, Page())
        let opened = try json(await call(host, "open"))
        let page = try #require(opened["pages"]?.array?.first)
        let id = try #require(page["id"]?.string)
        #expect(page["title"] == "Note")
        #expect(opened["firstRun"] == false)
        #expect(opened["info"]?["paths"]?[id] == "Note.md")

        host.apply(commandsJSON: JSJSON.stringify(["commands": [["type": "page.rename", "id": .string(id), "title": "Renamed", "now": 5]], "all": false]))
        let saved = try json(await call(host, "flush"))
        #expect(saved["ok"] == true)
        #expect(saved["info"]?["paths"]?[id] == "Renamed.md")
        #expect(text(root, "Renamed.md") == "Hello\n")
        #expect(text(root, "Note.md") == nil)
        // a page opened again after its process ended gets the session as it is
        let again = try json(await call(host, "open"))
        #expect(again["pages"]?.array?.first?["title"] == "Renamed")
        await host.close()
    }

    /// the app's own page screens (11d-2): which pages it draws, and the Markdown source read and read back
    @Test func choosesPageScreensAndReadsSourceAsMorrowDoes() async throws {
        let root = try folder([
            "Note.md": "Hello [[Other]]\n\n![pic](attachments/Pic.png)\n",
            "Other.md": "Other\n",
            "Broken.md": "---\n- a\n- b\n---\nBody\n",
            "attachments/Pic.png": "png",
        ])
        let host = host(root, Page())
        let opened = try json(await call(host, "open"))
        let ids = JSObject((opened["pages"]?.array ?? []).map { ($0["title"]!.string!, $0["id"]!) })
        let note = try #require(ids["Note"]?.string)
        let other = try #require(ids["Other"]?.string)
        let broken = try #require(ids["Broken"]?.string)

        #expect(await host.screen(of: note, sourceMode: false) == .web)
        #expect(await host.screen(of: note, sourceMode: true) == .source)
        // a page that could not be read has no document; Morrow's PageView takes an empty one
        #expect(await host.screen(of: broken, sourceMode: true) == .unreadable)
        #expect(await host.markdown(of: broken) == "")
        #expect(await host.screen(of: "missing", sourceMode: true) == .web)

        // the text opens with links under the pages' titles and files under their vault paths
        let source = try #require(await host.markdown(of: note))
        #expect(source == "Hello [[Other]]\n\n![pic](attachments/Pic.png)\n")
        // and reads back with the link to the page and the picture by path or by name
        let doc = try #require(await host.readMarkdown("Hello [[Other]] and ![p](./pic.PNG) ![q](attachments/Pic.png)\n"))
        let blocks = doc["content"]?.array ?? []
        #expect(blocks.first?["content"]?.array?.first { $0["type"] == "pageLink" }?["attrs"]?["id"] == .string(other))
        let images = blocks.filter { $0["type"] == "image" }
        #expect(images.count == 2)
        #expect(images.allSatisfy { $0["attrs"]?["fileId"] == "attachments/Pic.png" })
        // a broken escape in a file path saves nothing, as Morrow's decodeURIComponent throws
        #expect(await host.readMarkdown("![p](%E0%A4%A.png)\n") == nil)

        // content this version does not know is shown as plain text
        let unknown: JSValue = ["type": "doc", "content": [["type": "mystery", "content": [["type": "paragraph", "content": [["type": "text", "text": "kept"]]]]]]]
        host.apply(commandsJSON: JSJSON.stringify(["commands": [["type": "page.setDoc", "id": .string(other), "doc": unknown, "now": 9]], "all": false]))
        #expect(await host.screen(of: other, sourceMode: false) == .unknown(types: ["mystery"], plain: "kept"))
        // the source wins over it, as in Morrow's PageView
        #expect(await host.screen(of: other, sourceMode: true) == .source)
        await host.close()
    }

    /// the database screen (11d-3): chosen for a database page, and its data read in one go
    @Test func readsADatabaseForItsScreen() async throws {
        let root = try folder(["Home.md": "Home\n"])
        let host = host(root, Page())
        _ = try json(await call(host, "open"))
        let database = DatabaseDef(properties: [
            PropDef(id: "rel", name: "Related", type: "relation", options: []),
            PropDef(id: "status", name: "Status", type: "select", options: [SelectOption(id: "todo", name: "To do", color: "gray")]),
        ], views: [ViewDef(id: "v", name: "Table", type: "table", filters: [], sorts: [], groupBy: nil, dateProp: nil, hidden: [])])
        let doc: JSValue = ["type": "doc", "content": [
            ["type": "image", "attrs": ["fileId": "attachments/a.png"]],
            ["type": "taskList", "content": [["type": "taskItem", "attrs": ["checked": true]], ["type": "taskItem", "attrs": ["checked": false]]]],
        ]]
        let commands: [JSValue] = [
            WorkspaceCommand.createPage(id: "db", parentId: nil, title: "Tasks", properties: JSObject()).morrow(now: 1),
            WorkspaceCommand.setDatabase(id: "db", database: database).morrow(now: 2),
            WorkspaceCommand.createPage(id: "r1", parentId: "db", title: "One", properties: JSObject([("rel", .array(["home", "Nowhere"]))])).morrow(now: 3),
            WorkspaceCommand.createPage(id: "r2", parentId: "db", title: "Two", properties: JSObject()).morrow(now: 4),
            WorkspaceCommand.setDoc(id: "r1", doc: doc.object!).morrow(now: 5),
            WorkspaceCommand.setProperties(id: "r2", values: JSObject([("status", "todo")])).morrow(now: 6),
        ]
        var kinded = commands
        // a database page is made with its kind, as Morrow's createPage makes one
        kinded[0] = ["type": "page.create", "id": "db", "parentId": nil, "now": 1, "title": "Tasks", "kind": "database"]
        host.apply(commandsJSON: JSJSON.stringify(["commands": .array(kinded), "all": true]))

        #expect(await host.screen(of: "db", sourceMode: true) == .database(editable: true))
        let snapshot = try #require(await host.database("db"))
        #expect(snapshot.database == database)
        #expect(snapshot.rows.map(\.id) == ["r1", "r2"])
        #expect(snapshot.rows[1].properties["status"] == "todo")
        #expect(snapshot.firstImages == ["r1": "attachments/a.png"])
        #expect(snapshot.progress["r1"]?.done == 1 && snapshot.progress["r1"]?.total == 2)
        #expect(snapshot.progress["r2"]?.total == 0)
        let home = try #require(snapshot.relations["home"])
        #expect(home.title == "Home")
        #expect(snapshot.relations["Nowhere"] == nil)
        #expect(await host.database("r1") == nil)
        #expect(await host.findPages("ho", excluding: "r1").map(\.title) == ["Home"])
        #expect(await host.findPages("one", excluding: "r1").isEmpty)
        await host.close()
    }

    @Test func aNewVaultGetsTheGuideOnce() async throws {
        let root = try folder([:])
        let host = host(root, Page())
        #expect(try json(await call(host, "open"))["firstRun"] == true)
        #expect(try json(await call(host, "open"))["firstRun"] == false)
        await host.close()
    }

    @Test func savesWaitWhileThePageDecidesOnAnOutsideEdit() async throws {
        let root = try folder(["Note.md": "Hello\n", "Other.md": "Other\n"])
        let page = Page()
        let host = host(root, page)
        let opened = try json(await call(host, "open"))
        let ids = JSObject((opened["pages"]?.array ?? []).map { ($0["title"]!.string!, $0["id"]!) })
        let note = try #require(ids["Note"]?.string)
        let other = try #require(ids["Other"]?.string)
        host.webIsReady()

        // another app edits both pages; meanwhile the page has an unsaved edit of Other
        try Data("Edited elsewhere\n".utf8).write(to: root.appending(path: "Note.md"))
        try Data("Other, edited elsewhere\n".utf8).write(to: root.appending(path: "Other.md"))
        host.apply(commandsJSON: JSJSON.stringify(["commands": [["type": "page.setDoc", "id": .string(other), "doc": .object(MarkdownParse.markdownToDoc("Typed here")), "now": 9]], "all": false]))
        host.changed(["Note.md", "Other.md"])
        await settle()
        let sent = try #require(page.external.first)
        let patch = try JSJSON.parse(sent.json)
        #expect(patch["pages"]?.array?.count == 2)

        // the page's save waits until the page has answered
        let flushed = Task { try json(await call(host, "flush")) }
        await settle()
        #expect(text(root, "Other.md") == "Other, edited elsewhere\n")
        host.externalAccepted(id: sent.id, accepted: [note])
        let saved = try await flushed.value
        #expect(saved["ok"] == true)

        let context = try #require(await host.context())
        #expect(Doc.docToPlainText(context.state.docs[note]!) == "Edited elsewhere")
        // the edit made here wins on disk, and the other app's version is kept in the page's history
        #expect(text(root, "Other.md") == "Typed here\n")
        // its first save keeps a version as well, as any first save of a page does
        let history = (try json(await call(host, "listSnapshots", [other])).array ?? []).map { Doc.docToPlainText($0["doc"]?.object ?? JSObject()) }
        #expect(Set(history) == ["Other, edited elsewhere", "Typed here"])
        #expect(page.info.count == 1)
        await host.close()
    }

    @Test func withoutThePageTheSessionTakesOutsideEditsAlone() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let page = Page()
        let host = host(root, page)
        let opened = try json(await call(host, "open"))
        let note = try #require(opened["pages"]?.array?.first?["id"]?.string)

        // nothing is read while no page is ready to answer
        try Data("Changed\n".utf8).write(to: root.appending(path: "Note.md"))
        host.changed(["Note.md"])
        await settle()
        #expect(page.external.isEmpty)
        host.webIsReady()
        await settle()
        #expect(page.external.count == 1)

        // the page's process ends before it answers
        host.webGone()
        let context = try #require(await host.context())
        #expect(Doc.docToPlainText(context.state.docs[note]!) == "Changed")
        #expect(await host.flushAlone())
        await host.close()
    }

    @Test func refusedCommandsSendTheSessionsVersionBack() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let page = Page()
        let host = host(root, page)
        _ = try json(await call(host, "open"))
        host.apply(commandsJSON: JSJSON.stringify(["commands": [["type": "page.rename", "id": "missing", "title": "x", "now": 1]], "all": false]))
        await settle()
        let resync = try JSJSON.parse(try #require(page.resync.first))
        #expect(resync["removed"] == ["missing"])
        await host.close()
    }

    @Test func thePageCannotReachFilesDirectly() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let host = host(root, Page())
        _ = try json(await call(host, "open"))
        for method in ["apply", "createFile", "scan", "readText"] {
            guard case .failure = await call(host, method, ["Note.md"]) else {
                Issue.record("\(method) answered")
                continue
            }
        }
        #expect(await call(host, "readMeta", ["../outside.json"]) == .success(.null))
        await host.close()
    }

    @Test func filesAndMorrowsOwnFiles() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let host = host(root, Page())
        _ = try json(await call(host, "open"))
        let stored = try json(await call(host, "putFiles", [JSJSON.stringify([["meta": ["id": "x", "name": "photo.png", "type": "image/png", "size": 2, "createdAt": 1], "data": "AQI="]])]))
        #expect(stored.array?.first?["id"] == "attachments/photo.png")
        let file = try json(await call(host, "getFile", ["attachments/photo.png"]))
        #expect(file["data"] == "AQI=")
        #expect(await call(host, "writeMeta", ["review.json", "{\"version\":1,\"cards\":{\"c\":{\"due\":\"2026-10-20\"}}}"]) == .success(.null))
        let context = try #require(await host.context())
        #expect(context.reviewLog["c"]?["due"] == "2026-10-20")
        #expect(context.reviewLog["c"]?["ease"] == 2.5)
        // a grade reaches the session at once, before the page writes the file
        host.setReviewLog(json: "{\"d\":{\"due\":\"2026-10-22\",\"interval\":2,\"ease\":2.6,\"reps\":2,\"lapses\":0}}")
        let graded = try #require(await host.context())
        #expect(graded.reviewLog.keys == ["d"])
        #expect(graded.reviewLog["d"]?["interval"] == 2)
        await host.close()
    }
}
