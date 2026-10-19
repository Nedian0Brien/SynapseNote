import Foundation

/// Answers the editor page's storage calls (web/src/host/replica.ts) from the Swift session, which is the only one
/// that reads and writes the vault. Calls go onto the session's queue the moment they arrive, so they keep the
/// order the page made them in.
nonisolated final class VaultRPC: Sendable {
    let host: SessionHost

    init(host: SessionHost) {
        self.host = host
    }

    func handle(method: String, params: [JSONValue], reply: @escaping @Sendable (Result<JSONValue, EditorCommand.RPCFailure>) -> Void) {
        host.call(method, params, reply: reply)
    }
}
