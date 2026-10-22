import Foundation
import Network

/// One request to the sync server: what Morrow's `handle` reads from Node's http server.
nonisolated struct SyncHTTPRequest: Sendable {
    let method: String
    let path: String
    let body: Data
    /// The other computer's address, IPv4 mapped addresses written plainly.
    let remoteAddress: String?
}

nonisolated struct SyncHTTPResponse: Sendable {
    let status: Int
    let body: Data

    static func json(_ status: Int, _ value: JSONValue) -> SyncHTTPResponse {
        SyncHTTPResponse(status: status, body: (try? JSONEncoder().encode(value)) ?? Data("{}".utf8))
    }

    static func json<T: Encodable>(_ status: Int, encoding value: T) -> SyncHTTPResponse {
        SyncHTTPResponse(status: status, body: (try? JSONEncoder().encode(value)) ?? Data("{}".utf8))
    }
}

/// Reads HTTP/1.1 requests with a Content-Length body, enough for Node's fetch and URLSession, and nothing
/// else: no chunked bodies, no keep-alive.
nonisolated enum SyncHTTPParser {
    enum Outcome: Equatable {
        /// More bytes are needed.
        case incomplete
        case request(method: String, path: String, body: Data)
        case invalid
    }

    static func parse(_ data: Data, maxBody: Int) -> Outcome {
        guard let end = data.firstRange(of: Data("\r\n\r\n".utf8)) else {
            return data.count > 64 * 1024 ? .invalid : .incomplete
        }
        guard let head = String(data: data[data.startIndex..<end.lowerBound], encoding: .utf8) else { return .invalid }
        let lines = head.components(separatedBy: "\r\n")
        let start = lines[0].split(separator: " ")
        guard start.count >= 2 else { return .invalid }
        var length = 0
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if name == "content-length" {
                guard let number = Int(value), number >= 0 else { return .invalid }
                length = number
            }
            if name == "transfer-encoding", value.lowercased() != "identity" { return .invalid }
        }
        guard length <= maxBody else { return .invalid }
        let bodyStart = end.upperBound
        guard data.count - (bodyStart - data.startIndex) >= length else { return .incomplete }
        let body = data[bodyStart..<(bodyStart + length)]
        return .request(method: String(start[0]), path: String(start[1]), body: Data(body))
    }

    static func encode(_ response: SyncHTTPResponse) -> Data {
        let reason = switch response.status {
        case 200: "OK"
        case 400: "Bad Request"
        case 403: "Forbidden"
        case 404: "Not Found"
        default: "Internal Server Error"
        }
        let head = "HTTP/1.1 \(response.status) \(reason)\r\nContent-Type: application/json\r\nContent-Length: \(response.body.count)\r\nConnection: close\r\n\r\n"
        return Data(head.utf8) + response.body
    }
}

/// The server other paired computers talk to, on Morrow's port or the next free one.
nonisolated final class SyncHTTPServer: @unchecked Sendable {
    /// Morrow's ports, tried in order; 0 lets the system choose.
    static let ports: [UInt16] = [47610, 47612, 47613, 0]
    static let maxBody = 300 * 1024 * 1024

    private let queue = DispatchQueue(label: "com.synapsenote.sync.server")
    private let handle: @Sendable (SyncHTTPRequest) async -> SyncHTTPResponse
    private var listener: NWListener?
    private(set) var port: UInt16 = 0
    /// Called when the listener stops by itself, such as when the network goes away.
    var onFailure: @Sendable () -> Void = {}

    init(handle: @escaping @Sendable (SyncHTTPRequest) async -> SyncHTTPResponse) {
        self.handle = handle
    }

    var isRunning: Bool { listener != nil }

    /// Starts listening on the first port that is free. The Bonjour service is set with `advertise`.
    func start(ports: [UInt16] = SyncHTTPServer.ports) async throws {
        guard listener == nil else { return }
        var lastError: Error = NWError.posix(.EADDRINUSE)
        for candidate in ports {
            do {
                let parameters = NWParameters.tcp
                parameters.allowLocalEndpointReuse = false
                let listener = try candidate == 0 ? NWListener(using: parameters) : NWListener(using: parameters, on: NWEndpoint.Port(rawValue: candidate)!)
                listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
                let ready = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                    let once = Once()
                    listener.stateUpdateHandler = { state in
                        switch state {
                        case .ready: once.run { continuation.resume(returning: true) }
                        case .failed, .cancelled: once.run { continuation.resume(returning: false) }
                        default: break
                        }
                    }
                    listener.start(queue: queue)
                }
                if ready, let port = listener.port?.rawValue {
                    listener.stateUpdateHandler = { [weak self] state in
                        if case .failed = state { self?.onFailure() }
                    }
                    self.listener = listener
                    self.port = port
                    return
                }
                listener.cancel()
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    func stop() {
        listener?.cancel()
        listener = nil
        port = 0
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return connection.cancel() }
            var buffer = buffer
            if let data { buffer.append(data) }
            switch SyncHTTPParser.parse(buffer, maxBody: Self.maxBody) {
            case .incomplete:
                if isComplete || error != nil { connection.cancel() } else { self.receive(on: connection, buffer: buffer) }
            case .invalid:
                self.send(.json(400, .object([:])), on: connection)
            case .request(let method, let path, let body):
                let request = SyncHTTPRequest(method: method, path: path, body: body, remoteAddress: Self.address(of: connection))
                Task {
                    let response = await self.handle(request)
                    self.send(response, on: connection)
                }
            }
        }
    }

    private func send(_ response: SyncHTTPResponse, on connection: NWConnection) {
        connection.send(content: SyncHTTPParser.encode(response), completion: .contentProcessed { _ in connection.cancel() })
    }

    static func address(of connection: NWConnection) -> String? {
        guard case .hostPort(let host, _) = connection.endpoint else { return nil }
        return plainAddress(host)
    }

    /// An address as Morrow stores it: IPv4 mapped IPv6 addresses written as IPv4, interface names dropped.
    static func plainAddress(_ host: NWEndpoint.Host) -> String? {
        switch host {
        case .ipv4(let address): return "\(address)".split(separator: "%").first.map(String.init)
        case .ipv6(let address):
            let text = "\(address)".split(separator: "%").first.map(String.init) ?? "\(address)"
            return text.hasPrefix("::ffff:") ? String(text.dropFirst(7)) : text
        case .name(let name, _): return name
        @unknown default: return nil
        }
    }
}

/// Runs a block once, for continuations resumed from callbacks that may fire again.
nonisolated final class Once: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    func run(_ body: () -> Void) {
        let first = lock.withLock { () -> Bool in
            if done { return false }
            done = true
            return true
        }
        if first { body() }
    }
}
