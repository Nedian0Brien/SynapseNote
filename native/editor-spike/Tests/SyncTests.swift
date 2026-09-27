import UIKit
import XCTest
@testable import EditorSpike

final class Lib0Tests: XCTestCase {
    func testVarUintRoundTrip() throws {
        for value: UInt64 in [0, 1, 127, 128, 300, 16_384, UInt64(UInt32.max)] {
            var data = Data()
            Lib0.writeVarUint(value, into: &data)
            var reader = Lib0.Reader(data)
            XCTAssertEqual(try reader.readVarUint(), value)
            XCTAssertTrue(reader.isAtEnd)
        }
    }

    func testVarStringUsesUTF8ByteLength() throws {
        var data = Data()
        Lib0.writeVarString("노트", into: &data)
        XCTAssertEqual(data.first, 6) // two Hangul syllables, three bytes each
        var reader = Lib0.Reader(data)
        XCTAssertEqual(try reader.readVarString(), "노트")
    }

    func testTruncatedInputThrows() {
        var reader = Lib0.Reader(Data([0x80]))
        XCTAssertThrowsError(try reader.readVarUint())
    }
}

final class HocuspocusFrameTests: XCTestCase {
    func testAuthMessageLayout() throws {
        let data = HocuspocusFrame.auth(documentName: "a", token: "{}")
        // varString("a") varUint(2=auth) varUint(0=token) varString("{}") varString(version)
        XCTAssertEqual(Array(data.prefix(7)), [1, 0x61, 2, 0, 2, 0x7B, 0x7D])
        var reader = Lib0.Reader(data.dropFirst(7))
        XCTAssertEqual(try reader.readVarString(), HocuspocusFrame.providerVersion)
    }

    func testDecodeSplitsNameTypeAndYMessage() throws {
        let doc = SpikeDoc()
        let step1 = doc.syncStep1()
        let framed = HocuspocusFrame.yMessage(documentName: "notes/one", step1)
        let incoming = try HocuspocusFrame.decode(framed)
        XCTAssertEqual(incoming.documentName, "notes/one")
        XCTAssertEqual(incoming.type, HocuspocusFrame.MessageType.sync.rawValue)
        XCTAssertEqual(incoming.yMessage, step1)
    }
}

final class SelectionShiftTests: XCTestCase {
    func testInsertBeforeSelectionMovesIt() {
        XCTAssertEqual(TextBinding.shift(NSRange(location: 5, length: 2), insertAt: 3, length: 4), NSRange(location: 9, length: 2))
    }

    func testInsertInsideSelectionGrowsIt() {
        XCTAssertEqual(TextBinding.shift(NSRange(location: 5, length: 4), insertAt: 7, length: 3), NSRange(location: 5, length: 7))
    }

    func testDeleteOverlappingSelectionClampsIt() {
        XCTAssertEqual(TextBinding.shift(NSRange(location: 5, length: 5), deleteAt: 3, length: 4), NSRange(location: 3, length: 3))
        XCTAssertEqual(TextBinding.shift(NSRange(location: 5, length: 0), deleteAt: 1, length: 2), NSRange(location: 3, length: 0))
    }
}

@MainActor
final class TextBindingTests: XCTestCase {
    private func makeBinding() -> (SpikeDoc, UITextView, TextBinding) {
        let doc = SpikeDoc()
        let client = HocuspocusClient(url: URL(string: "ws://localhost:1/collab")!, documentName: "t", doc: doc)
        let textView = UITextView(usingTextLayoutManager: true)
        return (doc, textView, TextBinding(doc: doc, client: client, textView: textView))
    }

    func testLocalReplacementReachesDoc() {
        let (doc, textView, _) = makeBinding()
        textView.textStorage.replaceCharacters(in: NSRange(location: 0, length: 0), with: "# 제목 😀\n본문")
        XCTAssertEqual(doc.text(), "# 제목 😀\n본문")
        textView.textStorage.replaceCharacters(in: NSRange(location: 2, length: 2), with: "새 제목")
        XCTAssertEqual(doc.text(), "# 새 제목 😀\n본문")
        textView.textStorage.deleteCharacters(in: NSRange(location: 6, length: 3)) // " 😀"
        XCTAssertEqual(doc.text(), "# 새 제목\n본문")
    }

    func testRemoteDeltaUpdatesViewWithoutEcho() throws {
        let (doc, textView, binding) = makeBinding()
        let peer = SpikeDoc()
        _ = try peer.localEdit(index: 0, deleteLen: 0, insert: "abc def")
        // Handshake peer → doc.
        let reply = try peer.receive(message: doc.syncStep1())
        for message in reply.replies {
            binding.apply(try doc.receive(message: message).deltas)
        }
        XCTAssertEqual(textView.textStorage.string, "abc def")
        textView.selectedRange = NSRange(location: 4, length: 0)

        let update = try peer.localEdit(index: 0, deleteLen: 0, insert: "XY ")!
        binding.apply(try doc.receive(message: update).deltas)
        XCTAssertEqual(textView.textStorage.string, "XY abc def")
        XCTAssertEqual(doc.text(), "XY abc def") // applied once, not echoed
        XCTAssertEqual(textView.selectedRange, NSRange(location: 7, length: 0))
    }
}
