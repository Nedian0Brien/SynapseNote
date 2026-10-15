import AppKit
import EditingCore
import Foundation
import Observation
import ServerAPI
import SyncCore

/// App-wide state: the server, the content tree and the open document.
@MainActor
@Observable
final class AppModel {
    enum Connection: Equatable {
        case notConfigured
        case checking
        case connected
        case failed(String)
    }

    private static let addressKey = "serverAddress"

    var serverAddress = UserDefaults.standard.string(forKey: AppModel.addressKey) ?? ""
    private(set) var connection: Connection = .notConfigured
    private(set) var client: ServerClient?

    /// Children of each loaded folder ("" is the content root).
    private(set) var children: [String: [DocumentEntry]] = [:]
    var expanded: Set<String> = []
    var selectedDocument: String?
    var lastError: String?

    let runtime: EditingRuntime?
    let runtimeError: String?
    private var system: SystemChannel?

    init() {
        do {
            runtime = try EditingRuntime()
            runtimeError = nil
        } catch {
            runtime = nil
            runtimeError = String(describing: error)
        }
    }

    func start() async {
        guard !serverAddress.isEmpty, client == nil else { return }
        await connect(to: serverAddress)
    }

    func connect(to address: String) async {
        connection = .checking
        do {
            let client = try ServerClient(address: address)
            _ = try await client.config()
            self.client = client
            serverAddress = address
            UserDefaults.standard.set(address, forKey: Self.addressKey)
            connection = .connected
            children = [:]
            await refreshTree()
            startSystemChannel(client)
        } catch {
            connection = .failed(String(describing: error))
        }
    }

    // MARK: Tree

    func setExpanded(_ dir: String, _ isExpanded: Bool) {
        if isExpanded {
            expanded.insert(dir)
            Task { await load(dir: dir) }
        } else {
            expanded.remove(dir)
        }
    }

    func refreshTree() async {
        await load(dir: "")
        for dir in expanded.sorted() { await load(dir: dir) }
    }

    func load(dir: String) async {
        guard let client else { return }
        do {
            let entries = try await client.documents(in: dir)
            children[dir] = entries
                .filter { $0.kind == .folder || $0.kind == .document }
                .sorted { a, b in
                    if (a.kind == .folder) != (b.kind == .folder) { return a.kind == .folder }
                    return a.name.localizedStandardCompare(b.name) == .orderedAscending
                }
        } catch {
            lastError = String(describing: error)
        }
    }

    /// The folder new items go into: the open document's folder, or the root.
    var targetFolder: String {
        guard let doc = selectedDocument, let slash = doc.lastIndex(of: "/") else { return "" }
        return String(doc[..<slash])
    }

    func createDocument(named name: String) async {
        guard let client, let file = Self.cleanName(name) else { return }
        let dir = targetFolder
        do {
            let docName = try await client.createPage(path: dir.isEmpty ? "\(file).md" : "\(dir)/\(file).md")
            await load(dir: dir)
            selectedDocument = docName
        } catch {
            lastError = String(describing: error)
        }
    }

    func createFolder(named name: String) async {
        guard let client, let folder = Self.cleanName(name) else { return }
        let dir = targetFolder
        do {
            try await client.createFolder(path: dir.isEmpty ? folder : "\(dir)/\(folder)")
            await load(dir: dir)
        } catch {
            lastError = String(describing: error)
        }
    }

    private static func cleanName(_ name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "/", with: "-")
        return trimmed.isEmpty ? nil : trimmed
    }

    // MARK: System channel

    private func startSystemChannel(_ client: ServerClient) {
        system?.disconnect()
        let channel = SystemChannel(collabURL: client.collabURL)
        channel.onNotice = { [weak self] notice in
            guard notice.channel == "files" else { return }
            Task { await self?.refreshTree() }
        }
        channel.onReconnect = { [weak self] in
            guard let self else { return }
            Task { await self.refreshTree() }
            self.publishCurrentView()
        }
        channel.onLog = { NSLog("SynapseNote %@", $0) }
        channel.connect()
        system = channel
    }

    /// What `GET /api/current-document` reports for this window.
    func publishCurrentView() {
        system?.publishCurrentView(document: selectedDocument, focused: NSApp.isActive, visible: true)
    }
}
