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
