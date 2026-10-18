import Foundation
import Observation
import os
import WebKit

/// Owns the editor web page and the pages it edits. Edits live in memory only; nothing is saved to disk yet.
@Observable
final class EditorController {
    private(set) var workspace: Workspace
    var selection: String?
    private(set) var isReady = false
    private(set) var loadError: String?

    @ObservationIgnored let page: WebPage
    @ObservationIgnored var openURL: (URL) -> Void = { _ in }
    @ObservationIgnored private var darkMode = false
    @ObservationIgnored private let logger = Logger(subsystem: "com.synapsenote.native", category: "editor")

    init(workspace: Workspace, bundleRoot: URL) {
        self.workspace = workspace
        var configuration = WebPage.Configuration()
        // nothing the editor shows is kept between launches
        configuration.websiteDataStore = .nonPersistent()
        configuration.urlSchemeHandlers[URLScheme(EditorSchemeHandler.scheme)!] = EditorSchemeHandler(root: bundleRoot)
        let handler = EditorMessageHandlerBox()
        configuration.userContentController.add(EditorMessageHandler { event in handler.receive?(event) }, name: EditorMessageHandler.name)
        page = WebPage(configuration: configuration, navigationDecider: EditorNavigationDecider())
        #if DEBUG
        page.isInspectable = true
        #endif
        handler.receive = { [weak self] event in self?.handle(event) }
        selection = workspace.rows.first?.id
    }

    /// The bundled sample pages, or an empty workspace with the reason when they cannot be read.
    static func bundled() -> EditorController {
        let root = Bundle.main.resourceURL!.appending(path: "Editor")
        do {
            return EditorController(workspace: try Workspace.load(from: root.appending(path: "sample-guide.json")), bundleRoot: root)
        } catch {
            let controller = EditorController(workspace: Workspace(pages: [:], docs: [:]), bundleRoot: root)
            controller.loadError = "The sample pages could not be read: \(error.localizedDescription)"
            return controller
        }
    }

    func start() {
        guard page.url == nil else { return }
        page.load(URLRequest(url: EditorSchemeHandler.entry))
    }

    func setDarkMode(_ dark: Bool) {
        darkMode = dark
        send(.theme(dark: dark))
    }

    /// Opens the selected page. The editor hands back pending edits of the page it had open first.
    func showSelection() {
        guard isReady, let id = selection, workspace.pages[id] != nil, workspace.docs[id] != nil else { return }
        logger.info("opening page \(id, privacy: .public)")
        send(.load(pageId: id, workspace: workspace, editable: true))
    }

    /// Asks the editor for edits it has not handed back yet, such as when the app leaves the screen.
    func flush() {
        send(.flush)
    }

    func handle(_ event: EditorEvent) {
        switch event {
        case .ready:
            logger.info("editor page is ready")
            isReady = true
            send(.theme(dark: darkMode))
            showSelection()
        case .docChanged(let pageId, let doc):
            guard workspace.pages[pageId] != nil else { return }
            workspace.docs[pageId] = doc
        case .openPage(let pageId):
            guard workspace.pages[pageId] != nil else { return }
            selection = pageId
        case .pageCreated(let page, let doc):
            guard let id = page["id"]?.stringValue, workspace.pages[id] == nil else { return }
            workspace.pages[id] = page
            workspace.docs[id] = doc
        case .openExternal(let url):
            openURL(url)
        case .log(let level, let message):
            if level == "error" { logger.error("editor: \(message, privacy: .public)") }
            else { logger.warning("editor: \(message, privacy: .public)") }
        }
    }

    private func send(_ command: EditorCommand) {
        guard isReady,
              let data = try? JSONEncoder().encode(command.json),
              let json = String(data: data, encoding: .utf8)
        else { return }
        Task { [page, logger] in
            do {
                _ = try await page.callJavaScript("window.synapse.receive(JSON.parse(json))", arguments: ["json": json])
            } catch {
                logger.error("sending to the editor failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

/// Holds the event closure until the controller exists, the message handler is created first.
private final class EditorMessageHandlerBox {
    var receive: ((EditorEvent) -> Void)?
}

/// The editor page stays on its own bundle. Links are opened by the app through the bridge.
private struct EditorNavigationDecider: WebPage.NavigationDeciding {
    func decidePolicy(for action: WebPage.NavigationAction, preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
        action.request.url?.scheme == EditorSchemeHandler.scheme ? .allow : .cancel
    }
}
