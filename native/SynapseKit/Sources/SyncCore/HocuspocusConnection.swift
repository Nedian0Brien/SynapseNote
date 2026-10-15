import Foundation

/// One document's Hocuspocus connection over `URLSessionWebSocketTask`.
///
/// The connect sequence mirrors `@hocuspocus/provider`: send auth, wait for
/// `authenticated`, then let the owner start its sync. The server closes a
/// connection that has been silent for its timeout (60s by default), so a
/// query-awareness message goes out every 20 seconds. On disconnect it
/// reconnects with backoff; the owner keeps its Y doc and resyncs.
@MainActor
public final class HocuspocusConnection {
    public enum Status: String, Sendable {
        case disconnected, connecting, authenticating, connected
    }

    public let url: URL
    public let documentName: String
    /// Builds the JSON auth token for each (re)connect.
    public var token: () -> String = { "{}" }

    public var onStatus: ((Status) -> Void)?
    /// Called after the server accepts the token; the owner sends SyncStep1 here.
    public var onAuthenticated: (() -> Void)?
    /// The server refused the token (for example a lineage mismatch).
    public var onPermissionDenied: ((String) -> Void)?
    public var onFrame: ((HocuspocusFrame.Incoming) -> Void)?
    public var onLog: ((String) -> Void)?

    public private(set) var status: Status = .disconnected {
        didSet { if status != oldValue { onStatus?(status) } }
    }

    private let session = URLSession(configuration: .default)
    private var task: URLSessionWebSocketTask?
    private var keepalive: Timer?
    private var reconnectDelay: TimeInterval = 0.5
    private var generation = 0
    private var stopped = false

    public init(url: URL, documentName: String) {
        self.url = url
        self.documentName = documentName
    }

    public func connect() {
        stopped = false
        generation += 1
        let current = generation
        status = .connecting
        let task = session.webSocketTask(with: url)
        task.maximumMessageSize = 16 * 1024 * 1024
        self.task = task
        task.resume()
        status = .authenticating
        send(HocuspocusFrame.auth(documentName: documentName, token: token()))
        receiveNext(task, generation: current)
        keepalive?.invalidate()
        keepalive = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.send(HocuspocusFrame.bare(documentName: self.documentName, .queryAwareness))
            }
        }
    }

    public func disconnect() {
        stopped = true
        generation += 1
        keepalive?.invalidate()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        status = .disconnected
    }

    /// Send a y-protocols message (sync or awareness) for this document.
    public func sendYMessage(_ message: Data) {
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
        guard !stopped else { return }
        let delay = reconnectDelay
        reconnectDelay = min(reconnectDelay * 2, 10)
        let current = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            MainActor.assumeIsolated {
                guard let self, !self.stopped, current == self.generation else { return }
                self.connect()
            }
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
        case .ping:
            send(HocuspocusFrame.bare(documentName: documentName, .pong))
        case .close:
            onLog?("server closed the document connection")
        default:
            onFrame?(frame)
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
            reconnectDelay = 0.5
            status = .connected
            onAuthenticated?()
        case .permissionDenied:
            let reason = (try? reader.readVarString()) ?? "?"
            onLog?("permission denied: \(reason)")
            onPermissionDenied?(reason)
        case .token:
            send(HocuspocusFrame.auth(documentName: documentName, token: token()))
        }
    }
}
