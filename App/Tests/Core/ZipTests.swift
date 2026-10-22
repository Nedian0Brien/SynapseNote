import Foundation
import Testing
@testable import SynapseNote

/// Zip archives as Morrow's fflate writes and reads them (Fixtures/core/expected/zip.json, written by
/// `npm run zip-fixtures`): Swift reads what fflate wrote, and what Swift writes reads back the same. The archive
/// a test writes is also left in the temporary folder (`swift-zip-check.zip`) for fflate to read.
struct ZipTests {
    @Test func archivesFromFflateRead() throws {
        let fixture = try #require(CoreFixtures.load("zip").object)
        let expected = try #require(fixture["entries"]?.object)
        let archives = try #require(fixture["archives"]?.array)
        let level6 = try #require(archives.first { $0["name"]?.string == "level6" }?["zip"]?.string).flatMap { Data(base64Encoded: $0) }
        let entries = try Zip.read(try #require(level6))
        #expect(entries.map(\.path) == ["Morrow/Home.md", "Morrow/한글 페이지.md", "Morrow/attachments/picture.bin", "Morrow/empty.md", "Morrow/long.md"])
        for entry in entries {
            #expect(entry.data.base64EncodedString() == expected[entry.path]?.string, "\(entry.path)")
        }
        // a stored archive with a folder entry: the folder is left out
        let stored = try #require(archives.first { $0["name"]?.string == "stored" }?["zip"]?.string).flatMap { Data(base64Encoded: $0) }
        let storedEntries = try Zip.read(try #require(stored))
        #expect(storedEntries.map(\.path) == ["folder/a.md"])
        #expect(storedEntries.first?.data == Data("a".utf8))
    }

    @Test func archivesWrittenReadBack() throws {
        let long = Data(String(repeating: "Morrow keeps your notes as Markdown. ", count: 400).utf8)
        let entries: [(path: String, data: Data)] = [("Morrow/Home.md", Data("# Home\n".utf8)), ("Morrow/한글.md", Data("한글 😀".utf8)),
                                                    ("Morrow/empty.md", Data()), ("Morrow/long.md", long),
                                                    ("Morrow/bytes.bin", Data((0..<512).map { UInt8($0 * 37 % 256) }))]
        let archive = Zip.write(entries)
        // the long text is deflated
        #expect(archive.count < long.count)
        let read = try Zip.read(archive)
        #expect(read.map(\.path) == entries.map(\.path))
        #expect(read.map(\.data) == entries.map(\.data))
        try archive.write(to: FileManager.default.temporaryDirectory.appending(path: "swift-zip-check.zip"))
        #expect(Zip.crc32(Data("123456789".utf8)) == 0xCBF4_3926)
        #expect(throws: Zip.Failure.self) { try Zip.read(Data("not a zip".utf8)) }
    }

    @Test func zipTimesAreLocalDosTimes() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let date = calendar.date(from: DateComponents(year: 2026, month: 10, day: 21, hour: 13, minute: 45, second: 31))!
        let (time, day) = Zip.dosTime(date)
        #expect(time == UInt16(13 << 11 | 45 << 5 | 15))
        #expect(day == UInt16(46 << 9 | 10 << 5 | 21))
    }
}
