import Foundation
import Testing
@testable import SynapseNote

struct MarkdownParseTests {
    @Test func documentsMatchMorrows() throws {
        let cases = try #require(CoreFixtures.load("markdown").array)
        #expect(cases.count >= 25)
        for item in cases {
            let name = item["name"]?.string ?? "?"
            let body = try #require(item["body"]?.string)
            let doc = JSValue.object(MarkdownParse.markdownToDoc(body))
            #expect(doc == item["doc"], "\(name)\nswift:\n\(CoreFixtures.describe(doc))\nmorrow:\n\(CoreFixtures.describe(item["doc"] ?? .null))")
            // Morrow's serialized markdown read back
            let markdown = try #require(item["markdown"]?.string)
            let reparsed = JSValue.object(MarkdownParse.markdownToDoc(markdown))
            #expect(reparsed == item["reparsed"], "\(name) reparsed\nswift:\n\(CoreFixtures.describe(reparsed))")
            #expect(reparsed != .null && JSJSON.stringify(reparsed).count > 20)
        }
    }

    @Test func fuzzedDocumentsMatchMorrows() throws {
        let cases = try #require(CoreFixtures.load("markdown-fuzz").array)
        #expect(cases.count == 1500)
        var failures = 0
        for (index, item) in cases.enumerated() {
            let body = try #require(item["body"]?.string)
            let doc = JSValue.object(MarkdownParse.markdownToDoc(body))
            if doc != item["doc"] {
                failures += 1
                if failures <= 5 {
                    Issue.record("case \(index): \(CoreFixtures.describe(.string(body)))\nswift:\n\(CoreFixtures.describe(doc))\nmorrow:\n\(CoreFixtures.describe(item["doc"] ?? .null))")
                }
            }
        }
        #expect(failures == 0)
    }

    @Test func linksAreNormalizedAsMarkdownItDoes() {
        // markdown-it 15.0.2 normalizeLink and normalizeLinkText, values from node
        #expect(JSText.string(MarkdownURL.normalizeLink("https://example.org/a b?q=1#x y".units)) == "https://example.org/a%20b?q=1#x%20y")
        #expect(JSText.string(MarkdownURL.normalizeLink("https://例え.jp/パス".units)) == "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9")
        #expect(JSText.string(MarkdownURL.normalizeLinkText("https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9".units)) == "https://例え.jp/パス")
        #expect(JSText.string(MarkdownURL.normalizeLink("mailto:a@b.c".units)) == "mailto:a@b.c")
        #expect(MarkdownURL.validateLink("javascript:alert(1)".units) == false)
        #expect(MarkdownURL.validateLink("data:image/png;base64,AAA".units) == true)
    }
}
