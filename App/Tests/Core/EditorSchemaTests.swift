import Foundation
import Testing
@testable import SynapseNote

/// The editor's schema and what opening a document does, against Morrow's TipTap schema run in node
/// (Fixtures/core/expected/editor.json, written by `npm run editor-fixtures`): every document of the markdown
/// fixtures opens to the same JSON, and every text block's content survives the trip through the text view's
/// attributed text.
struct EditorSchemaTests {
    static func fixture() throws -> JSObject { try #require(CoreFixtures.load("editor").object) }

    /// the documents of markdown.json and markdown-fuzz.json beside what TipTap made of each
    static func pairs() throws -> [(DocNode, JSValue)] {
        let editor = try fixture()
        var out: [(DocNode, JSValue)] = []
        for (source, key) in [("markdown", "markdown"), ("markdown-fuzz", "fuzz")] {
            let entries = try #require(CoreFixtures.load(source).array)
            let opened = try #require(editor[key]?.array)
            try #require(entries.count == opened.count)
            for (entry, result) in zip(entries, opened) {
                out.append((try #require(entry["doc"]?.object), result))
            }
        }
        return out
    }

    @Test func schemaMatchesTipTap() throws {
        let editor = try Self.fixture()
        let nodes = try #require(editor["nodes"]?.object)
        #expect(nodes.keys == EditorSchema.nodeSpecs.map(\.name))
        for spec in EditorSchema.nodeSpecs {
            let expected = try #require(nodes[spec.name]?.object)
            let attrs = (expected["attrs"]?.array ?? []).map { pair in (pair.array?[0].string ?? "", pair.array?[1] ?? .null) }
            #expect(attrs.map(\.0) == spec.attrs.map(\.0), "\(spec.name)")
            #expect(attrs.map(\.1) == spec.attrs.map(\.1), "\(spec.name)")
            #expect(expected["content"]?.string == spec.content, "\(spec.name)")
            #expect(expected["inline"] == .bool(spec.inline) && expected["atom"] == .bool(spec.atom), "\(spec.name)")
        }
        let marks = try #require(editor["marks"]?.array)
        #expect(marks.map { $0.array?[0].string ?? "" } == EditorSchema.markSpecs.map(\.name))
        for (pair, spec) in zip(marks, EditorSchema.markSpecs) {
            let expected = pair.array?[1].object
            let attrs = (expected?["attrs"]?.array ?? []).map { ($0.array?[0].string ?? "", $0.array?[1] ?? .null) }
            #expect(attrs.map(\.0) == spec.attrs.map(\.0) && attrs.map(\.1) == spec.attrs.map(\.1), "\(spec.name)")
            #expect(expected?["excludes"]?.string == spec.excludes, "\(spec.name)")
        }
    }

    @Test func documentsOpenAsTipTapOpensThem() throws {
        var failures = 0
        for (doc, expected) in try Self.pairs() {
            let opened: JSValue
            do {
                opened = .object(try EditorSchema.normalize(doc))
            } catch EditorSchema.Failure.invalid(let message) {
                opened = .object(JSObject([("error", .string(message))]))
            }
            if JSJSON.stringify(opened) != JSJSON.stringify(expected) {
                failures += 1
                if failures <= 3 { Issue.record("\(CoreFixtures.describe(.object(doc)))\n→ \(CoreFixtures.describe(opened))\nTipTap: \(CoreFixtures.describe(expected))") }
            }
        }
        #expect(failures == 0)
    }

    @Test func textBlocksSurviveTheTextView() throws {
        var blocks = 0, failures = 0
        for (_, expected) in try Self.pairs() {
            guard let doc = expected.object, doc["error"] == nil else { continue }
            func visit(_ node: DocNode) {
                if EditorSchema.textBlocks.contains(node.type) {
                    blocks += 1
                    let content = node.content ?? []
                    let plain = node.type == "codeBlock"
                    let back = InlineText.content(InlineText.attributed(content), plain: plain)
                    let same = JSJSON.stringify(.array(back.map(JSValue.object))) == JSJSON.stringify(.array(content.map(JSValue.object)))
                    // a code block holds unmarked text in documents the parser makes
                    if !same {
                        failures += 1
                        if failures <= 3 { Issue.record("\(CoreFixtures.describe(.object(node)))\n→ \(CoreFixtures.describe(.array(back.map(JSValue.object))))") }
                    }
                }
                for child in node.content ?? [] { visit(child) }
            }
            visit(doc)
        }
        #expect(blocks > 1000)
        #expect(failures == 0)
    }

    @Test func marksSortByRankAndTextJoins() throws {
        let doc: DocNode = .node("doc", ("content", [
            .object(.node("paragraph", ("content", [
                .object(JSObject([("type", "text"), ("text", "a"), ("marks", [["type": "italic"], ["type": "bold"]])]))
                , .object(JSObject([("type", "text"), ("text", "b"), ("marks", [["type": "bold"], ["type": "italic"]])])),
            ]))),
            .object(.node("heading", ("attrs", ["level": 2, "extra": true]), ("content", []))),
        ]))
        let opened = try EditorSchema.normalize(doc)
        #expect(JSJSON.stringify(.object(opened))
            == #"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"},{"type":"italic"}],"text":"ab"}]},{"type":"heading","attrs":{"level":2}}]}"#)
        #expect(throws: EditorSchema.Failure.invalid("Empty text nodes are not allowed")) {
            try EditorSchema.normalize(.node("paragraph", ("content", [["type": "text", "text": ""]])))
        }
        #expect(throws: EditorSchema.Failure.invalid("Unknown node type: video")) { try EditorSchema.normalize(.node("video")) }
    }

    @Test func aDocumentEndsInAParagraphOnceEdited() {
        let list: DocNode = .node("doc", ("content", [.object(.node("horizontalRule"))]))
        #expect(EditorSchema.trailingParagraph(list).content?.map(\.type) == ["horizontalRule", "paragraph"])
        let ends: DocNode = .node("doc", ("content", [.object(.node("paragraph"))]))
        #expect(EditorSchema.trailingParagraph(ends) == ends)
    }
}
