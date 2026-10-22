import Foundation

/// JavaScript string operations on UTF-16 code units, the unit JavaScript strings index by.
nonisolated enum JSText {
    /// JavaScript's `\s` and what `String.prototype.trim` removes: WhiteSpace and LineTerminator of ECMA-262
    /// (§12.2, §12.3). ICU's `\s` differs: it has U+0085 and lacks U+FEFF.
    static func isSpace(_ unit: UInt16) -> Bool {
        switch unit {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    /// The body of a regular expression class that matches what JavaScript's `\s` matches.
    static let spaceClass = #"\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}"#

    static func trim(_ units: [UInt16]) -> [UInt16] { trimEnd(trimStart(units)) }

    static func trimStart(_ units: [UInt16]) -> [UInt16] {
        guard let first = units.firstIndex(where: { !isSpace($0) }) else { return [] }
        return Array(units[first...])
    }

    static func trimEnd(_ units: [UInt16]) -> [UInt16] {
        guard let last = units.lastIndex(where: { !isSpace($0) }) else { return [] }
        return Array(units[...last])
    }

    static func trim(_ text: String) -> String { string(trim(Array(text.utf16))) }
    static func trimStart(_ text: String) -> String { string(trimStart(Array(text.utf16))) }
    static func trimEnd(_ text: String) -> String { string(trimEnd(Array(text.utf16))) }

    static func string<S: Sequence>(_ units: S) -> String where S.Element == UInt16 {
        String(decoding: Array(units), as: UTF16.self)
    }

    /// `String.prototype.indexOf`.
    static func indexOf(_ units: [UInt16], _ needle: [UInt16], from start: Int = 0) -> Int {
        let from = max(0, start)
        guard !needle.isEmpty else { return min(from, units.count) }
        guard units.count >= needle.count, from <= units.count - needle.count else { return -1 }
        let first = needle[0]
        var index = from
        while index <= units.count - needle.count {
            if units[index] == first {
                var matched = true
                for offset in 1..<needle.count where units[index + offset] != needle[offset] {
                    matched = false
                    break
                }
                if matched { return index }
            }
            index += 1
        }
        return -1
    }

    static func indexOf(_ units: [UInt16], _ unit: UInt16, from start: Int = 0) -> Int {
        var index = max(0, start)
        while index < units.count {
            if units[index] == unit { return index }
            index += 1
        }
        return -1
    }

    static func lastIndexOf(_ units: [UInt16], _ unit: UInt16, from start: Int? = nil) -> Int {
        guard !units.isEmpty else { return -1 }
        var index = min(start ?? units.count - 1, units.count - 1)
        while index >= 0 {
            if units[index] == unit { return index }
            index -= 1
        }
        return -1
    }

    static func startsWith(_ units: [UInt16], _ prefix: [UInt16], at position: Int = 0) -> Bool {
        guard position >= 0, position + prefix.count <= units.count else { return false }
        for offset in 0..<prefix.count where units[position + offset] != prefix[offset] { return false }
        return true
    }

    static func endsWith(_ units: [UInt16], _ suffix: [UInt16]) -> Bool {
        startsWith(units, suffix, at: units.count - suffix.count)
    }

    /// `String.prototype.slice` with JavaScript's clamping of the bounds.
    static func slice(_ units: [UInt16], _ start: Int, _ end: Int? = nil) -> [UInt16] {
        let count = units.count
        func clamp(_ value: Int) -> Int { value < 0 ? max(0, count + value) : min(value, count) }
        let from = clamp(start)
        let to = clamp(end ?? count)
        return from < to ? Array(units[from..<to]) : []
    }

    /// `text.split(char)` on one code unit.
    static func split(_ text: String, on unit: UInt16) -> [String] {
        text.utf16.split(separator: unit, omittingEmptySubsequences: false).map { string($0) }
    }

    /// `text.replace(/[...]/g, '')` for a set of code units.
    static func removing(_ text: String, _ removed: Set<UInt16>) -> String {
        string(text.utf16.filter { !removed.contains($0) })
    }

    /// `text.replace(/c/g, replacement)` for one code unit.
    static func replacing(_ text: String, _ unit: UInt16, with replacement: String) -> String {
        let insert = replacement.units
        var out: [UInt16] = []
        for each in text.utf16 { if each == unit { out += insert } else { out.append(each) } }
        return string(out)
    }

    /// ASCII letters in lower case, every other unit as it is: what a pattern written in lower case with the
    /// `i` flag (and no `u` flag) matches against, for patterns whose letters are all ASCII.
    static func asciiLower(_ units: [UInt16]) -> [UInt16] {
        units.map { (0x41...0x5A).contains($0) ? $0 | 0x20 : $0 }
    }

    /// `String.prototype.toLowerCase` / `toUpperCase`: Unicode default case mapping, which Swift's also is.
    static func lowercased(_ units: [UInt16]) -> [UInt16] { Array(string(units).lowercased().utf16) }
    static func uppercased(_ units: [UInt16]) -> [UInt16] { Array(string(units).uppercased().utf16) }
}

extension Array where Element == UInt16 {
    /// The code unit at `index`, or -1 where JavaScript's `charCodeAt` gives NaN. Every caller compares it with
    /// `==` or `!=` to a code unit, or checks it is in range first, so -1 behaves as NaN does there.
    nonisolated func at(_ index: Int) -> Int { index >= 0 && index < count ? Int(self[index]) : -1 }
}

extension String {
    nonisolated var units: [UInt16] { Array(utf16) }
}

/// A JavaScript regular expression run with `NSRegularExpression` (ICU), written in JavaScript syntax and
/// translated where the two engines read the same text differently:
/// - `\s`, `\S`, `\d`, `\w`, `.` and `$` get JavaScript's meaning (ICU's `\s` and `\w` are Unicode-wide, its
///   `$` also matches before a final line break),
/// - a `[` inside a class is a literal, as in JavaScript (ICU reads it as a nested set),
/// - `i` without `u` is applied by lower-casing the ASCII letters of the subject, so the pattern must write its
///   letters in lower case (JavaScript's `i` without `u` never folds a non-ASCII letter onto an ASCII one).
/// Matches and groups are UTF-16 offsets, as in JavaScript.
nonisolated final class JSRegex: @unchecked Sendable {
    private let regex: NSRegularExpression
    private let ignoreCase: Bool

    init(_ pattern: String, ignoreCase: Bool = false) {
        self.ignoreCase = ignoreCase
        // swiftlint:disable:next force_try
        regex = try! NSRegularExpression(pattern: Self.translate(pattern))
    }

    struct Match {
        let range: Range<Int>
        let groups: [Range<Int>?]
        let subject: [UInt16]

        var text: [UInt16] { Array(subject[range]) }
        func group(_ index: Int) -> [UInt16]? { groups[index].map { Array(subject[$0]) } }
    }

    /// A text to match against, kept as the `NSString` ICU reads so long texts are not copied per match.
    final class Subject {
        let units: [UInt16]
        private(set) lazy var string = NSString(characters: units, length: units.count) as String
        private(set) lazy var lower: String = {
            let lower = JSText.asciiLower(units)
            return NSString(characters: lower, length: lower.count) as String
        }()

        init(_ units: [UInt16]) { self.units = units }
    }

    /// The first match at or after `start` (`RegExp.prototype.exec` with `lastIndex`), or one that starts exactly
    /// at `start` when `anchored` (a pattern that begins with `^`, run on `str.slice(start)`).
    func exec(_ units: [UInt16], from start: Int = 0, anchored: Bool = false) -> Match? {
        exec(Subject(units), from: start, anchored: anchored)
    }

    func exec(_ subject: Subject, from start: Int = 0, anchored: Bool = false) -> Match? {
        let units = subject.units
        guard start <= units.count,
              let result = regex.firstMatch(in: ignoreCase ? subject.lower : subject.string, options: anchored ? [.anchored] : [],
                                            range: NSRange(location: start, length: units.count - start))
        else { return nil }
        var groups: [Range<Int>?] = []
        for index in 0..<result.numberOfRanges {
            let range = result.range(at: index)
            groups.append(range.location == NSNotFound ? nil : range.location..<range.location + range.length)
        }
        return Match(range: groups[0]!, groups: groups, subject: units)
    }

    func test(_ units: [UInt16]) -> Bool { exec(units) != nil }
    func test(_ text: String) -> Bool { exec(text.units) != nil }

    /// Every match from the start, as `String.prototype.match` with the `g` flag lists them.
    func all(_ units: [UInt16]) -> [Match] {
        var matches: [Match] = []
        var start = 0
        while start <= units.count, let match = exec(units, from: start) {
            matches.append(match)
            start = match.range.isEmpty ? match.range.upperBound + 1 : match.range.upperBound
        }
        return matches
    }

    /// `String.prototype.replace` with the `g` flag and a replacement made from each match.
    func replaceAll(_ units: [UInt16], with replacement: (Match) -> [UInt16]) -> [UInt16] {
        var out: [UInt16] = []
        var last = 0
        for match in all(units) {
            out += units[last..<match.range.lowerBound]
            out += replacement(match)
            last = match.range.upperBound
        }
        out += units[last...]
        return out
    }

    static func translate(_ pattern: String) -> String {
        let chars = Array(pattern.unicodeScalars)
        var out = ""
        var inClass = false
        var index = 0
        let space = JSText.spaceClass
        while index < chars.count {
            let char = chars[index]
            if char == "\\", index + 1 < chars.count {
                let next = chars[index + 1]
                index += 2
                switch (next, inClass) {
                case ("s", false): out += "[\(space)]"
                case ("s", true): out += space
                case ("S", false): out += "[^\(space)]"
                case ("d", false): out += "[0-9]"
                case ("d", true): out += "0-9"
                case ("D", false): out += "[^0-9]"
                case ("w", false): out += "[A-Za-z0-9_]"
                case ("w", true): out += "A-Za-z0-9_"
                case ("W", false): out += "[^A-Za-z0-9_]"
                case ("S", true), ("D", true), ("W", true):
                    // only `[\s\S]` (any unit) is used, which ICU's own classes give exactly
                    out += "\\\(next)"
                    if next == "S", out.hasSuffix("\(space)\\S") {
                        out = String(out.dropLast(space.count + 2)) + "\\s\\S"
                    }
                default: out += "\\\(next)"
                }
                continue
            }
            if inClass {
                if char == "]" { inClass = false; out += "]" }
                else if char == "[" { out += "\\[" }
                else { out.unicodeScalars.append(char) }
            } else {
                switch char {
                case "[":
                    inClass = true
                    out += "["
                    // a leading ^ or ] belongs to the class syntax
                    if index + 1 < chars.count, chars[index + 1] == "^" { out += "^"; index += 1 }
                case ".": out += "[^\\n\\r\\x{2028}\\x{2029}]"
                case "$": out += "(?![\\s\\S])"
                default: out.unicodeScalars.append(char)
                }
            }
            index += 1
        }
        return out
    }
}
