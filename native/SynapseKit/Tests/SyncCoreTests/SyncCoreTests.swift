import Foundation
import Testing
@testable import SyncCore

@Suite struct SyncCoreTests {
    @Test func deltasBecomeSequentialChanges() {
        let changes = sequentialChanges([.retain(len: 3), .delete(len: 2), .insert(text: "한글😀"), .retain(len: 1), .insert(text: "x")])
        #expect(changes == [
            SequentialChange(from: 3, to: 5, insert: ""),
            SequentialChange(from: 3, to: 3, insert: "한글😀"),
            SequentialChange(from: 8, to: 8, insert: "x"),
        ])
    }

    @Test func sequentialChangesRebuildTheText() {
        let a = SourceDoc()
        let b = SourceDoc()
        _ = try? a.localEdit(index: 0, deleteLen: 0, insert: "hello world\n")
        sync(a, b)
        let view = NSMutableString(string: b.text())
        _ = try? a.localEdits(changes: [TextChange(from: 0, to: 5, insert: "안녕"), TextChange(from: 3, to: 8, insert: "")])
        for delta in sync(a, b) {
            for c in sequentialChanges(delta) {
                view.replaceCharacters(in: NSRange(location: c.from, length: c.to - c.from), with: c.insert)
            }
        }
        #expect(view as String == b.text())
        #expect(b.text() == "안녕 \n")
    }

    @Test func awarenessMessageEncoding() throws {
        let message = HocuspocusFrame.awareness(clientID: 300, clock: 2, stateJSON: "{}")
        var reader = Lib0.Reader(message)
        #expect(try reader.readVarUint() == 1) // awareness tag
        let length = try reader.readVarUint()
        #expect(Int(length) == message.count - 2)
        #expect(try reader.readVarUint() == 1) // one client
        #expect(try reader.readVarUint() == 300)
        #expect(try reader.readVarUint() == 2)
        #expect(try reader.readVarString() == "{}")
        #expect(reader.isAtEnd)
    }

    /// Exchange SyncStep1/2 both ways; returns the deltas `b` saw.
    @discardableResult
    private func sync(_ a: SourceDoc, _ b: SourceDoc) -> [[TextDelta]] {
        var seen: [[TextDelta]] = []
        if let r = try? b.receive(message: a.syncStep1()) {
            seen += r.deltas
            for reply in r.replies { _ = try? a.receive(message: reply) }
        }
        if let r = try? a.receive(message: b.syncStep1()) {
            for reply in r.replies { seen += (try? b.receive(message: reply))?.deltas ?? [] }
        }
        return seen
    }
}
