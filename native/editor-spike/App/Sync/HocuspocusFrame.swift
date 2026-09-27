import Foundation

/// Hocuspocus message envelope, matching `@hocuspocus/*` 4.0.0-rc.1 (the
/// version the server pins): every message is `varString(documentName)`
/// followed by `varUint(type)` and a type-specific body. For `sync` and
/// `awareness` the type byte is also the y-protocols message tag, so
/// "type + body" is exactly a y-protocols message.
enum HocuspocusFrame {
    enum MessageType: UInt64 {
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
    enum AuthType: UInt64 {
        case token = 0
        case permissionDenied = 1
        case authenticated = 2
    }

    /// Sent in the auth message's trailing `providerVersion` field so server
    /// logs can tell this client apart from the web provider.
    static let providerVersion = "synapsenote-native-spike"

    static func auth(documentName: String, token: String) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        Lib0.writeVarUint(MessageType.auth.rawValue, into: &data)
        Lib0.writeVarUint(AuthType.token.rawValue, into: &data)
        Lib0.writeVarString(token, into: &data)
        Lib0.writeVarString(providerVersion, into: &data)
        return data
    }

    /// Wrap a y-protocols message (which already starts with its tag).
    static func yMessage(documentName: String, _ message: Data) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        data.append(message)
        return data
    }

    static func bare(documentName: String, _ type: MessageType) -> Data {
        var data = Data()
        Lib0.writeVarString(documentName, into: &data)
        Lib0.writeVarUint(type.rawValue, into: &data)
        return data
    }

    struct Incoming {
        let documentName: String
        let type: UInt64
        /// The message from the type byte on — a complete y-protocols message
        /// for `sync`/`awareness`.
        let yMessage: Data
        /// The body after the type byte.
        let body: Data
    }

    static func decode(_ data: Data) throws -> Incoming {
        var reader = Lib0.Reader(data)
        let name = try reader.readVarString()
        let yMessage = reader.remainder()
        let type = try reader.readVarUint()
        return Incoming(documentName: name, type: type, yMessage: yMessage, body: reader.remainder())
    }
}
