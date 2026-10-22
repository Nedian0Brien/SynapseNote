import Foundation

/// Morrow's core/history.ts: a page gets a new version at most every ten minutes while it is edited, and keeps
/// at most fifty.
nonisolated enum History {
    static let snapshotInterval = 10.0 * 60 * 1000
    static let maxSnapshotsPerPage = 50

    static func snapshotDue(_ lastAt: Double?, _ now: Double) -> Bool {
        guard let lastAt else { return true }
        return now - lastAt >= snapshotInterval
    }

    /// ids of the oldest versions beyond the per page limit
    static func snapshotsToPrune(_ snapshots: [Snapshot]) -> [String] {
        snapshots.jsSorted { a, b in a.createdAt == b.createdAt ? 0 : b.createdAt < a.createdAt ? -1 : 1 }
            .dropFirst(maxSnapshotsPerPage).map(\.id)
    }
}

/// Page history in the vault: one JSON file per page in .morrow/history (vaultRepository.ts).
nonisolated extension VaultWriter {
    func historyPath(_ pageId: String) -> String { "\(Self.historyDir)/\(pageId).json" }

    /// the versions of a page as its history file holds them, read once and then kept
    func historyOf(_ pageId: String) -> [Snapshot] {
        if let cached = history[pageId] { return cached }
        var list: [Snapshot] = []
        if let text = bridge.readText(historyPath(pageId)), !text.isEmpty, let raw = try? JSJSON.parse(text),
           case .array(let items) = raw.object?["snapshots"] {
            for item in items {
                guard case .object(let snapshot) = item, case .string(let id) = snapshot["id"],
                      case .number(let createdAt) = snapshot["createdAt"], let doc = snapshot["doc"],
                      Doc.validateDoc(doc) == nil, case .object(let node) = doc
                else { continue }
                let title = snapshot["title"].flatMap { $0.isNull ? nil : $0.jsString } ?? ""
                list.append(Snapshot(id: id, pageId: pageId, title: title, doc: node, createdAt: createdAt))
            }
        }
        history[pageId] = list
        return list
    }

    /// the history file with this version added and the oldest beyond the limit dropped
    func historyOp(_ snapshot: Snapshot) -> VaultOp {
        let list = historyOf(snapshot.pageId) + [snapshot]
        let prune = JSSet(History.snapshotsToPrune(list))
        let kept = list.filter { !prune.has($0.id) }.jsSorted { a, b in a.createdAt == b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1 }
        history[snapshot.pageId] = kept
        let file: JSValue = [
            "version": 1,
            "snapshots": .array(kept.map { ["id": .string($0.id), "title": .string($0.title), "doc": .object($0.doc), "createdAt": .number($0.createdAt)] }),
        ]
        return .write(path: historyPath(snapshot.pageId), text: JSJSON.stringify(file), expect: nil, id: nil)
    }

    /// what another app wrote over a page with unsaved changes here, kept as a version before it is replaced
    func keepDiskVersion(_ pageId: String, _ text: String) {
        // a version of an encrypted page is never kept as plain text
        if PageCrypto.isEncryptedText(text) || lastState?.pages[pageId]?.encrypted == true { return }
        let page = lastState?.pages[pageId]
        let doc: DocNode?
        if page?.kind == .canvas {
            doc = (try? JSJSON.parse(text)).flatMap { CanvasFile.readCanvas($0) { _ in nil } }.map(CanvasFile.canvasDoc)
        } else {
            doc = MarkdownParse.markdownToDoc(PageFile.readPageText(text).body)
        }
        guard let doc else { return }
        let snapshot = Snapshot(id: newId(), pageId: pageId, title: page?.title ?? "", doc: doc, createdAt: now())
        _ = bridge.apply([historyOp(snapshot)])
    }

    /// newest first
    func listSnapshots(_ pageId: String) -> [Snapshot] {
        historyOf(pageId).jsSorted { a, b in a.createdAt == b.createdAt ? 0 : b.createdAt < a.createdAt ? -1 : 1 }
    }

    func allSnapshots() -> [Snapshot] {
        bridge.listFiles(Self.historyDir).flatMap { historyOf(Paths.basename(Paths.stripExtension($0.path))) }
    }
}
