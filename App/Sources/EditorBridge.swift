import Foundation
import WebKit

/// A message the editor page posts to `window.webkit.messageHandlers.editor`, see `web/src/bridge.ts`.
nonisolated enum EditorEvent: Equatable, Sendable {
    case ready
    /// A call into Morrow's `VaultBridge`, answered with `EditorCommand.rpcResult`.
    case rpc(id: Int, method: String, params: [JSONValue])
    /// The page records, the encrypted pages still locked, the page shown as Markdown source, and the save state.
    case workspace(pages: [String: JSONValue], locked: [String], sourceMode: String?, saveState: String, saveError: String?)
    /// A page to open, nil for Home. `newTab` when it was opened with a command or control click; `find` is
    /// text to select in it.
    case openPage(pageId: String?, newTab: Bool, find: String?)
    /// The page header asked to pick an icon for this page.
    case chooseIcon(pageId: String)
    case vaultFailed(message: String)
    case openExternal(URL)
    case log(level: String, message: String)
    /// A key the page did not use that belongs to the app.
    case shortcut(String)
    /// One of the app's own views, such as the pages with a tag.
    case openView(Destination)
    /// A file Morrow saves, such as an export; the app asks where to keep it.
    case saveFile(name: String, mime: String, data: Data)
    /// Every toast showing now, newest last.
    case toasts([EditorToast])
    /// Morrow's automatic backup, a JSON document.
    case autoBackup(json: String)
    /// The vault's custom CSS, when the vault opens and when it is saved.
    case customCss(String)
    /// What changed in the page's workspace session, a state delta as JSON text (web/src/stateDelta.ts); sent
    /// only when the app compares the page's copy with its own session (debug builds).
    case state(json: String)
    /// Commands the page applied, JSON text `{ commands, all }`, for the Swift session to apply the same way.
    case commands(json: String)
    /// The page's answer to an outside edit: the pages it took in.
    case externalAccepted(id: Int, accepted: [String])
    /// Flashcard progress after a grade (Morrow's ReviewLog as JSON text), ahead of the file the page writes later.
    case reviewLog(json: String)

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
        let newTab: Bool?
        let find: String?
        let shortcut: String?
        let locked: [String]?
        let view: String?
        let tag: String?
        let sourceMode: String?
        let name: String?
        let mime: String?
        let data: String?
        let toasts: [EditorToast]?
        let json: String?
        let css: String?
        let accepted: [String]?
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
            self = .workspace(pages: pages, locked: raw.locked ?? [], sourceMode: raw.sourceMode, saveState: state, saveError: raw.saveError)
        case "openPage":
            self = .openPage(pageId: raw.pageId, newTab: raw.newTab ?? false, find: raw.find)
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
        case "shortcut":
            guard let name = raw.shortcut else { return nil }
            self = .shortcut(name)
        case "openView":
            switch raw.view {
            case "tasks": self = .openView(.tasks)
            case "tags": self = .openView(.tags)
            case "tag":
                guard let tag = raw.tag, !tag.isEmpty else { return nil }
                self = .openView(.tag(tag))
            default: return nil
            }
        case "saveFile":
            guard let name = raw.name, let mime = raw.mime, let text = raw.data, let data = Data(base64Encoded: text) else { return nil }
            self = .saveFile(name: name, mime: mime, data: data)
        case "toasts":
            guard let toasts = raw.toasts else { return nil }
            self = .toasts(toasts)
        case "state":
            guard let json = raw.json else { return nil }
            self = .state(json: json)
        case "commands":
            guard let json = raw.json else { return nil }
            self = .commands(json: json)
        case "reviewLog":
            guard let json = raw.json else { return nil }
            self = .reviewLog(json: json)
        case "externalAccepted":
            guard let id = raw.id, let accepted = raw.accepted else { return nil }
            self = .externalAccepted(id: id, accepted: accepted)
        case "autoBackup":
            guard let json = raw.json else { return nil }
            self = .autoBackup(json: json)
        case "customCss":
            guard let css = raw.css else { return nil }
            self = .customCss(css)
        default:
            return nil
        }
    }
}

/// A Morrow toast as the app shows it; `action` is the label of its button.
nonisolated struct EditorToast: Decodable, Equatable, Hashable, Sendable, Identifiable {
    let id: Int
    let message: String
    let tone: String
    let action: String?

    var isError: Bool { tone == "error" }
}

/// The kinds of page the app makes, as Morrow's `createPage` takes them.
nonisolated enum NewPageKind: String, Sendable {
    case page, database, canvas
}

