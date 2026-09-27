import Foundation

/// A single-document Hocuspocus client over `URLSessionWebSocketTask`.
///
/// Connect sequence mirrors `@hocuspocus/provider`: send auth, wait for
/// `authenticated`, then send SyncStep1. The server closes a connection that
/// has been silent for its timeout (60s by default), so a query-awareness
/// message goes out every 20 seconds. On disconnect it reconnects with backoff;
/// the Y doc keeps its state, and the SyncStep1/SyncStep2 exchange after
/// reconnect carries whatever either side missed.
@MainActor
final class HocuspocusClient: NSObject {
    enum Status: String {
        case disconnected, connecting, authenticating, syncing, synced
    }

    let url: URL
    let documentName: String
    let doc: SpikeDoc
    /// JSON auth token. `{}` is accepted by the local server: a token without a
    /// `principalId` is attributed to the service writer.
    let token: String

    var onRemoteDeltas: (([[TextDelta]]) -> Void)?
    var onStatus: ((Status) -> Void)?
    var onLog: ((String) -> Void)?

    private(set) var status: Status = .disconnected {
        didSet { if status != oldValue { onStatus?(status) } }
    }

    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var keepalive: Timer?
    private var reconnectDelay: TimeInterval = 0.5
    private var generation = 0

    init(url: URL, documentName: String, doc: SpikeDoc, token: String = "{}") {
        self.url = url
        self.documentName = documentName
        self.doc = doc
        self.token = token
        super.init()
        self.session = URLSession(configuration: .default)
    }

    func connect() {
        generation += 1
        let current = generation
        status = .connecting
        let task = session.webSocketTask(with: url)
        task.maximumMessageSize = 16 * 1024 * 1024
        self.task = task
        task.resume()
        status = .authenticating
        send(HocuspocusFrame.auth(documentName: documentName, token: token))
        receiveNext(task, generation: current)
        keepalive?.invalidate()
        keepalive = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.send(HocuspocusFrame.bare(documentName: self.documentName, .queryAwareness))
            }
        }
    }

    /// Broadcast a y-protocols message produced by a local edit.
    func sendYMessage(_ message: Data) {
        send(HocuspocusFrame.yMessage(documentName: documentName, message))
    }

    private func send(_ data: Data) {
        guard let task else { return }
        task.send(.data(data)) { [weak self] error in
            guard let error else { return }
            Task { @MainActor in self?.onLog?("send failed: \(error.localizedDescription)") }
        }
    }

    private func receiveNext(_ task: URLSessionWebSocketTask, generation: Int) {
        task.receive { [weak self] result in
            Task { @MainActor in
                guard let self, generation == self.generation else { return }
                switch result {
                case .success(.data(let data)):
                    self.handle(data)
                    self.receiveNext(task, generation: generation)
                case .success(.string(let text)):
                    self.onLog?("unexpected text frame: \(text.prefix(80))")
                    self.receiveNext(task, generation: generation)
                case .success:
                    self.receiveNext(task, generation: generation)
                case .failure(let error):
                    self.onLog?("socket closed: \(error.localizedDescription)")
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func scheduleReconnect() {
        status = .disconnected
        keepalive?.invalidate()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 10)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            MainActor.assumeIsolated { self?.connect() }
        }
    }

    private func handle(_ data: Data) {
        let frame: HocuspocusFrame.Incoming
        do {
            frame = try HocuspocusFrame.decode(data)
        } catch {
            onLog?("undecodable frame (\(data.count) bytes): \(error)")
            return
        }
        guard frame.documentName == documentName else { return }

        switch HocuspocusFrame.MessageType(rawValue: frame.type) {
        case .auth:
            handleAuth(frame.body)
        case .sync:
            handleSync(frame)
        case .ping:
            send(HocuspocusFrame.bare(documentName: documentName, .pong))
        case .close:
            onLog?("server closed the document connection")
        case .awareness, .queryAwareness, .stateless, .syncStatus, .pong, .none:
            break
        }
    }

    private func handleAuth(_ body: Data) {
        var reader = Lib0.Reader(body)
        guard let raw = try? reader.readVarUint(), let kind = HocuspocusFrame.AuthType(rawValue: raw) else {
            onLog?("malformed auth message")
            return
        }
        switch kind {
        case .authenticated:
            let scope = (try? reader.readVarString()) ?? "?"
            onLog?("authenticated (scope: \(scope))")
            reconnectDelay = 0.5
            status = .syncing
            sendYMessage(doc.syncStep1())
        case .permissionDenied:
            let reason = (try? reader.readVarString()) ?? "?"
            onLog?("permission denied: \(reason)")
        case .token:
            // The server asks for a token again; resend it.
            send(HocuspocusFrame.auth(documentName: documentName, token: token))
        }
    }

    private func handleSync(_ frame: HocuspocusFrame.Incoming) {
        // body = varUint(syncStep) + payload; SyncStep2 (1) completes the initial sync.
        var reader = Lib0.Reader(frame.body)
        let step = try? reader.readVarUint()
        do {
            let result = try doc.receive(message: frame.yMessage)
            for reply in result.replies { sendYMessage(reply) }
            if !result.deltas.isEmpty { onRemoteDeltas?(result.deltas) }
            if step == 1 && status == .syncing { status = .synced }
        } catch {
            onLog?("sync message failed: \(error)")
        }
    }
}
