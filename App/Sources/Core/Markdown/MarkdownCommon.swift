import Foundation

/// A markdown-it 15.0.2 token, with the fields Morrow's parse.ts reads.
nonisolated final class MDToken {
    enum Attr: Equatable {
        case string([UInt16])
        case number(Double)
    }

    var type: String
    var tag: String
    var nesting: Int
    var attrs: [(name: String, value: Attr)] = []
    var level = 0
    var children: [MDToken]?
    var content: [UInt16] = []
    var markup: [UInt16] = []
    var info: [UInt16] = []
    var block = false
    var hidden = false
    /// `meta` of a `wikilink` token, set by Morrow's wikilink rule.
    var wiki: WikiLink?

    init(_ type: String, _ tag: String, _ nesting: Int) {
        self.type = type
        self.tag = tag
        self.nesting = nesting
    }

    func attrGet(_ name: String) -> Attr? {
        attrs.first { $0.name == name }?.value
    }

    var text: String { JSText.string(content) }
}

/// A `[[wiki link]]` as Morrow's parseWikiLink reads it.
nonisolated struct WikiLink: Equatable, Sendable {
    var target: String
    var anchor: String?
    var alias: String?
    var embed: Bool
}

/// markdown-it's src/common/utils.ts and src/helpers, on UTF-16 code units.
nonisolated enum MD {
    static func isSpace(_ code: Int) -> Bool { code == 0x09 || code == 0x20 }

    static func isWhiteSpace(_ code: Int) -> Bool {
        if code >= 0x2000 && code <= 0x200A { return true }
        switch code {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x202F, 0x205F, 0x3000: return true
        default: return false
        }
    }

    static func isMdAsciiPunct(_ code: Int) -> Bool {
        switch code {
        case 0x21...0x2F, 0x3A...0x40, 0x5B...0x60, 0x7B...0x7E: true
        default: false
        }
    }

    static func isPunctCharCode(_ code: Int) -> Bool {
        code >= 0 && MarkdownPunctuation.contains(UInt32(code))
    }

    static func isValidEntityCode(_ c: Int) -> Bool {
        if c >= 0xD800 && c <= 0xDFFF { return false }
        if c >= 0xFDD0 && c <= 0xFDEF { return false }
        if c & 0xFFFF == 0xFFFF || c & 0xFFFF == 0xFFFE { return false }
        if c >= 0 && c <= 8 { return false }
        if c == 0x0B { return false }
        if c >= 0x0E && c <= 0x1F { return false }
        if c >= 0x7F && c <= 0x9F { return false }
        if c > 0x10FFFF { return false }
        return true
    }

    static func fromCodePoint(_ code: Int) -> [UInt16] {
        if code > 0xFFFF {
            let c = code - 0x10000
            return [UInt16(truncatingIfNeeded: 0xD800 + (c >> 10)), UInt16(truncatingIfNeeded: 0xDC00 + (c & 0x3FF))]
        }
        return [UInt16(truncatingIfNeeded: code)]
    }

    private static func isAsciiAlnum(_ unit: UInt16) -> Bool {
        (0x30...0x39).contains(unit) || (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit)
    }

    private static func isHexDigit(_ unit: UInt16) -> Bool {
        (0x30...0x39).contains(unit) || (0x41...0x46).contains(unit) || (0x61...0x66).contains(unit)
    }

    /// `parseInt(text, radix)` of a run of digits, as a Double so large values behave as JavaScript's do.
    static func parseDigits(_ units: ArraySlice<UInt16>, radix: Int) -> Double {
        var value = 0.0
        for unit in units {
            let digit: Int = switch unit {
            case 0x30...0x39: Int(unit) - 0x30
            case 0x41...0x5A: Int(unit) - 0x41 + 10
            default: Int(unit) - 0x61 + 10
            }
            value = value * Double(radix) + Double(digit)
        }
        return value
    }

    static func entityCode(_ value: Double) -> Int { value > 0x7FFF_FFFF ? 0x7FFF_FFFF : Int(value) }

    /// entities' `decodeHTMLStrict` on a whole `&...;` (the only way markdown-it calls it): a named reference
    /// from the HTML table, or a numeric one, which entities replaces as the HTML standard says.
    static func decodeHTMLStrict(_ match: [UInt16]) -> [UInt16] {
        let inner = Array(match[1..<(match.count - 1)])
        if inner.first == 0x23 {
            let hex = inner.count > 1 && (inner[1] | 0x20) == 0x78
            let digits = inner[(hex ? 2 : 1)...]
            let valid = hex ? digits.allSatisfy(isHexDigit) : digits.allSatisfy { (0x30...0x39).contains($0) }
            guard !digits.isEmpty, valid else { return match }
            let value = parseDigits(digits, radix: hex ? 16 : 10)
            return fromCodePoint(replaceCodePoint(value))
        }
        if let value = HTMLEntities.table[JSKey(JSText.string(inner))] { return value }
        return match
    }

    /// entities' replaceCodePoint (decode-codepoint.js): invalid code points become U+FFFD, C1 controls the
    /// Windows-1252 characters.
    private static let c1: [Int] = [
        8364, 0, 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, 0, 381, 0,
        0, 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, 0, 382, 376,
    ]

    private static func replaceCodePoint(_ value: Double) -> Int {
        if value == 0 || (value >= 0xD800 && value <= 0xDFFF) || value > 0x10FFFF { return 0xFFFD }
        let code = Int(value)
        if code >= 128 && code <= 159 { return c1[code - 128] == 0 ? code : c1[code - 128] }
        return code
    }

    private static let escapable = Set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~".utf16)

    /// `unescapeAll`: backslash escapes of ASCII punctuation and `&entity;` references are decoded,
    /// by `/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|&([a-z#][a-z0-9]{1,31});/gi`.
    static func unescapeAll(_ str: [UInt16]) -> [UInt16] {
        guard str.contains(0x5C) || str.contains(0x26) else { return str }
        var out: [UInt16] = []
        var index = 0
        while index < str.count {
            let unit = str[index]
            if unit == 0x5C, index + 1 < str.count, escapable.contains(str[index + 1]) {
                out.append(str[index + 1])
                index += 2
                continue
            }
            if unit == 0x26, index + 1 < str.count {
                let first = str[index + 1]
                let lower = first | 0x20
                if first == 0x23 || ((0x61...0x7A).contains(lower) && (0x41...0x5A).contains(first & ~0x20)) {
                    var end = index + 2
                    while end < str.count, end - (index + 2) < 31, isAsciiAlnum(str[end]) { end += 1 }
                    if end - (index + 2) >= 1, end < str.count, str[end] == 0x3B {
                        let match = Array(str[index...end])
                        out += replaceEntityPattern(match, name: Array(str[(index + 1)..<end]))
                        index = end + 1
                        continue
                    }
                }
            }
            out.append(unit)
            index += 1
        }
        return out
    }

    /// `/^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i`
    private static func isDigitalEntity(_ name: [UInt16]) -> Bool {
        guard name.first == 0x23 else { return false }
        if name.count >= 3, (name[1] | 0x20) == 0x78 {
            let digits = name[2...]
            if digits.count <= 8, digits.allSatisfy(isHexDigit) { return true }
        }
        let digits = name[1...]
        return !digits.isEmpty && digits.count <= 8 && digits.allSatisfy { (0x30...0x39).contains($0) }
    }

    private static func replaceEntityPattern(_ match: [UInt16], name: [UInt16]) -> [UInt16] {
        if isDigitalEntity(name) {
            let hex = (name[1] | 0x20) == 0x78
            let code = entityCode(parseDigits(name[(hex ? 2 : 1)...], radix: hex ? 16 : 10))
            return isValidEntityCode(code) ? fromCodePoint(code) : match
        }
        return decodeHTMLStrict(match)
    }

    /// `normalizeReference`: trimmed, runs of whitespace as one space, then `.toLowerCase().toUpperCase()`.
    static func normalizeReference(_ str: [UInt16]) -> [UInt16] {
        var collapsed: [UInt16] = []
        var inSpace = false
        for unit in JSText.trim(str) {
            if JSText.isSpace(unit) {
                if !inSpace { collapsed.append(0x20) }
                inSpace = true
            } else {
                collapsed.append(unit)
                inSpace = false
            }
        }
        return JSText.uppercased(JSText.lowercased(collapsed))
    }

    static func asciiTrim(_ str: [UInt16]) -> [UInt16] {
        func trimmable(_ c: UInt16) -> Bool { c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D }
        var start = 0
        while start < str.count, trimmable(str[start]) { start += 1 }
        var end = str.count - 1
        while end >= start, trimmable(str[end]) { end -= 1 }
        return Array(str[start..<(end + 1)])
    }

    // MARK: helpers

    struct LinkResult {
        var ok = false
        var pos = 0
        var str: [UInt16] = []
    }

    struct TitleResult {
        var ok = false
        var canContinue = false
        var pos = 0
        var str: [UInt16] = []
        var marker = 0
    }

    static func parseLinkDestination(_ str: [UInt16], _ start: Int, _ max: Int) -> LinkResult {
        var pos = start
        var result = LinkResult()
        if str.at(pos) == 0x3C {
            pos += 1
            while pos < max {
                let code = str.at(pos)
                if code == 0x0A || code == 0x3C { return result }
                if code == 0x3E {
                    result.pos = pos + 1
                    result.str = unescapeAll(Array(str[(start + 1)..<pos]))
                    result.ok = true
                    return result
                }
                if code == 0x5C, pos + 1 < max {
                    pos += 2
                    continue
                }
                pos += 1
            }
            return result
        }
        var level = 0
        while pos < max {
            let code = str.at(pos)
            if code == 0x20 { break }
            if code < 0x20 || code == 0x7F { break }
            if code == 0x5C, pos + 1 < max {
                if str.at(pos + 1) == 0x20 { pos += 1; continue }
                pos += 2
                continue
            }
            if code == 0x28 {
                level += 1
                if level > 32 { return result }
            }
            if code == 0x29 {
                if level == 0 { break }
                level -= 1
            }
            pos += 1
        }
        if start == pos { return result }
        if level != 0 { return result }
        result.str = unescapeAll(JSText.slice(str, start, pos))
        result.pos = pos
        result.ok = true
        return result
    }

    static func parseLinkTitle(_ str: [UInt16], _ start: Int, _ max: Int, _ previous: TitleResult? = nil) -> TitleResult {
        var start = start
        var pos = start
        var state = TitleResult()
        if let previous {
            state.str = previous.str
            state.marker = previous.marker
        } else {
            if pos >= max { return state }
            var marker = str.at(pos)
            if marker != 0x22, marker != 0x27, marker != 0x28 { return state }
            start += 1
            pos += 1
            if marker == 0x28 { marker = 0x29 }
            state.marker = marker
        }
        while pos < max {
            let code = str.at(pos)
            if code == state.marker {
                state.pos = pos + 1
                state.str += unescapeAll(JSText.slice(str, start, pos))
                state.ok = true
                return state
            } else if code == 0x28, state.marker == 0x29 {
                return state
            } else if code == 0x5C, pos + 1 < max {
                pos += 1
            }
            pos += 1
        }
        state.canContinue = true
        state.str += unescapeAll(JSText.slice(str, start, pos))
        return state
    }
}
