import Foundation

/// Morrow's core/diff.ts: line by line differences between two texts, for comparing a page with an earlier version.
nonisolated enum Diff {
    struct Line: Equatable, Sendable {
        enum Kind: String, Sendable { case same, added, removed }
        var kind: Kind
        var text: String

        var json: JSValue { ["kind": .string(kind.rawValue), "text": .string(text)] }
    }

    private static let maxCells = 4_000_000

    static func diffLines(_ before: String, _ after: String) -> [Line] {
        let a = JSText.split(before, on: 0x0A)
        let b = JSText.split(after, on: 0x0A)
        // common start and end are cut first, most edits touch a small part of a page
        var start = 0
        while start < a.count, start < b.count, a[start].jsEquals(b[start]) { start += 1 }
        var endA = a.count
        var endB = b.count
        while endA > start, endB > start, a[endA - 1].jsEquals(b[endB - 1]) {
            endA -= 1
            endB -= 1
        }
        let midA = Array(a[start..<endA])
        let midB = Array(b[start..<endB])
        let head = a[..<start].map { Line(kind: .same, text: $0) }
        let tail = a[endA...].map { Line(kind: .same, text: $0) }
        if midA.count * midB.count > maxCells {
            return head + midA.map { Line(kind: .removed, text: $0) } + midB.map { Line(kind: .added, text: $0) } + tail
        }
        // longest common subsequence over the changed middle
        let cols = midB.count + 1
        var table = [UInt32](repeating: 0, count: (midA.count + 1) * cols)
        for i in stride(from: midA.count - 1, through: 0, by: -1) {
            for j in stride(from: midB.count - 1, through: 0, by: -1) {
                table[i * cols + j] = midA[i].jsEquals(midB[j])
                    ? table[(i + 1) * cols + j + 1] + 1
                    : max(table[(i + 1) * cols + j], table[i * cols + j + 1])
            }
        }
        var middle: [Line] = []
        var i = 0
        var j = 0
        while i < midA.count, j < midB.count {
            if midA[i].jsEquals(midB[j]) {
                middle.append(Line(kind: .same, text: midA[i]))
                i += 1
                j += 1
            } else if table[(i + 1) * cols + j] >= table[i * cols + j + 1] {
                middle.append(Line(kind: .removed, text: midA[i]))
                i += 1
            } else {
                middle.append(Line(kind: .added, text: midB[j]))
                j += 1
            }
        }
        while i < midA.count {
            middle.append(Line(kind: .removed, text: midA[i]))
            i += 1
        }
        while j < midB.count {
            middle.append(Line(kind: .added, text: midB[j]))
            j += 1
        }
        return head + middle + tail
    }
}
