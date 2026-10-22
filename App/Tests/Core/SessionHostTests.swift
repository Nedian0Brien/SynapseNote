import Foundation
import Testing
@testable import SynapseNote

/// The vault's Swift session on a real folder (11e-2): opening with the welcome guide, commands applied in
/// order, saves made on its own after Morrow's delay, outside edits, encrypted pages, history and flashcards,
/// and what the page screens read.
@MainActor
struct SessionHostTests {
    /// what the host reported
    final class Reports {
        var list: [SessionHost.Report] = []
        var failures: [String] = []
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

    private func open(_ root: URL, _ reports: Reports = Reports(), guide: Bool = false) async throws -> (SessionHost, SessionHost.Opened) {
        let files = VaultFileSystem(root: root, trash: { _ in throw CocoaError(.featureUnsupported) })
        let host = SessionHost(files: files, report: { reports.list.append($0) }, failed: { reports.failures.append($0) })
        let result = await withCheckedContinuation { continuation in
            host.begin(guide: guide) { continuation.resume(returning: $0) }
        }
        return (host, try result.get())
    }

    private func execute(_ host: SessionHost, _ commands: [JSValue], all: Bool = false) async -> CommandFailure? {
        await withCheckedContinuation { continuation in
            host.execute(commands, all: all) { continuation.resume(returning: $0) }
        }
    }

    private func ids(_ opened: SessionHost.Opened) -> [String: String] {
        Dictionary(opened.report.pages.map { ($0.title, $0.id) }, uniquingKeysWith: { first, _ in first })
    }

    private func text(_ root: URL, _ path: String) -> String? {
        (try? Data(contentsOf: root.appending(path: path))).map { String(decoding: $0, as: UTF8.self) }
    }

    /// lets reports queued on the main actor by the host arrive
    private func settle(_ milliseconds: Int = 50) async {
        try? await Task.sleep(for: .milliseconds(milliseconds))
        for _ in 0..<20 { await Task.yield() }
    }

    @Test func opensRenamesAndSaves() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let reports = Reports()
        let (host, opened) = try await open(root, reports)
        let id = try #require(ids(opened)["Note"])
        #expect(opened.problems == 0)
        #expect(opened.report.save.state == .saved)

        #expect(await execute(host, [["type": "page.rename", "id": .string(id), "title": "Renamed", "now": 5]]) == nil)
        #expect(await host.flush())
        #expect(text(root, "Renamed.md") == "Hello\n")
        #expect(text(root, "Note.md") == nil)
        #expect(await host.pathOf(id) == "Renamed.md")
        await settle()
        #expect(reports.list.last?.pages.first?.title == "Renamed")
        #expect(reports.list.last?.save.state == .saved)
        await host.close()
    }

