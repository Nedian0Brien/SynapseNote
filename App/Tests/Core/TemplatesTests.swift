import Foundation
import Testing
@testable import SynapseNote

struct TemplatesTests {
    /// new Date(2026, 9, 9, 7, 5, 3) in the fixtures' time zone
    private var date: Date {
        var parts = DateComponents()
        (parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second) = (2026, 10, 9, 7, 5, 3)
        return JSEnvironment.calendar.date(from: parts)!
    }

    @Test func templatesFillAsMorrowFillsThem() throws {
        VaultLoadTests.useFixtureEnvironment()
        let fixture = try CoreFixtures.load("templates")
        for item in try #require(fixture["formats"]?.array) {
            let format = try #require(item["format"]?.string)
            #expect(Templates.formatDate(date, format) == item["text"]?.string, "\(format)")
        }
        for item in try #require(fixture["fills"]?.array) {
            let text = try #require(item["text"]?.string)
            #expect(Templates.fillTemplate(text, .init(title: "My page", date: date)) == item["filled"]?.string, "\(text)")
        }
        let input = try #require(fixture["doc"]?["input"]?.object)
        #expect(JSValue.object(MarkdownParse.markdownToDoc("# {{title}}\n\nWritten {{date:D MMMM}}.\n\n$$\n{{title}}\n$$")) == .object(input))
        #expect(JSValue.object(Templates.applyTemplate(input, .init(title: "My page", date: date))) == fixture["doc"]?["output"])
    }
}