/// A message the app sends to the editor page through `window.synapse.receive`.
nonisolated enum EditorCommand: Sendable {
    /// `guide` puts Morrow's welcome guide into a vault opened for the first time; `compare` has the page send its
    /// state deltas, for the debug comparison with the Swift session.
    case openVault(name: String, guide: Bool, compare: Bool)
    /// Shows a page, or nothing; `find` is text to select once it is open.
    case show(pageId: String?, find: String?)
    case rpcResult(id: Int, result: Result<JSONValue, RPCFailure>)
    /// An outside edit the Swift session read, JSON text of Morrow's ExternalPatch; the page answers with the
    /// pages it took in.
    case external(id: Int, json: String)
    /// Where each page lies and the saves per day, JSON text `{ paths, activity }`.
    case vaultInfo(json: String)
    /// The Swift session's version of pages the page got out of step with, JSON text of an ExternalPatch.
    case resync(json: String)
    case createPage(parentId: String?, kind: NewPageKind = .page)
    case trashPage(pageId: String)
    /// A Morrow `Command`, see `WorkspaceCommand`.
    case command(JSONValue)
    case theme(dark: Bool)
    /// The appearance chosen in the settings, `AppPreferences.json`.
    case preferences(JSONValue)
    /// Custom CSS shown as it is typed in the settings, and saved to the vault.
    case previewCss(String)
    case saveCss(String)
    /// A quick note, added to the end of today's note.
    case capture(String)
    case scrollToHeading(index: Int)
    /// Opens the find bar of the page on screen.
    case find
    /// Today's daily note, or the one for a yyyy-mm-dd day, made when missing.
    case openToday(date: String?)
    case createFromTemplate(templateId: String, parentId: String?)
    /// A page in the Templates page, or the Templates page when there is none.
    case newTemplate
    case openTemplates
    case saveAsTemplate(pageId: String)
    case openHistory(pageId: String)
    /// Saves an unlocked encrypted page and forgets its key until the password is given again.
    case lockPage(pageId: String)
    /// Writes an encrypted page back as plain text.
    case unprotectPage(pageId: String)
    case gradeCard(cardId: String, grade: String)
    case exportMarkdown(pageId: String)
    /// The whole vault as a website when `pageId` is nil, otherwise the page and the pages inside it.
    case publish(pageId: String?)
    case exportAll
    case backup
    case restore
    /// Imported pages go inside `parentId`, at the top level when it is nil.
    case importMarkdown(parentId: String?)
    case deleteUnusedFiles
    /// The page shown as its Markdown source, nil for the editor.
    case setSourceMode(pageId: String?)
    case toastAction(id: Int)
    case dismissToast(id: Int)

    struct RPCFailure: Error, Equatable, Sendable {
        let message: String
    }

    var json: JSONValue {
        switch self {
        case .openVault(let name, let guide, let compare):
            .object(["type": .string("openVault"), "name": .string(name), "guide": .bool(guide), "compare": .bool(compare)])
        case .show(let pageId, let find):
            .object(["type": .string("show"), "pageId": pageId.map(JSONValue.string) ?? .null, "find": find.map(JSONValue.string) ?? .null])
        case .rpcResult(let id, .success(let value)):
            .object(["type": .string("rpcResult"), "id": .number(Double(id)), "ok": .bool(true), "value": value])
        case .rpcResult(let id, .failure(let failure)):
            .object(["type": .string("rpcResult"), "id": .number(Double(id)), "ok": .bool(false), "error": .string(failure.message)])
        case .external(let id, let json):
            .object(["type": .string("external"), "id": .number(Double(id)), "json": .string(json)])
        case .vaultInfo(let json):
            .object(["type": .string("vaultInfo"), "json": .string(json)])
        case .resync(let json):
            .object(["type": .string("resync"), "json": .string(json)])
        case .createPage(let parentId, let kind):
            .object(["type": .string("createPage"), "parentId": parentId.map(JSONValue.string) ?? .null, "kind": .string(kind.rawValue)])
        case .trashPage(let pageId):
            .object(["type": .string("trashPage"), "pageId": .string(pageId)])
        case .command(let command):
            .object(["type": .string("command"), "command": command])
        case .theme(let dark):
            .object(["type": .string("theme"), "theme": .string(dark ? "dark" : "light")])
        case .preferences(let preferences):
            .object(["type": .string("preferences"), "preferences": preferences])
        case .previewCss(let css):
            .object(["type": .string("previewCss"), "css": .string(css)])
        case .saveCss(let css):
            .object(["type": .string("saveCss"), "css": .string(css)])
        case .capture(let text):
            .object(["type": .string("capture"), "text": .string(text)])
        case .scrollToHeading(let index):
            .object(["type": .string("scrollToHeading"), "index": .number(Double(index))])
        case .find:
            .object(["type": .string("find")])
        case .openToday(let date):
            .object(["type": .string("openToday"), "date": date.map(JSONValue.string) ?? .null])
        case .createFromTemplate(let templateId, let parentId):
            .object(["type": .string("createFromTemplate"), "templateId": .string(templateId), "parentId": parentId.map(JSONValue.string) ?? .null])
        case .newTemplate:
            .object(["type": .string("newTemplate")])
        case .openTemplates:
            .object(["type": .string("openTemplates")])
        case .saveAsTemplate(let pageId):
            .object(["type": .string("saveAsTemplate"), "pageId": .string(pageId)])
        case .openHistory(let pageId):
            .object(["type": .string("openHistory"), "pageId": .string(pageId)])
        case .lockPage(let pageId):
            .object(["type": .string("lockPage"), "pageId": .string(pageId)])
        case .unprotectPage(let pageId):
            .object(["type": .string("unprotectPage"), "pageId": .string(pageId)])
        case .gradeCard(let cardId, let grade):
            .object(["type": .string("gradeCard"), "cardId": .string(cardId), "grade": .string(grade)])
        case .exportMarkdown(let pageId):
            .object(["type": .string("exportMarkdown"), "pageId": .string(pageId)])
        case .publish(let pageId):
            .object(["type": .string("publish"), "pageId": pageId.map(JSONValue.string) ?? .null])
        case .exportAll:
            .object(["type": .string("exportAll")])
        case .backup:
            .object(["type": .string("backup")])
        case .restore:
            .object(["type": .string("restore")])
        case .importMarkdown(let parentId):
            .object(["type": .string("importMarkdown"), "parentId": parentId.map(JSONValue.string) ?? .null])
        case .deleteUnusedFiles:
            .object(["type": .string("deleteUnusedFiles")])
        case .setSourceMode(let pageId):
            .object(["type": .string("setSourceMode"), "pageId": pageId.map(JSONValue.string) ?? .null])
        case .toastAction(let id):
            .object(["type": .string("toastAction"), "id": .number(Double(id))])
        case .dismissToast(let id):
            .object(["type": .string("dismissToast"), "id": .number(Double(id))])
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
