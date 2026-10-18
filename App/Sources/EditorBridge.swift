import Foundation
import WebKit

/// A message the editor page posts to `window.webkit.messageHandlers.editor`, see `web/src/bridge.ts`.
nonisolated enum EditorEvent: Equatable, Sendable {
    case ready
    case docChanged(pageId: String, doc: JSONValue)
    case openPage(pageId: String)
    case pageCreated(page: JSONValue, doc: JSONValue)
    case openExternal(URL)
    case log(level: String, message: String)

    private struct Raw: Decodable {
        let type: String
        let pageId: String?
        let doc: JSONValue?
        let page: JSONValue?
        let url: String?
        let level: String?
        let message: String?
    }

    /// Reads a posted message body. Anything that is not exactly one of the known messages gives nil.
    init?(body: Any) {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let raw = try? JSONDecoder().decode(Raw.self, from: data)
        else { return nil }
        switch raw.type {
        case "ready":
            self = .ready
        case "docChanged":
            guard let pageId = raw.pageId, let doc = raw.doc, doc["type"] == .string("doc") else { return nil }
            self = .docChanged(pageId: pageId, doc: doc)
        case "openPage":
            guard let pageId = raw.pageId else { return nil }
            self = .openPage(pageId: pageId)
        case "pageCreated":
            guard let page = raw.page, page["id"]?.stringValue != nil,
                  let doc = raw.doc, doc["type"] == .string("doc")
            else { return nil }
            self = .pageCreated(page: page, doc: doc)
        case "openExternal":
            // the same rule as morrow's openExternal: web pages and mail only
            guard let text = raw.url, let url = URL(string: text),
                  let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme)
            else { return nil }
            self = .openExternal(url)
        case "log":
            guard let message = raw.message else { return nil }
            self = .log(level: raw.level ?? "error", message: message)
        default:
            return nil
        }
    }
}

/// A message the app sends to the editor page through `window.synapse.receive`.
nonisolated enum EditorCommand: Sendable {
    case load(pageId: String, workspace: Workspace, editable: Bool)
    case theme(dark: Bool)
    case flush

    var json: JSONValue {
        switch self {
        case .load(let pageId, let workspace, let editable):
            .object([
                "type": .string("load"),
                "pageId": .string(pageId),
                "state": .object(["pages": .object(workspace.pages), "docs": .object(workspace.docs)]),
                "editable": .bool(editable),
            ])
        case .theme(let dark):
            .object(["type": .string("theme"), "theme": .string(dark ? "dark" : "light")])
        case .flush:
            .object(["type": .string("flush")])
        }
    }
}

/// Receives the editor page's messages. Only the app's own page, in its main frame, is listened to.
final class EditorMessageHandler: NSObject, WKScriptMessageHandler {
    static let name = "editor"
    private let onEvent: (EditorEvent) -> Void

    init(onEvent: @escaping (EditorEvent) -> Void) {
        self.onEvent = onEvent
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == EditorSchemeHandler.scheme,
              let event = EditorEvent(body: message.body)
        else { return }
        onEvent(event)
    }
}
