import CommonCrypto
import CryptoKit
import Foundation

/// The encryption of Morrow's sync, as `electron/sync.cts`: AES-256-GCM with a key only the two paired
/// computers know, every message stamped with the time and a nonce so it cannot be replayed.
nonisolated enum SyncCrypto {
    /// Morrow's limit on how far apart two clocks may be.
    static let maxSkew: TimeInterval = 5 * 60
    static let codeAlphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")

    enum Failure: LocalizedError, Equatable {
        case badMessage, tooOld, replayed
        var errorDescription: String? {
            switch self {
            case .badMessage: "Bad message."
            case .tooOld: "Message too old, check both clocks."
            case .replayed: "Message replayed."
            }
        }
    }

    /// What travels: the nonce and the ciphertext followed by its tag, both base64.
    struct Envelope: Codable, Equatable, Sendable {
        let iv: String
        let data: String
    }

    /// The key two paired computers share, from the secret agreed when they paired (Morrow's `peerKey`).
    static func peerKey(secret: Data, deviceId: String, peerId: String) -> SymmetricKey {
        let ids = [deviceId, peerId].sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }.joined(separator: "|")
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: secret),
            salt: Data("morrow-sync-v1".utf8),
            info: Data(ids.utf8),
            outputByteCount: 32
        )
    }

    /// The code as Morrow reads it: upper case, only the letters and digits a code is made of.
    static func normalized(code: String) -> String {
        String(code.uppercased().filter { codeAlphabet.contains($0) })
    }

    /// The key for pairing, from the code shown on the computer with `deviceId` (Morrow's `pairingKey`).
    static func pairingKey(code: String, deviceId: String) -> SymmetricKey {
        let password = Array(normalized(code: code).utf8)
        let salt = Array("morrow-pair:\(deviceId)".utf8)
        var derived = [UInt8](repeating: 0, count: 32)
        let status = password.withUnsafeBufferPointer { passwordBytes in
            CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                passwordBytes.baseAddress.map { UnsafeRawPointer($0).assumingMemoryBound(to: CChar.self) },
                password.count,
                salt,
                salt.count,
                CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                200_000,
                &derived,
                derived.count
            )
        }
        precondition(status == kCCSuccess, "PBKDF2 failed")
        return SymmetricKey(data: derived)
    }

    /// A new pairing code, sixteen characters in groups of four, as Morrow's `startPairing`.
    static func newCode() -> String {
        let bytes = (0..<16).map { _ in UInt8.random(in: 0...255) }
        let raw = bytes.map { codeAlphabet[Int($0) % 32] }
        return stride(from: 0, to: 16, by: 4).map { String(raw[$0..<$0 + 4]) }.joined(separator: "-")
    }

    static func newSecret() -> Data {
        Data((0..<32).map { _ in UInt8.random(in: 0...255) })
    }

    /// Seals a payload the way Morrow's `seal` does.
    static func seal(_ payload: JSONValue, with key: SymmetricKey, now: Date = Date()) throws -> Envelope {
        let nonce = Data((0..<12).map { _ in UInt8.random(in: 0...255) }).base64EncodedString()
        let message = JSONValue.object([
            "ts": .number((now.timeIntervalSince1970 * 1000).rounded()),
            "nonce": .string(nonce),
            "payload": payload,
        ])
        let body = try JSONEncoder().encode(message)
        let iv = Data((0..<12).map { _ in UInt8.random(in: 0...255) })
        return try seal(body: body, iv: iv, with: key)
    }

    /// Seals given bytes with a given nonce, for checking against Morrow's output.
    static func seal(body: Data, iv: Data, with key: SymmetricKey) throws -> Envelope {
        let box = try AES.GCM.seal(body, using: key, nonce: AES.GCM.Nonce(data: iv))
        return Envelope(iv: iv.base64EncodedString(), data: (box.ciphertext + box.tag).base64EncodedString())
    }

    /// The bytes inside an envelope, failing when they were not sealed with `key`.
    static func openBody(_ envelope: Envelope, with key: SymmetricKey) throws -> Data {
        guard let iv = Data(base64Encoded: envelope.iv), let data = Data(base64Encoded: envelope.data), data.count >= 16 else {
            throw Failure.badMessage
        }
        do {
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: data.dropLast(16), tag: data.suffix(16))
            return try AES.GCM.open(box, using: key)
        } catch {
            throw Failure.badMessage
        }
    }
}

/// Opens messages, refusing old ones and ones seen before, as Morrow's `open`.
nonisolated final class SyncOpener: @unchecked Sendable {
    private let lock = NSLock()
    private var nonces: [String: Date] = [:]

    func open(_ envelope: SyncCrypto.Envelope, with key: SymmetricKey, now: Date = Date()) throws -> JSONValue {
        let body = try SyncCrypto.openBody(envelope, with: key)
        guard let message = try? JSONDecoder().decode(JSONValue.self, from: body),
              let ts = message["ts"]?.doubleValue, let nonce = message["nonce"]?.stringValue
        else { throw SyncCrypto.Failure.badMessage }
        if abs(now.timeIntervalSince1970 * 1000 - ts) > SyncCrypto.maxSkew * 1000 { throw SyncCrypto.Failure.tooOld }
        try lock.withLock {
            if nonces[nonce] != nil { throw SyncCrypto.Failure.replayed }
            nonces[nonce] = now
            nonces = nonces.filter { now.timeIntervalSince($0.value) <= SyncCrypto.maxSkew * 2 }
        }
        return message["payload"] ?? .null
    }
}
