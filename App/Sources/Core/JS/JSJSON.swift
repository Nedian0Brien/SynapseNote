import Foundation

/// JavaScript's `JSON.parse` and `JSON.stringify(value, null, indent)`, with the same output to the byte, so
/// files the Swift core writes are the files Morrow writes.
nonisolated enum JSJSON {
    struct ParseError: Error, Equatable {
        let message: String
    }

    // MARK: stringify

    /// `JSON.stringify(value, null, indent)`; `indent` 0 writes everything on one line.
    static func stringify(_ value: JSValue, indent: Int = 0) -> String {
        var out = ""
        write(value, indent: String(repeating: " ", count: min(indent, 10)), level: "", into: &out)
        return out
    }

    private static func write(_ value: JSValue, indent: String, level: String, into out: inout String) {
        switch value {
        case .null: out += "null"
        case .bool(let flag): out += flag ? "true" : "false"
        case .number(let number): out += number.isFinite ? JSNumber.string(number) : "null"
        case .string(let text): quote(text, into: &out)
        case .array(let items):
            guard !items.isEmpty else { out += "[]"; return }
            let inner = level + indent
            out += "["
            for (index, item) in items.enumerated() {
                if index > 0 { out += "," }
                if !indent.isEmpty { out += "\n" + inner }
                write(item, indent: indent, level: inner, into: &out)
            }
            if !indent.isEmpty { out += "\n" + level }
            out += "]"
        case .object(let object):
            guard !object.isEmpty else { out += "{}"; return }
            let inner = level + indent
            out += "{"
            for (index, entry) in object.enumerated() {
                if index > 0 { out += "," }
                if !indent.isEmpty { out += "\n" + inner }
                quote(entry.key, into: &out)
                out += indent.isEmpty ? ":" : ": "
                write(entry.value, indent: indent, level: inner, into: &out)
            }
            if !indent.isEmpty { out += "\n" + level }
            out += "}"
        }
    }

    /// JSON's quoting as JavaScript does it: short escapes, other control characters and lone surrogates as
    /// lowercase `\u` escapes, everything else as it is.
    static func quote(_ text: String, into out: inout String) {
        let units = Array(text.utf16)
        var result: [UInt16] = [0x22]
        var index = 0
        func escape(_ unit: UInt16) {
            let hex = String(unit, radix: 16)
            result += Array("\\u\(String(repeating: "0", count: 4 - hex.count))\(hex)".utf16)
        }
        while index < units.count {
            let unit = units[index]
            switch unit {
            case 0x22: result += [0x5C, 0x22]
            case 0x5C: result += [0x5C, 0x5C]
            case 0x08: result += [0x5C, 0x62]
            case 0x0C: result += [0x5C, 0x66]
            case 0x0A: result += [0x5C, 0x6E]
            case 0x0D: result += [0x5C, 0x72]
            case 0x09: result += [0x5C, 0x74]
            case 0..<0x20: escape(unit)
            case 0xD800...0xDBFF:
                if index + 1 < units.count, (0xDC00...0xDFFF).contains(units[index + 1]) {
                    result += [unit, units[index + 1]]
                    index += 1
                } else { escape(unit) }
            case 0xDC00...0xDFFF: escape(unit)
            default: result.append(unit)
            }
            index += 1
        }
        result.append(0x22)
        out += String(decoding: result, as: UTF16.self)
    }

    static func quote(_ text: String) -> String {
        var out = ""
        quote(text, into: &out)
        return out
    }

    // MARK: parse

    /// `JSON.parse`: objects keep JavaScript's key order, a repeated key keeps its first place and its last value.
    static func parse(_ text: String) throws -> JSValue {
        var parser = Parser(units: Array(text.utf16))
        parser.skipSpace()
        let value = try parser.value(depth: 0)
        parser.skipSpace()
        guard parser.index == parser.units.count else { throw ParseError(message: "Unexpected text after JSON") }
        return value
    }

    private struct Parser {
        let units: [UInt16]
        var index = 0

        mutating func skipSpace() {
            while index < units.count, [0x20, 0x09, 0x0A, 0x0D].contains(units[index]) { index += 1 }
        }

        mutating func value(depth: Int) throws -> JSValue {
            guard depth < 2000, index < units.count else { throw ParseError(message: "Unexpected end of JSON input") }
            switch units[index] {
            case 0x7B: return try object(depth: depth)
            case 0x5B: return try array(depth: depth)
            case 0x22: return .string(try string())
            case 0x74: try literal("true"); return .bool(true)
            case 0x66: try literal("false"); return .bool(false)
            case 0x6E: try literal("null"); return .null
            default: return .number(try number())
            }
        }

        mutating func literal(_ word: String) throws {
            let expected = Array(word.utf16)
            guard index + expected.count <= units.count, Array(units[index..<index + expected.count]) == expected else {
                throw ParseError(message: "Unexpected token in JSON")
            }
            index += expected.count
        }

        mutating func object(depth: Int) throws -> JSValue {
            index += 1
            var object = JSObject()
            skipSpace()
            if index < units.count, units[index] == 0x7D { index += 1; return .object(object) }
            while true {
                skipSpace()
                guard index < units.count, units[index] == 0x22 else { throw ParseError(message: "Expected property name in JSON") }
                let key = try string()
                skipSpace()
                guard index < units.count, units[index] == 0x3A else { throw ParseError(message: "Expected ':' in JSON") }
                index += 1
                skipSpace()
                object[key] = try value(depth: depth + 1)
                skipSpace()
                guard index < units.count else { throw ParseError(message: "Unexpected end of JSON input") }
                if units[index] == 0x2C { index += 1; continue }
                if units[index] == 0x7D { index += 1; return .object(object) }
                throw ParseError(message: "Expected ',' or '}' in JSON")
            }
        }

        mutating func array(depth: Int) throws -> JSValue {
            index += 1
            var items: [JSValue] = []
            skipSpace()
            if index < units.count, units[index] == 0x5D { index += 1; return .array(items) }
            while true {
                skipSpace()
                items.append(try value(depth: depth + 1))
                skipSpace()
                guard index < units.count else { throw ParseError(message: "Unexpected end of JSON input") }
                if units[index] == 0x2C { index += 1; continue }
                if units[index] == 0x5D { index += 1; return .array(items) }
                throw ParseError(message: "Expected ',' or ']' in JSON")
            }
        }

        mutating func string() throws -> String {
            index += 1
            var out: [UInt16] = []
            while index < units.count {
                let unit = units[index]
                if unit == 0x22 { index += 1; return String(decoding: out, as: UTF16.self) }
                if unit < 0x20 { throw ParseError(message: "Bad control character in string literal in JSON") }
                if unit == 0x5C {
                    index += 1
                    guard index < units.count else { break }
                    switch units[index] {
                    case 0x22: out.append(0x22)
                    case 0x5C: out.append(0x5C)
                    case 0x2F: out.append(0x2F)
                    case 0x62: out.append(0x08)
                    case 0x66: out.append(0x0C)
                    case 0x6E: out.append(0x0A)
                    case 0x72: out.append(0x0D)
                    case 0x74: out.append(0x09)
                    case 0x75:
                        guard index + 4 < units.count,
                              let code = UInt16(String(decoding: units[index + 1...index + 4], as: UTF16.self), radix: 16)
                        else { throw ParseError(message: "Bad Unicode escape in JSON") }
                        out.append(code)
                        index += 4
                    default: throw ParseError(message: "Bad escaped character in JSON")
                    }
                    index += 1
                    continue
                }
                out.append(unit)
                index += 1
            }
            throw ParseError(message: "Unterminated string in JSON")
        }

        mutating func number() throws -> Double {
            let start = index
            if index < units.count, units[index] == 0x2D { index += 1 }
            func digits() -> Int {
                let from = index
                while index < units.count, (0x30...0x39).contains(units[index]) { index += 1 }
                return index - from
            }
            let whole = digits()
            guard whole > 0 else { throw ParseError(message: "Unexpected token in JSON") }
            if whole > 1, units[start + (units[start] == 0x2D ? 1 : 0)] == 0x30 { throw ParseError(message: "Unexpected number in JSON") }
            if index < units.count, units[index] == 0x2E {
                index += 1
                guard digits() > 0 else { throw ParseError(message: "Unterminated fractional number in JSON") }
            }
            if index < units.count, units[index] == 0x65 || units[index] == 0x45 {
                index += 1
                if index < units.count, units[index] == 0x2B || units[index] == 0x2D { index += 1 }
                guard digits() > 0 else { throw ParseError(message: "Exponent part is missing a number in JSON") }
            }
            return Double(String(decoding: units[start..<index], as: UTF16.self)) ?? .nan
        }
    }
}

