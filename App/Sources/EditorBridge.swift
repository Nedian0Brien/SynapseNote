import Foundation
import WebKit

/// A message the editor page posts to `window.webkit.messageHandlers.editor`, see `web/src/bridge.ts`.
nonisolated enum EditorEvent: Equatable, Sendable {
    case ready
    /// A call into Morrow's `VaultBridge`, answered with `EditorCommand.rpcResult`.
    case rpc(id: Int, method: String, params: [JSONValue])
    case workspace(pages: [String: JSONValue], saveState: String, saveError: String?)
    case openPage(pageId: String?)
    /// The page header asked to pick an icon for this page.
    case chooseIcon(pageId: String)
    case vaultFailed(message: String)
    case openExternal(URL)
    case log(level: String, message: String)

    private struct Raw: Decodable {
        let type: String
        let id: Int?
        let method: String?
        let params: [JSONValue]?
        let pages: [String: JSONValue]?
        let saveState: String?
        let saveError: String?
        let pageId: String?
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
        case "rpc":
            guard let id = raw.id, let method = raw.method else { return nil }
            self = .rpc(id: id, method: method, params: raw.params ?? [])
        case "workspace":
            guard let pages = raw.pages, let state = raw.saveState else { return nil }
            self = .workspace(pages: pages, saveState: state, saveError: raw.saveError)
        case "openPage":
            self = .openPage(pageId: raw.pageId)
        case "chooseIcon":
            guard let pageId = raw.pageId else { return nil }
            self = .chooseIcon(pageId: pageId)
        case "vaultFailed":
            self = .vaultFailed(message: raw.message ?? "The folder could not be opened.")
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
    case openVault(name: String)
    case show(pageId: String?)
    case rpcResult(id: Int, result: Result<JSONValue, RPCFailure>)
    case vaultChanges([VaultFileSystem.Change])
    case createPage(parentId: String?)
    case trashPage(pageId: String)
    /// A Morrow `Command`, see `WorkspaceCommand`.
    case command(JSONValue)
    case theme(dark: Bool)

    struct RPCFailure: Error, Equatable, Sendable {
        let message: String
    }

    var json: JSONValue {
        switch self {
        case .openVault(let name):
            .object(["type": .string("openVault"), "name": .string(name)])
        case .show(let pageId):
            .object(["type": .string("show"), "pageId": pageId.map(JSONValue.string) ?? .null])
        case .rpcResult(let id, .success(let value)):
            .object(["type": .string("rpcResult"), "id": .number(Double(id)), "ok": .bool(true), "value": value])
        case .rpcResult(let id, .failure(let failure)):
            .object(["type": .string("rpcResult"), "id": .number(Double(id)), "ok": .bool(false), "error": .string(failure.message)])
        case .vaultChanges(let changes):
            .object(["type": .string("vaultChanges"), "changes": (try? JSONValue(encoding: changes)) ?? .array([])])
        case .createPage(let parentId):
            .object(["type": .string("createPage"), "parentId": parentId.map(JSONValue.string) ?? .null])
        case .trashPage(let pageId):
            .object(["type": .string("trashPage"), "pageId": .string(pageId)])
        case .command(let command):
            .object(["type": .string("command"), "command": command])
        case .theme(let dark):
            .object(["type": .string("theme"), "theme": .string(dark ? "dark" : "light")])
        }
    }
}

extension JSONValue {
    /// Any encodable value as JSON, for sending structured results to the editor page.
    nonisolated init(encoding value: some Encodable) throws {
        self = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
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
