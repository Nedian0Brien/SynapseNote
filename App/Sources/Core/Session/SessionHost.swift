import Foundation
import os

/// The open vault's Swift session on a serial queue of its own (11c-2). The editor page applies every command
/// itself, for its screens, and sends it here in order; the session applies the same command and is the only one
/// that writes the vault. When to save is the page's save queue's call (`flush`), except when the page cannot ask:
/// closing, going to the background, the page's process ending.
///
/// Every call is put on the queue the moment it arrives, so the queue keeps the order the page sent things in.
/// Outside edits are read here first, then the page decides what it takes (it saves its open editors first, and
/// keeps pages with unsaved changes), and only that is committed. While a read waits for that answer, everything
/// that could write waits behind it, so nothing moves the files between the read and its commit; commands still
/// apply, since they only change the workspace in memory.
nonisolated final class SessionHost: @unchecked Sendable {
    let bridge: FileVaultBridge
    private let queue = DispatchQueue(label: "com.synapsenote.native.session")
    private let logger = Logger(subsystem: "com.synapsenote.native", category: "session")
    /// hands a patch (JSON text) to the page under an id the page answers with
    private let sendExternal: @MainActor @Sendable (Int, String) -> Void
    /// tells the page where pages lie and the saves per day (JSON text)
    private let sendInfo: @MainActor @Sendable (String) -> Void
    /// hands the page the session's version of pages it got out of step with (JSON text)
    private let sendResync: @MainActor @Sendable (String) -> Void

    // only touched on `queue`
    private var session: CoreSession?
    private var reviewLog = JSObject()
    private var openedBefore = false
    private var webReady = false
    private var awaiting: (id: Int, read: VaultWriter.ExternalRead)?
    private var held: [() -> Void] = []
    /// paths seen while no page could answer, read once one can
    private var deferred: [Set<String>] = []
    private var lastExternalId = 0

    init(files: VaultFileSystem, sendExternal: @escaping @MainActor @Sendable (Int, String) -> Void,
         sendInfo: @escaping @MainActor @Sendable (String) -> Void, sendResync: @escaping @MainActor @Sendable (String) -> Void) {
        bridge = FileVaultBridge(files: files)
        self.sendExternal = sendExternal
        self.sendInfo = sendInfo
        self.sendResync = sendResync
    }

    // MARK: running work

    /// work that may write: it waits while an outside-edit read waits for the page
    private func whenFree(_ work: @escaping () -> Void) {
        if awaiting != nil { held.append(work) } else { work() }
    }

    private func drain() {
        while awaiting == nil, !held.isEmpty { held.removeFirst()() }
    }

    /// puts the work on the queue now and hands its result to `done` there
    private func submit<T>(writes: Bool, _ body: @escaping () -> T, done: @escaping (T) -> Void) {
        // both run on `queue` only, which is what confines the session and everything they touch
        nonisolated(unsafe) let body = body
        nonisolated(unsafe) let done = done
        queue.async { [self] in
            if writes { whenFree { done(body()) } } else { done(body()) }
        }
    }

    private func run<T: Sendable>(writes: Bool = true, _ body: @escaping () -> T) async -> T {
        await withCheckedContinuation { continuation in
            submit(writes: writes, body) { continuation.resume(returning: $0) }
        }
    }

    // MARK: the page's storage calls (web/src/host/replica.ts)

    /// Answers one call; structured answers are JSON text so keys keep their order. Put on the queue at once.
    func call(_ method: String, _ params: [JSONValue], reply: @escaping @Sendable (Result<JSONValue, EditorCommand.RPCFailure>) -> Void) {
        let text = params.map(\.stringValue)
        func arg(_ index: Int) -> String? { index < text.count ? text[index] : nil }
        let writes = !["listSnapshots", "allSnapshots", "getFile", "listFiles", "readMeta"].contains(method)
        submit(writes: writes, { [self] () -> Result<JSONValue, EditorCommand.RPCFailure> in
            func failure(_ message: String) -> Result<JSONValue, EditorCommand.RPCFailure> { .failure(.init(message: message)) }
            func done(_ message: String?) -> Result<JSONValue, EditorCommand.RPCFailure> { message.map(failure) ?? .success(.null) }
            guard let session else { return failure("No vault is open.") }
            switch method {
            case "open": return .success(.string(openedJSON(session)))
            case "markInitialized": return done(attempt { try session.markInitialized() })
            case "flush": return .success(.string(flushJSON(session)))
            case "lock":
                guard let id = arg(0) else { break }
                session.lockPage(id)
                return .success(.null)
            case "unlock":
                guard let id = arg(0), let password = arg(1) else { break }
                return .success(.string(unlockJSON(session, id, password)))
            case "protect":
                guard let id = arg(0), let password = arg(1) else { break }
                // a new key; the page then applies page.setEncrypted and saves, as Morrow's session does
                do { try session.writer.protectPage(id, password) } catch { return failure("The page could not be encrypted.") }
                return .success(.null)
            case "unprotect":
                guard let id = arg(0) else { break }
                session.writer.unprotectPage(id)
                return .success(.null)
            case "restoreSnapshot":
                guard let json = arg(0) else { break }
                return .success(.string(restoreJSON(session, json)))
            case "importSnapshots":
                guard let json = arg(0) else { break }
                return done(attempt { try session.importSnapshots(((try? JSJSON.parse(json))?.array ?? []).compactMap(Self.snapshot)) })
            case "listSnapshots":
                guard let id = arg(0) else { break }
                return .success(.string(JSJSON.stringify(.array(session.listSnapshots(id).map(Self.json)))))
            case "allSnapshots":
                return .success(.string(JSJSON.stringify(.array(session.allSnapshots().map(Self.json)))))
            case "putFiles":
                guard let json = arg(0) else { break }
                switch session.addFiles(Self.files(json)) {
                case .success(let metas): return .success(.string(JSJSON.stringify(.array(metas.map(\.json)))))
                case .failure(let error): return failure(error.message)
                }
            case "getFile":
                guard let id = arg(0) else { break }
                guard let file = session.getFile(id) else { return .success(.string("null")) }
                return .success(.string(JSJSON.stringify(["meta": file.meta.json, "data": .string(file.data.base64EncodedString())])))
            case "listFiles":
                return .success(.string(JSJSON.stringify(.array(session.listFiles().map(\.json)))))
            case "deleteFiles":
                guard let json = arg(0) else { break }
                let ids = ((try? JSJSON.parse(json))?.array ?? []).compactMap(\.string)
                return done(attempt { try session.deleteFiles(ids) })
            case "readMeta":
                guard let name = arg(0) else { break }
                return .success(session.readMeta(name).map(JSONValue.string) ?? .null)
            case "writeMeta":
                guard let name = arg(0), let text = arg(1) else { break }
                if let message = attempt({ try session.writeMeta(name, text) }) { return failure(message) }
                if name == "review.json" { reviewLog = Flashcards.readReviewLog(try? JSJSON.parse(text)) }
                return .success(.null)
            default:
                return failure("Unknown storage call \(method).")
            }
            return failure("A storage call had wrong arguments.")
        }, done: reply)
    }

    private func attempt(_ body: () throws -> Void) -> String? {
        do {
            try body()
            return nil
        } catch let error as VaultWriteError {
            return error.message
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: the vault

    /// Opens the session, reading the folder, before the page asks for it: put on the queue at once, so the page's
    /// `open` call always finds it. `failed` hears the reason when the folder cannot be read.
    func begin(failed: @escaping @MainActor @Sendable (String) -> Void) {
        submit(writes: true, { [self] () -> String? in
            if session != nil { return nil }
            do {
                let writer = VaultWriter(bridge: bridge, newId: { UUID().uuidString.lowercased() })
                let session = CoreSession.open(try bridge.scan(), writer: writer)
                self.session = session
                reviewLog = Flashcards.readReviewLog(session.readMeta("review.json").flatMap { try? JSJSON.parse($0) })
                return nil
            } catch {
                return "Could not open the folder: \(error.localizedDescription)"
            }
        }, done: { reason in
            if let reason { Task { @MainActor in failed(reason) } }
        })
    }

    /// The workspace for the page's `ReplicaRepository.load`. A page opened again after its process ended gets
    /// the session as it is, unsaved edits included, and never the welcome guide a second time.
    private func openedJSON(_ session: CoreSession) -> String {
        var docs = JSObject()
        for (id, doc) in session.state.docs { docs[id] = .object(doc) }
        let opened: JSValue = [
            "pages": .array(session.state.pages.valuesInOrder.map(\.json)),
            "docs": .object(docs),
            "problems": .array(session.problems.map(JSValue.string)),
            "unreadable": .array(session.unreadable.items.map(JSValue.string)),
            "firstRun": .bool(session.firstRun && !openedBefore),
            "info": info(session),
        ]
        openedBefore = true
        return JSJSON.stringify(opened)
    }

    /// what the page reads without asking: where each page lies and the saves per day
    private func info(_ session: CoreSession) -> JSValue {
        var paths = JSObject()
        for (id, placement) in session.writer.layout { paths[id] = .string(placement.file ?? placement.folder) }
        return ["paths": .object(paths), "activity": .object(session.activity())]
    }

    private func flushJSON(_ session: CoreSession) -> String {
        let saved = session.flush()
        return JSJSON.stringify(["ok": .bool(saved), "error": session.saveStatus.error.map(JSValue.string) ?? .null, "info": info(session)])
    }

    private func unlockJSON(_ session: CoreSession, _ id: String, _ password: String) -> String {
        switch session.unlockPage(id, password) {
        case .failure(let error): JSJSON.stringify(["ok": false, "error": .string(error.message)])
        case .success(let state): JSJSON.stringify(["ok": true, "page": state.pages[id]?.json ?? .null, "doc": state.docs[id].map(JSValue.object) ?? .null])
        }
    }

    /// `{ ok, now }`: the page applies the same `page.setDoc` at `now`
    private func restoreJSON(_ session: CoreSession, _ json: String) -> String {
        guard let value = try? JSJSON.parse(json), let snapshot = Self.snapshot(value) else {
            return JSJSON.stringify(["ok": false, "error": "That version could not be read."])
        }
        let at = JSEnvironment.now()
        switch session.restoreSnapshot(snapshot, at: at) {
        case .success: return JSJSON.stringify(["ok": true, "now": .number(at)])
        case .failure(let error): return JSJSON.stringify(["ok": false, "error": .string(error.message)])
        }
    }

    /// The page is showing the vault and answers outside edits from now on.
    func webIsReady() {
        queue.async { [self] in
            if webReady { return }
            webReady = true
            let paths = deferred
            deferred = []
            for set in paths { whenFree { self.readOutside(set) } }
            drain()
        }
    }

    /// The page went away (its process ended, or it is loading afresh): an outside edit it was asked about is taken
    /// by this session alone, and later ones wait until a page is ready again.
    func webGone() {
        queue.async { [self] in
            webReady = false
            settleAlone()
        }
    }

    /// an outside edit still waiting for the page is taken by this session alone, its own unsaved pages kept
    private func settleAlone() {
        if let waiting = awaiting, let session {
            awaiting = nil
            session.commitExternal(waiting.read, accepted: session.applyExternal(waiting.read.patch))
        }
        drain()
    }

    /// Saves now, when the page cannot be the one to ask: the app going to the background or quitting, a vault
    /// switch, the page's process ending. An outside edit waiting for the page is settled here first. True when
    /// nothing is left unsaved.
    @discardableResult
    func flushAlone() async -> Bool {
        queue.async { [self] in settleAlone() }
        return await run { [self] in session?.flush() ?? true }
    }

    /// Saves what is waiting and lets the session go, when the vault closes.
    func close() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async { [self] in
                settleAlone()
                session?.close()
                session = nil
                held = []
                deferred = []
                webReady = false
                openedBefore = false
                continuation.resume()
            }
        }
    }

    // MARK: commands from the page

    /// Commands the page applied, as JSON text `{ commands, all }`, applied here in the same order.
    func apply(commandsJSON json: String) {
        queue.async { [self] in
            guard let session else { return }
            guard let value = try? JSJSON.parse(json), let list = value["commands"]?.array else {
                logger.error("a command from the page could not be read")
                return
            }
            let commands = list.compactMap(CoreCommand.init(json:))
            guard commands.count == list.count else {
                logger.error("a command from the page is not one the session knows")
                resync(session, list)
                return
            }
            var refused: CommandFailure?
            if value["all"] == .bool(true) {
                if case .failure(let error) = session.executeAll(commands) { refused = error }
            } else {
                for command in commands { if case .failure(let error) = session.execute(command) { refused = error } }
            }
            if let refused {
                // the page applied it, so the two now differ: the page gets the session's version back
                logger.error("the session refused a command the page applied: \(refused.message, privacy: .public)")
                resync(session, list)
            }
        }
    }

    /// the session's version of the pages these commands name, for the page to take in
    private func resync(_ session: CoreSession, _ commands: [JSValue]) {
        var ids = JSSet()
        for command in commands {
            for key in ["id", "pageId", "newId"] { if let id = command[key]?.string { ids.insert(id) } }
            for page in command["pages"]?.array ?? [] { if let id = page["id"]?.string { ids.insert(id) } }
        }
        var patch = ExternalPatch()
        for id in ids {
            if let page = session.state.pages[id] {
                patch.pages.append(page)
                if let doc = session.state.docs[id] { patch.docs[id] = doc }
            } else {
                patch.removed.append(id)
            }
        }
        let json = JSJSON.stringify(patch.json)
        Task { @MainActor [sendResync] in sendResync(json) }
    }

    // MARK: outside edits

    /// Paths the file watcher or a sync saw change, read when nothing is in the way and a page is ready.
    func changed(_ paths: Set<String>) {
        queue.async { [self] in
            whenFree { self.readOutside(paths) }
        }
    }

    private func readOutside(_ paths: Set<String>) {
        guard let session else { return }
        if !webReady {
            // read once a page is there to answer; a vault opened afresh reads the folder anyway
            deferred.append(paths)
            return
        }
        guard let read = session.readChanges(bridge.describe(paths)) else { return }
        lastExternalId += 1
        awaiting = (lastExternalId, read)
        let id = lastExternalId
        let json = JSJSON.stringify(read.patch.json)
        Task { @MainActor [sendExternal] in sendExternal(id, json) }
    }

    /// The page's answer to an outside edit: the pages it took in.
    func externalAccepted(id: Int, accepted: [String]) {
        queue.async { [self] in
            guard let waiting = awaiting, waiting.id == id, let session else { return }
            awaiting = nil
            let applied = session.applyExternal(waiting.read.patch, only: JSSet(accepted))
            session.commitExternal(waiting.read, accepted: applied)
            if applied.count != accepted.count {
                logger.error("the page took \(accepted.count) outside changes and the session \(applied.count)")
            }
            let json = JSJSON.stringify(info(session))
            Task { @MainActor [sendInfo] in sendInfo(json) }
            drain()
        }
    }

    /// Flashcard progress the page graded, ahead of the file it writes after a short delay.
    func setReviewLog(json: String) {
        queue.async { [self] in
            reviewLog = Flashcards.readReviewLog(["cards": (try? JSJSON.parse(json)) ?? .null])
        }
    }

    // MARK: reading

    /// The workspace for the native screens' questions, with the activity count and flashcard progress.
    func context(now: Date = Date()) async -> CoreQueries.Context? {
        await run(writes: false) { [self] in
            session.map { CoreQueries.Context(state: $0.state, activity: $0.activity(), reviewLog: reviewLog, now: now) }
        }
    }

    /// The session's workspace and its locked pages, for the debug comparison with the page's copy.
    func workspace() async -> (state: WorkspaceState, unreadable: JSSet)? {
        await run(writes: false) { [self] in session.map { ($0.state, $0.unreadable) } }
    }

    func pathOf(_ id: String) async -> String? {
        await run(writes: false) { [self] in session?.pathOf(id) }
    }

    // MARK: native page screens

    /// What the app draws over the editor page for a page, by the rules of web/src/main.tsx's `Page`, which
    /// draws an empty page in the same cases. A locked page is `.web` here, the app asks for its password.
    func screen(of id: String, sourceMode: Bool) async -> PageScreen {
        await run(writes: false) { [self] in
            guard let session, let page = session.state.pages[id], !Tree.isEffectivelyTrashed(session.state.pages, id),
                  page.kind == .page
            else { return .web }
            // Morrow's PageView, in its order
            if session.unreadable.has(id) { return page.encrypted ? .web : .unreadable }
            if sourceMode { return .source }
            let doc = session.state.docs[id] ?? Model.emptyDoc()
            let unknown = Doc.findUnknownTypes(doc)
            return unknown.isEmpty ? .web : .unknown(types: unknown, plain: Doc.docToPlainText(doc))
        }
    }

    /// The text Morrow's SourceEditor opens with: the page's Markdown, links under their pages' titles and files
    /// under their vault paths.
    func markdown(of id: String) async -> String? {
        await run(writes: false) { [self] in
            guard let session, session.state.pages[id] != nil else { return nil }
            let doc = session.state.docs[id] ?? Model.emptyDoc()
            let pages = session.state.pages
            return MarkdownSerialize.docToMarkdown(doc, .init(titleOf: { pages[$0].map { Model.displayTitle($0) } }, filePath: { $0 }))
        }
    }

    /// SourceEditor's reading back of the text: links to pages by Morrow's link rules, files by vault path or
    /// by name. Nil when the text gives no document Morrow takes, or names a file in a broken escape, where
    /// Morrow's `decodeURIComponent` throws and nothing is saved.
    func readMarkdown(_ text: String) async -> DocNode? {
        await run(writes: false) { [self] in
            guard let session else { return nil }
            let state = session.state
            var byId: [String: FileMeta] = [:]
            var byName: [String: FileMeta] = [:]
            for file in session.listFiles() {
                byId[file.id] = file
                byName[file.name.lowercased()] = file
            }
            var broken = false
            let options = MarkdownParse.Options(
                resolvePage: { Search.resolveLinkTarget(state, $0) },
                resolveFile: { href in
                    var path = Substring(href)
                    if path.hasPrefix("./") { path = path.dropFirst(2) } else if path.hasPrefix("/") { path = path.dropFirst() }
                    guard let clean = JSURI.decodeURIComponent(String(path)) else {
                        broken = true
                        return nil
                    }
                    let last = clean.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? clean
                    guard let file = byId[clean] ?? byName[last.lowercased()] else { return nil }
                    return MarkdownParse.FileRef(fileId: file.id, name: file.name, image: file.type.hasPrefix("image/"))
                })
            let doc = MarkdownParse.markdownToDoc(text, options)
            return broken || Doc.validateDoc(.object(doc)) != nil ? nil : doc
        }
    }

    /// Files a native screen adds, such as a cover picture, stored before a page refers to them.
    func addFiles(_ files: [(meta: FileMeta, data: Data)]) async -> Result<[FileMeta], CommandFailure> {
        await run { [self] in
            session?.addFiles(files) ?? .failure(CommandFailure(message: "The vault is not open."))
        }
    }

    // MARK: shapes

    private static func snapshot(_ value: JSValue) -> Snapshot? {
        guard case .string(let id) = value["id"], case .string(let pageId) = value["pageId"], case .object(let doc) = value["doc"],
              case .number(let createdAt) = value["createdAt"] else { return nil }
        return Snapshot(id: id, pageId: pageId, title: value["title"]?.string ?? "", doc: doc, createdAt: createdAt)
    }

    private static func json(_ snapshot: Snapshot) -> JSValue {
        ["id": .string(snapshot.id), "pageId": .string(snapshot.pageId), "title": .string(snapshot.title),
         "doc": .object(snapshot.doc), "createdAt": .number(snapshot.createdAt)]
    }

    /// files as JSON text `[{ meta, data }]`, data in base64
    private static func files(_ json: String) -> [(meta: FileMeta, data: Data)] {
        ((try? JSJSON.parse(json))?.array ?? []).compactMap { item in
            guard let meta = item["meta"], let data = item["data"]?.string.flatMap({ Data(base64Encoded: $0) }) else { return nil }
            return (FileMeta(id: meta["id"]?.string ?? "", name: meta["name"]?.string ?? "", type: meta["type"]?.string ?? "",
                             size: meta["size"]?.number ?? Double(data.count), createdAt: meta["createdAt"]?.number ?? 0), data)
        }
    }
}