/// JavaScript's `Number.prototype.toString()` for base 10: the shortest digits that read back as the same
/// number, written plainly between 1e-7 and 1e21 and in exponent form outside it.
nonisolated enum JSNumber {
    static func string(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value == 0 { return "0" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        if value < 0 { return "-" + string(-value) }
        // Swift's description also gives the shortest round-trip digits; only the layout differs
        let description = "\(value)"
        let parts = description.split(separator: "e", maxSplits: 1)
        var mantissa = String(parts[0])
        let exponent = parts.count > 1 ? Int(parts[1])! : 0
        var pointIndex = mantissa.firstIndex(of: ".").map { mantissa.distance(from: mantissa.startIndex, to: $0) } ?? mantissa.count
        mantissa.removeAll { $0 == "." }
        // digits without leading zeros, and the position of the point relative to them
        var digits = Array(mantissa)
        while digits.first == "0" { digits.removeFirst(); pointIndex -= 1 }
        while digits.last == "0" { digits.removeLast() }
        let k = digits.count
        let n = pointIndex + exponent
        let text = String(digits)
        if k <= n && n <= 21 { return text + String(repeating: "0", count: n - k) }
        if 0 < n && n <= 21 { return String(digits[0..<n]) + "." + String(digits[n...]) }
        if -6 < n && n <= 0 { return "0." + String(repeating: "0", count: -n) + text }
        let e = n - 1
        let sign = e < 0 ? "-" : "+"
        let head = k == 1 ? text : String(digits[0]) + "." + String(digits[1...])
        return "\(head)e\(sign)\(abs(e))"
    }

    /// JavaScript's `Number(text)` for the strings Morrow converts: decimal, empty or blank text is 0, anything
    /// else that is not a number is NaN.
    static func parse(_ text: String) -> Double {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return 0 }
        if trimmed == "Infinity" || trimmed == "+Infinity" { return .infinity }
        if trimmed == "-Infinity" { return -.infinity }
        let lower = trimmed.lowercased()
        for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] where lower.hasPrefix(prefix) {
            return UInt64(lower.dropFirst(2), radix: radix).map(Double.init) ?? .nan
        }
        let allowed = Set("0123456789+-.eE")
        guard trimmed.allSatisfy({ allowed.contains($0) }), let value = Double(trimmed) else { return .nan }
        return value
    }
}
