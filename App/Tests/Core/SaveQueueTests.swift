import Foundation
import Testing
@testable import SynapseNote

/// Morrow's storage/saveQueue.ts on a clock that moves only when told, Fixtures/core/expected/save-queue.json:
/// the same script gives the same statuses, timers and writes at the same times.
struct SaveQueueTests {
    /// one timer at a time, fired by `advance`
    final class VirtualTimer: SaveTimer {
        var now = 0.0
        private var pending: (at: Double, fire: () -> Void)?
        var onSchedule: (Double) -> Void = { _ in }

        func schedule(after delay: Double, _ fire: @escaping () -> Void) {
            pending = (now + delay, fire)
            onSchedule(delay)
        }

        func cancel() { pending = nil }

        func advance(_ ms: Double) {
            let end = now + ms
            while let due = pending, due.at <= end {
                pending = nil
                now = due.at
                due.fire()
            }
            now = end
        }
    }

    @Test func runsAsMorrowsQueue() throws {
        let fixture = try CoreFixtures.load("save-queue")
        let script = try #require(fixture["script"]?.array)
        let expected = try #require(fixture["events"]?.array)
        let timer = VirtualTimer()
        var events: [JSValue] = []
        var failures = 0
        var state = WorkspaceState()
        for id in ["a", "b", "c"] {
            state.pages[id] = PageMeta(json: ["id": .string(id)])!
            state.docs[id] = .node("doc")
        }
        timer.onSchedule = { events.append(["t": .number(timer.now), "schedule": .number($0)]) }
        let queue = SaveQueue(
            write: { batch in
                events.append(["t": .number(timer.now), "write": [
                    "pages": .array(batch.pages.map { .string($0.id) }),
                    "docs": .array(batch.docs.map { .string($0.id) }),
                    "removed": .array(batch.removed.map(JSValue.string)),
                ]])
                if failures > 0 {
                    failures -= 1
                    throw VaultWriteError(message: "The disk is full.")
                }
            },
            getState: { state },
            timer: timer,
            options: .init(now: { timer.now }),
        )
        queue.onStatus = {
            let status = queue.status
            events.append(["t": .number(timer.now), "status": [
                "state": .string(status.state.rawValue),
                "lastSavedAt": status.lastSavedAt.map(JSValue.number) ?? .null,
                "error": status.error.map(JSValue.string) ?? .null,
                "failures": .number(Double(status.failures)),
            ]])
        }
        for step in script {
            events.append(["t": .number(timer.now), "step": step])
            if let enqueue = step["enqueue"] {
                var changes = Changes()
                for id in enqueue["pages"]?.array ?? [] { changes.pages.insert(id.string!) }
                for id in enqueue["docs"]?.array ?? [] { changes.docs.insert(id.string!) }
                for id in enqueue["removed"]?.array ?? [] { changes.removed.insert(id.string!) }
                queue.enqueue(changes)
            }
            if let ms = step["advance"]?.number { timer.advance(ms) }
            if let count = step["fail"]?.number { failures = Int(count) }
            if let id = step["remove"]?.string {
                state.pages[id] = nil
                state.docs[id] = nil
            }
            if step["flush"] == .bool(true) { events.append(["t": .number(timer.now), "flushed": .bool(queue.flush())]) }
        }
        for (index, event) in expected.enumerated() {
            let actual = index < events.count ? events[index] : .null
            #expect(actual == event, "event \(index): \(CoreFixtures.describe(actual)) vs \(CoreFixtures.describe(event))")
            if actual != event { break }
        }
        #expect(events.count == expected.count)
    }
}
