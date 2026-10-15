import Foundation

/// Hocuspocus message envelope, matching the `@hocuspocus/*` version the
/// server pins: every message is `varString(documentName)` followed by
/// `varUint(type)` and a type-specific body. For `sync` and `awareness` the
/// type byte is also the y-protocols message tag, so "type + body" is exactly
/// a y-protocols message.
public enum HocuspocusFrame {
    public enum MessageType: UInt64, Sendable {
        case sync = 0
        case awareness = 1
        case auth = 2
        case queryAwareness = 3
        case stateless = 5
        case close = 7
        case syncStatus = 8
        case ping = 9
        case pong = 10
    }

    /// Sub-type of an `auth` message (`AuthMessageType` in @hocuspocus/common).
    public enum AuthType: UInt64, Sendable {
        case token = 0
        case permissionDenied = 1
        case authenticated = 2
    }

    /// Sent in the auth message's trailing `providerVersion` field so server
    /// logs can tell this client apart from the web provider.
    public static let providerVersion = "synapsenote-apple"

    public static func auth(documentName: String, token: String) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        Lib0.writeVarUint(MessageType.auth.rawValue, into: &data)
        Lib0.writeVarUint(AuthType.token.rawValue, into: &data)
        Lib0.writeVarString(token, into: &data)
        Lib0.writeVarString(providerVersion, into: &data)
        return data
    }

    /// Wrap a y-protocols message (which already starts with its tag).
    public static func yMessage(documentName: String, _ message: Data) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        data.append(message)
        return data
    }

    public static func bare(documentName: String, _ type: MessageType) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        Lib0.writeVarUint(type.rawValue, into: &data)
        return data
    }

    /// A y-protocols awareness message carrying one client's state.
    public static func awareness(clientID: UInt32, clock: UInt64, stateJSON: String) -> Data {
        var update = Data()
        Lib0.writeVarUint(1, into: &update)
        Lib0.writeVarUint(UInt64(clientID), into: &update)
        Lib0.writeVarUint(clock, into: &update)
        Lib0.writeVarString(stateJSON, into: &update)
        var message = Data()
        Lib0.writeVarUint(MessageType.awareness.rawValue, into: &message)
        Lib0.writeVarBytes(update, into: &message)
        return message
    }

    public struct Incoming: Sendable {
        public let documentName: String
        public let type: UInt64
        /// The message from the type byte on — a complete y-protocols message
        /// for `sync`/`awareness`.
        public let yMessage: Data
        /// The body after the type byte.
        public let body: Data
    }

    public static func decode(_ data: Data) throws -> Incoming {
        var reader = Lib0.Reader(data)
        let name = try reader.readVarString()
        let yMessage = reader.remainder()
        let type = try reader.readVarUint()
        return Incoming(documentName: name, type: type, yMessage: yMessage, body: reader.remainder())
    }
}
