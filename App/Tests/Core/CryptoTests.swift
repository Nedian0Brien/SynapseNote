import Foundation
import Testing
@testable import SynapseNote

/// Morrow's core/crypto.ts in node's WebCrypto, Fixtures/core/expected/crypto.json: the same password, salt, iv
/// and page give the same file, and each side opens what the other wrote.
struct CryptoTests {
    /// the byte sequence `crypto.getRandomValues` gives in storage-fixtures.ts: 0, 1, 2, … from `start`
    static func randomSource(from start: Int) -> (Int) -> [UInt8] {
        var next = start
        return { count in
            defer { next += count }
            return (0..<count).map { UInt8((next + $0) & 0xFF) }
        }
    }

    @Test func encryptsAsMorrowDoes() throws {
        let fixture = try CoreFixtures.load("crypto")
        let cases = try #require(fixture["cases"]?.array)
        #expect(cases.count == 4)
        for (index, item) in cases.enumerated() {
            let plain = try #require(item["plain"]?.string)
            let password = try #require(item["password"]?.string)
            let salt = try #require(PageCrypto.forgivingBase64Decode(item["salt"]?.string ?? ""))
            let iterations = Int(try #require(item["iterations"]?.number))
            let text = try #require(item["text"]?.string)
            let key = try PageCrypto.deriveKey(password, salt: salt, iterations: iterations)
            let random = Self.randomSource(from: Int(try #require(item["ivStart"]?.number)))
            #expect(try PageCrypto.encryptPage(plain, key, random: random) == text, "case \(index)")
            let opened = PageCrypto.decryptPage(text, password)
            #expect(opened?.plain == plain, "case \(index)")
            #expect(opened?.pageKey.salt == salt)
            #expect(PageCrypto.decryptPage(text, password + "!") == nil, "case \(index) wrong password")
            #expect(PageCrypto.isEncryptedText(text))
        }
    }

    @Test func readsHeadersAsMorrowDoes() throws {
        let fixture = try CoreFixtures.load("crypto")
        for item in try #require(fixture["headers"]?.array) {
            let text = try #require(item["text"]?.string)
            let header = PageCrypto.readEncrypted(text)
            guard let expected = item["header"], !expected.isNull else {
                #expect(header == nil, "\(text)")
                continue
            }
            let read = try #require(header, "\(text)")
            #expect(Data(read.salt).base64EncodedString() == expected["salt"]?.string)
            #expect(Data(read.iv).base64EncodedString() == expected["iv"]?.string)
            #expect(Double(read.iterations) == expected["iterations"]?.number)
            #expect(read.body == expected["body"]?.string)
        }
    }

    @Test func forgivingBase64() {
        #expect(PageCrypto.forgivingBase64Decode("AAAA") == [0, 0, 0])
        #expect(PageCrypto.forgivingBase64Decode("YQ==") == [0x61])
        #expect(PageCrypto.forgivingBase64Decode("YQ") == [0x61])
        #expect(PageCrypto.forgivingBase64Decode(" Y Q = = ") == [0x61])
        #expect(PageCrypto.forgivingBase64Decode("Y") == nil)
        #expect(PageCrypto.forgivingBase64Decode("@@") == nil)
        #expect(PageCrypto.forgivingBase64Decode("") == [])
    }
}