    /// Morrow's save queue: 300 ms after the last change, with nobody asking
    @Test func savesOnItsOwnAfterTheDelay() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let reports = Reports()
        let (host, opened) = try await open(root, reports)
        let id = try #require(ids(opened)["Note"])
        _ = await execute(host, [["type": "page.setDoc", "id": .string(id), "doc": .object(MarkdownParse.markdownToDoc("Typed")), "now": 9]])
        await settle()
        #expect(reports.list.last?.save.state == .pending)
        #expect(text(root, "Note.md") == "Hello\n")
        await settle(600)
        #expect(text(root, "Note.md") == "Typed\n")
        #expect(reports.list.last?.save.state == .saved)
        await host.close()
    }

    @Test func refusedCommandsSayWhy() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let (host, opened) = try await open(root)
        let id = try #require(ids(opened)["Note"])
        #expect(await execute(host, [["type": "page.rename", "id": "missing", "title": "x", "now": 1]]) != nil)
        // all or none: the rename before the refused command is not kept
        let refused = await execute(host, [["type": "page.rename", "id": .string(id), "title": "Kept?", "now": 1],
                                           ["type": "page.rename", "id": "missing", "title": "x", "now": 1]], all: true)
        #expect(refused != nil)
        #expect(await host.context()?.state.pages[id]?.title == "Note")
        #expect(await execute(host, [["type": "no.such"]]) != nil)
        await host.close()
    }

    /// the page screens (11d): which screen draws a page, and the Markdown source read and read back
    @Test func choosesPageScreensAndReadsSourceAsMorrowDoes() async throws {
        let root = try folder([
            "Note.md": "Hello [[Other]]\n\n![pic](attachments/Pic.png)\n",
            "Other.md": "Other\n",
            "Broken.md": "---\n- a\n- b\n---\nBody\n",
            "attachments/Pic.png": "png",
        ])
        let (host, opened) = try await open(root)
        let ids = ids(opened)
        let note = try #require(ids["Note"])
        let other = try #require(ids["Other"])
        let broken = try #require(ids["Broken"])

        #expect(await host.screen(of: note, sourceMode: false) == .editor)
        #expect(await host.screen(of: note, sourceMode: true) == .source)
        // a page that could not be read has no document; Morrow's PageView takes an empty one
        #expect(await host.screen(of: broken, sourceMode: true) == .unreadable)
        #expect(await host.markdown(of: broken) == "")
        #expect(await host.screen(of: "missing", sourceMode: true) == .none)

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
        _ = await execute(host, [["type": "page.setDoc", "id": .string(other), "doc": unknown, "now": 9]])
        #expect(await host.screen(of: other, sourceMode: false) == .unknown(types: ["mystery"], plain: "kept"))
        // the source wins over it, as in Morrow's PageView
        #expect(await host.screen(of: other, sourceMode: true) == .source)
        // known content the editor does not open, an empty text node here, is shown as plain text as well
        let empty: JSValue = ["type": "doc", "content": [["type": "paragraph", "content": [["type": "text", "text": ""], ["type": "text", "text": "left"]]]]]
        _ = await execute(host, [["type": "page.setDoc", "id": .string(other), "doc": empty, "now": 10]])
        #expect(await host.screen(of: other, sourceMode: false) == .invalid(plain: "left"))
        await host.close()
    }

    /// the database screen (11d-3): chosen for a database page, and its data read in one go
    @Test func readsADatabaseForItsScreen() async throws {
        let root = try folder(["Home.md": "Home\n"])
        let (host, _) = try await open(root)
        let database = DatabaseDef(properties: [
            PropDef(id: "rel", name: "Related", type: "relation", options: []),
            PropDef(id: "status", name: "Status", type: "select", options: [SelectOption(id: "todo", name: "To do", color: "gray")]),
        ], views: [ViewDef(id: "v", name: "Table", type: "table", filters: [], sorts: [], groupBy: nil, dateProp: nil, hidden: [])])
        let doc: JSValue = ["type": "doc", "content": [
            ["type": "image", "attrs": ["fileId": "attachments/a.png"]],
            ["type": "taskList", "content": [["type": "taskItem", "attrs": ["checked": true]], ["type": "taskItem", "attrs": ["checked": false]]]],
        ]]
        let commands: [JSValue] = [
            // a database page is made with its kind, as Morrow's createPage makes one
            ["type": "page.create", "id": "db", "parentId": nil, "now": 1, "title": "Tasks", "kind": "database"],
            WorkspaceCommand.setDatabase(id: "db", database: database).morrow(now: 2),
            WorkspaceCommand.createPage(id: "r1", parentId: "db", title: "One", properties: JSObject([("rel", .array(["home", "Nowhere"]))])).morrow(now: 3),
            WorkspaceCommand.createPage(id: "r2", parentId: "db", title: "Two", properties: JSObject()).morrow(now: 4),
            WorkspaceCommand.setDoc(id: "r1", doc: doc.object!).morrow(now: 5),
            WorkspaceCommand.setProperties(id: "r2", values: JSObject([("status", "todo")])).morrow(now: 6),
        ]
        #expect(await execute(host, commands, all: true) == nil)

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

    /// the canvas screen (11d-4): chosen for a canvas page, its data and page cards, and its file written back
    @Test func readsAndWritesACanvasForItsScreen() async throws {
        let board = #"{"nodes":[{"id":"t","type":"text","text":"hi","x":0,"y":0,"width":250,"height":60},{"id":"p","type":"file","file":"Home.md","x":300,"y":0,"width":400,"height":240}],"edges":[]}"#
        let root = try folder(["Home.md": "Home text\n", "Board.canvas": board, "Bad.canvas": "{not json"])
        let (host, opened) = try await open(root)
        let ids = ids(opened)
        let boardId = try #require(ids["Board"])
        let home = try #require(ids["Home"])
        #expect(await host.screen(of: boardId, sourceMode: true) == .canvas(unreadable: false))
        #expect(await host.screen(of: try #require(ids["Bad"]), sourceMode: false) == .canvas(unreadable: true))

        let snapshot = try #require(await host.canvas(boardId))
        #expect(snapshot.data.nodes.map(CanvasEdits.id) == ["t", "p"])
        #expect(snapshot.data.nodes[1]["pageId"] == .string(home))
        #expect(snapshot.pages[home] == .init(title: "Home", icon: nil, snippet: "Home text"))
        #expect(await host.canvas(home) == nil)

        // a card added on the screen reaches the file, pages written as their file
        var data = snapshot.data
        data = CanvasEdits.add(data, CanvasEdits.textCard(at: .init(x: 125, y: 130), id: "n"))
        _ = await execute(host, [WorkspaceCommand.setDoc(id: boardId, doc: CanvasFile.canvasDoc(data)).morrow(now: 7)])
        #expect(await host.flush())
        let written = try #require(text(root, "Board.canvas"))
        #expect(written.hasPrefix("{\n\t\"nodes\": ["))
        #expect(written.contains(#""type": "file",\#n\#t\#t\#t"file": "Home.md""#))
        #expect(written.contains(#""id": "n""#))
        // opening a canvas never records it (Morrow's PageView), a page is
        host.markOpened(boardId)
        host.markOpened(home)
        let state = try #require(await host.context()?.state)
        #expect(state.pages[boardId]?.lastOpenedAt == nil)
        #expect(state.pages[home]?.lastOpenedAt != nil)
        await host.close()
    }

    /// Morrow's main.tsx: a vault opened for the first time gets the welcome guide, saved, and never again
    @Test func aNewVaultGetsTheGuideOnce() async throws {
        let root = try folder([:])
        let (host, opened) = try await open(root, guide: true)
        let titles = opened.report.pages.map(\.title)
        #expect(titles.contains("Welcome to SynapseNote"))
        #expect(text(root, "Welcome to SynapseNote.md") != nil)
        await host.close()
        let (again, reopened) = try await open(root, guide: true)
        #expect(reopened.report.pages.count == opened.report.pages.count)
        await again.close()

        // a folder about to be filled from another device gets none
        let (empty, none) = try await open(try folder([:]), guide: false)
        #expect(none.report.pages.isEmpty)
        await empty.close()
    }

    /// Morrow's applyExternal: a page with unsaved changes keeps them, and the other version goes to its history
    @Test func outsideEditsKeepUnsavedPages() async throws {
        let root = try folder(["Note.md": "Hello\n", "Other.md": "Other\n"])
        let reports = Reports()
        let (host, opened) = try await open(root, reports)
        let ids = ids(opened)
        let note = try #require(ids["Note"])
        let other = try #require(ids["Other"])

        // another app edits both pages; meanwhile Other has an edit here not saved yet
        try Data("Edited elsewhere\n".utf8).write(to: root.appending(path: "Note.md"))
        try Data("Other, edited elsewhere\n".utf8).write(to: root.appending(path: "Other.md"))
        _ = await execute(host, [["type": "page.setDoc", "id": .string(other), "doc": .object(MarkdownParse.markdownToDoc("Typed here")), "now": 9]])
        host.changed(["Note.md", "Other.md"])
        #expect(await host.flush())

        let context = try #require(await host.context())
        #expect(Doc.docToPlainText(context.state.docs[note]!) == "Edited elsewhere")
        // the edit made here wins on disk, and the other app's version is kept in the page's history
        #expect(text(root, "Other.md") == "Typed here\n")
        let history = await host.snapshots(other).map { Doc.docToPlainText($0.doc) }
        #expect(Set(history) == ["Other, edited elsewhere", "Typed here"])
        await settle()
        #expect(reports.list.contains { $0.pages.contains { $0.id == note } })
        await host.close()
    }

    @Test func encryptsLocksAndUnlocksPages() async throws {
        let root = try folder(["Secret.md": "Hidden words\n"])
        let reports = Reports()
        let (host, opened) = try await open(root, reports)
        let id = try #require(ids(opened)["Secret"])
        #expect(await host.protect(id, password: "pass") == nil)
        let file = try #require(text(root, "Secret.md"))
        #expect(!file.contains("Hidden words"))
        await host.lock(id)
        await settle()
        #expect(reports.list.last?.locked == [id])
        #expect(await host.screen(of: id, sourceMode: false) == .none)
        #expect(await host.unlock(id, password: "wrong") != nil)
        #expect(await host.unlock(id, password: "pass") == nil)
        #expect(await host.editorDoc(id).map(Doc.docToPlainText) == "Hidden words")
        #expect(await host.unprotect(id) == nil)
        #expect(text(root, "Secret.md")?.contains("Hidden words") == true)
        await host.close()
    }

    /// Morrow's restoreVersion: the version it replaces is kept first
    @Test func restoresAVersion() async throws {
        let root = try folder(["Note.md": "First\n"])
        let (host, opened) = try await open(root)
        let id = try #require(ids(opened)["Note"])
        // a version is kept as a page is saved, at most one every few minutes
        _ = await execute(host, [["type": "page.setDoc", "id": .string(id), "doc": .object(MarkdownParse.markdownToDoc("Second")), "now": 9]])
        #expect(await host.flush())
        _ = await execute(host, [["type": "page.setDoc", "id": .string(id), "doc": .object(MarkdownParse.markdownToDoc("Third")), "now": 10]])
        #expect(await host.flush())
        let second = try #require(await host.snapshots(id).first { Doc.docToPlainText($0.doc) == "Second" })
        #expect(await host.restore(second) == nil)
        #expect(await host.flush())
        #expect(text(root, "Note.md") == "Second\n")
        #expect(await host.snapshots(id).contains { Doc.docToPlainText($0.doc) == "Third" })
        await host.close()
    }

    /// Morrow's app/review.ts: a grade counts at once and reaches .morrow/review.json after its delay or a save
    @Test func gradesCardsAndKeepsTheirProgress() async throws {
        let root = try folder(["Cards.md": "Capital of France :: Paris\n"])
        let (host, _) = try await open(root)
        let card = try #require(await host.context().map { Flashcards.collectCards($0.state) }?.first)
        host.grade(card.id, "good")
        let graded = try #require(await host.context())
        #expect(graded.reviewLog[card.id]?["reps"] == 1)
        #expect(text(root, ".morrow/review.json") == nil)
        #expect(await host.flush())
        let saved = try JSJSON.parse(try #require(text(root, ".morrow/review.json")))
        #expect(saved["version"] == 1)
        #expect(saved["cards"]?[card.id]?["reps"] == 1)
        await host.close()
        // read back when the vault opens again
        let (again, _) = try await open(root)
        #expect(await again.context()?.reviewLog[card.id]?["reps"] == 1)
        await again.close()
    }

    @Test func storesFiles() async throws {
        let root = try folder(["Note.md": "Hello\n"])
        let (host, _) = try await open(root)
        let meta = FileMeta(id: "x", name: "photo.png", type: "image/png", size: 2, createdAt: 1)
        let stored = try await host.addFiles([(meta, Data([1, 2]))]).get()
        #expect(stored.first?.id == "attachments/photo.png")
        #expect(await host.file("attachments/photo.png")?.data == Data([1, 2]))
        #expect(await host.files().map(\.id) == ["attachments/photo.png"])
        await host.close()
    }
}
