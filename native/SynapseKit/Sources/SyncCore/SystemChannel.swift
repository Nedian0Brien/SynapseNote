import Foundation

/// The server's `__system__` document: CC1 change notifications in, and this
/// window's `currentView` awareness out (what `GET /api/current-document`
/// and the `current_document` MCP tool read).
@MainActor
public final class SystemChannel {
    public static let documentName = "__system__"

    /// A CC1 message (`packages/core/src/schemas/cc1.ts`): `ch` names the
    /// channel (`files`, `backlinks`, `server-info`, …).
    public struct Notice: Sendable {
        public let channel: String
    }

    public var onNotice: ((Notice) -> Void)?
    /// Called after every (re)connect, when missed notices may have been dropped.
    public var onReconnect: (() -> Void)?
    public var onLog: ((String) -> Void)?

    private let connection: HocuspocusConnection
    /// The system doc's content is server-owned; the client only answers sync.
    private let doc = SourceDoc()
    private let clientID = UInt32.random(in: 1...UInt32(Int32.max))
    private var clock: UInt64 = 0
    private var currentView: [String: Any]?
    private var renew: Timer?

    public init(collabURL: URL) {
        connection = HocuspocusConnection(url: collabURL, documentName: Self.documentName)
        connection.onAuthenticated = { [weak self] in
            guard let self else { return }
            self.connection.sendYMessage(self.doc.syncStep1())
            self.sendAwareness()
            self.onReconnect?()
        }
        connection.onFrame = { [weak self] frame in self?.handle(frame) }
        connection.onLog = { [weak self] message in self?.onLog?("[system] \(message)") }
    }

    public func connect() {
        connection.connect()
        // y-protocols drops a client's awareness after 30s without an update.
        renew?.invalidate()
        renew = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.sendAwareness() }
        }
    }

    public func disconnect() {
        renew?.invalidate()
        connection.disconnect()
    }

    /// Publish which document this window shows (`currentViewSnapshot` in the web app).
    public func publishCurrentView(document: String?, focused: Bool, visible: Bool) {
        currentView = [
            "document": document as Any? ?? NSNull(),
            "focused": focused,
            "visible": visible,
            "updatedAt": Int(Date().timeIntervalSince1970 * 1000),
        ]
        sendAwareness()
    }

    private func sendAwareness() {
        guard connection.status == .connected else { return }
        var state: [String: Any] = [:]
        if let currentView { state["currentView"] = currentView }
        guard let data = try? JSONSerialization.data(withJSONObject: state),
              let json = String(data: data, encoding: .utf8) else { return }
        clock += 1
        connection.sendYMessage(HocuspocusFrame.awareness(clientID: clientID, clock: clock, stateJSON: json))
    }

    private func handle(_ frame: HocuspocusFrame.Incoming) {
        switch HocuspocusFrame.MessageType(rawValue: frame.type) {
        case .sync:
            if let result = try? doc.receive(message: frame.yMessage) {
                for reply in result.replies { connection.sendYMessage(reply) }
            }
        case .stateless:
            var reader = Lib0.Reader(frame.body)
            guard let payload = try? reader.readVarString(),
                  let object = try? JSONSerialization.jsonObject(with: Data(payload.utf8)) as? [String: Any],
                  let channel = object["ch"] as? String else { return }
            onNotice?(Notice(channel: channel))
        default:
            break
        }
    }
}
