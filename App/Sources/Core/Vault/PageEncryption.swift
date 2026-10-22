import CommonCrypto
import CryptoKit
import Foundation

/// Morrow's core/crypto.ts: a password protected page is one encrypted file, with only the settings needed to
/// decrypt it left readable. The key comes from PBKDF2-SHA256 (WebCrypto `deriveKey`, here CommonCrypto's
/// `CCKeyDerivationPBKDF`) and the page is sealed with AES-256-GCM (WebCrypto `encrypt`, here CryptoKit); WebCrypto
/// returns the ciphertext followed by the 16-byte tag, which is `SealedBox.ciphertext + tag`.
nonisolated extension PageCrypto {
    static let kdf = "pbkdf2-sha256"
    static let iterations = 600_000
    /// the line under the settings; it is file format, so it keeps Morrow's wording
    static let notice = "This page is encrypted with a password in Morrow."

    struct PageKey: Sendable {
        let key: SymmetricKey
        let salt: [UInt8]
        let iterations: Int
    }

    struct Header: Equatable, Sendable {
        var salt: [UInt8]
        var iv: [UInt8]
        var iterations: Int
        var body: String
    }

    enum Failure: Error, Equatable {
        case keyDerivation(Int32)
    }

    /// `deriveKey`: the password as UTF-8 bytes, stretched into a 256-bit key
    static func deriveKey(_ password: String, salt: [UInt8], iterations: Int = iterations) throws(Failure) -> PageKey {
        guard (1...Int(UInt32.max)).contains(iterations) else { throw .keyDerivation(Int32(kCCParamError)) }
        let secret = Array(password.utf8)
        var derived = [UInt8](repeating: 0, count: 32)
        let status = secret.withUnsafeBufferPointer { secretBytes in
            secretBytes.withMemoryRebound(to: CChar.self) { passwordBytes in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2), passwordBytes.baseAddress, secret.count, salt, salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations), &derived, derived.count,
                )
            }
        }
        guard status == kCCSuccess else { throw .keyDerivation(status) }
        return PageKey(key: SymmetricKey(data: derived), salt: salt, iterations: iterations)
    }

    /// `newPageKey`: a fresh 16-byte salt from the random source
    static func newPageKey(_ password: String, random: (Int) -> [UInt8]) throws(Failure) -> PageKey {
        try deriveKey(password, salt: random(16))
    }

    /// `readEncrypted`: the plain settings at the top of an encrypted page, nil for an ordinary page
    static func readEncrypted(_ text: String) -> Header? {
        let split = Frontmatter.split(text)
        guard let data = split.data, data[marker] == .string(cipher) else { return nil }
        let count: Int
        if case .number(let value) = data["iterations"], value >= 100_000 {
            // WebCrypto refuses a count that is not a finite 32-bit number, and so does deriveKey here
            count = value.isFinite && value <= Double(UInt32.max) ? Int(value) : -1
        } else {
            count = iterations
        }
        func stringOf(_ value: JSValue?) -> String {
            guard let value, !value.isNull else { return "" }
            return value.jsString
        }
        guard let salt = forgivingBase64Decode(stringOf(data["salt"])), let iv = forgivingBase64Decode(stringOf(data["iv"])) else { return nil }
        return Header(salt: salt, iv: iv, iterations: count, body: JSText.string(JSText.trim(split.body.units)))
    }

    /// `encryptPage`: the file that goes to disk, settings then the sealed page as base64 in lines of 76
    static func encryptPage(_ plain: String, _ pageKey: PageKey, random: (Int) -> [UInt8]) throws -> String {
        let iv = random(12)
        let sealed = try AES.GCM.seal(Data(plain.utf8), using: pageKey.key, nonce: AES.GCM.Nonce(data: iv))
        let encoded = (sealed.ciphertext + sealed.tag).base64EncodedString()
        var lines: [String] = []
        var rest = Substring(encoded)
        while !rest.isEmpty {
            lines.append(String(rest.prefix(76)))
            rest = rest.dropFirst(76)
        }
        if lines.isEmpty { lines = [""] }
        return ([
            "---",
            "\(marker): \(cipher)",
            "kdf: \(kdf)",
            "iterations: \(pageKey.iterations)",
            "salt: \(Data(pageKey.salt).base64EncodedString())",
            "iv: \(Data(iv).base64EncodedString())",
            "---",
            notice,
            "",
        ] + lines + [""]).joined(separator: "\n")
    }

    private static let base64Line = JSRegex(#"^[A-Za-z0-9+/=]+$"#)

    /// `decryptPage`: nil when the password is wrong or the file was changed
    static func decryptPage(_ text: String, _ password: String) -> (plain: String, pageKey: PageKey)? {
        guard let header = readEncrypted(text), let pageKey = try? deriveKey(password, salt: header.salt, iterations: header.iterations) else { return nil }
        let body = JSText.split(header.body, on: 0x0A).filter { base64Line.test(JSText.string(JSText.trim($0.units))) }.joined()
        guard let bytes = forgivingBase64Decode(body), bytes.count >= 16,
              let nonce = try? AES.GCM.Nonce(data: header.iv),
              let box = try? AES.GCM.SealedBox(nonce: nonce, ciphertext: bytes.dropLast(16), tag: bytes.suffix(16)),
              let opened = try? AES.GCM.open(box, using: pageKey.key)
        else { return nil }
        // TextDecoder drops a leading byte order mark and replaces broken sequences
        var data = Data(opened)
        if data.starts(with: [0xEF, 0xBB, 0xBF]) { data.removeFirst(3) }
        return (String(decoding: data, as: UTF8.self), pageKey)
    }

    /// `atob` after Morrow strips whitespace: the forgiving-base64 decode of the HTML standard
    static func forgivingBase64Decode(_ text: String) -> [UInt8]? {
        var units = text.utf16.filter { !JSText.isSpace($0) }
        if units.count % 4 == 0 {
            if units.last == 0x3D { units.removeLast() }
            if units.last == 0x3D { units.removeLast() }
        }
        if units.count % 4 == 1 { return nil }
        var bits: UInt32 = 0
        var held = 0
        var bytes: [UInt8] = []
        for unit in units {
            let value: UInt32
            switch unit {
            case 0x41...0x5A: value = UInt32(unit - 0x41)
            case 0x61...0x7A: value = UInt32(unit - 0x61 + 26)
            case 0x30...0x39: value = UInt32(unit - 0x30 + 52)
            case 0x2B: value = 62
            case 0x2F: value = 63
            default: return nil
            }
            bits = (bits << 6) | value
            held += 6
            if held >= 8 {
                held -= 8
                bytes.append(UInt8((bits >> UInt32(held)) & 0xFF))
            }
        }
        return bytes
    }
}
