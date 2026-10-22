import CYaml
import Foundation

/// Frontmatter YAML read as Morrow reads it: `parse(text, { maxAliasCount: 100, uniqueKeys: false })` of the
/// yaml 2.9.1 package, which uses the YAML 1.2 core schema. The syntax is read by libyaml (through Yams' CYaml
/// module) and the values are resolved here by yaml's own rules (yaml/dist/schema/core and
/// compose/compose-scalar.js), so `yes` stays a string, `0o17` is a number and `2026-10-19` is text.
///
/// Known differences, all on YAML no frontmatter writer produces: error messages are libyaml's; `!!binary`,
/// `!!timestamp`, `!!set`, `!!omap` and `!!pairs` give their text or plain collections instead of JavaScript
/// byte arrays, dates, sets and maps; a `%YAML 1.1` directive does not switch to the 1.1 schema; an alias to a
/// collection is a copy (yaml writes such a value back with an anchor); `maxAliasCount` is not applied.
nonisolated enum YAML {
    struct Failure: Error, Equatable {
        let message: String
    }

    /// The value of a one-document stream, nil when the stream has no document or the document is empty.
    static func parse(_ text: String) throws(Failure) -> JSValue? {
        // libyaml reads YAML 1.1, where U+0085, U+2028 and U+2029 break lines, and it refuses control characters;
        // yaml reads both as ordinary characters. Each such unit is swapped for a private use character while
        // libyaml reads, and swapped back in the values
        let units = text.units
        let swap = units.contains(where: Self.needsSwap) && !text.unicodeScalars.contains { (0xF0000...0xFFFFF).contains($0.value) }
        let source = swap ? String(String.UnicodeScalarView(text.unicodeScalars.map { scalar in
            scalar.value <= 0xFFFF && needsSwap(UInt16(scalar.value)) ? Unicode.Scalar(0xF0000 + scalar.value)! : scalar
        })) : text
        var composer = Composer(swapBack: swap)
        return try composer.run(Array(source.utf8))
    }

    /// What libyaml would read differently from yaml: control characters other than tab and line breaks,
    /// DEL, the C1 range with NEL, the Unicode line and paragraph separators, and U+FFFE/U+FFFF.
    private static func needsSwap(_ unit: UInt16) -> Bool {
        unit <= 0x08 || unit == 0x0B || unit == 0x0C || (0x0E...0x1F).contains(unit) || (0x7F...0x9F).contains(unit)
            || unit == 0x2028 || unit == 0x2029 || unit == 0xFFFE || unit == 0xFFFF
    }

    private struct Composer {
        let swapBack: Bool
        var anchors: [String: JSValue] = [:]
        var parser = yaml_parser_t()

        init(swapBack: Bool) { self.swapBack = swapBack }

        mutating func run(_ bytes: [UInt8]) throws(Failure) -> JSValue? {
            yaml_parser_initialize(&parser)
            defer { yaml_parser_delete(&parser) }
            return try bytes.withUnsafeBufferPointer { (buffer: UnsafeBufferPointer<UInt8>) throws(Failure) -> JSValue? in
                yaml_parser_set_input_string(&parser, buffer.baseAddress, buffer.count)
                var event = try next()
                guard event.type == YAML_STREAM_START_EVENT else { throw Failure(message: "Expected a stream") }
                yaml_event_delete(&event)
                event = try next()
                if event.type == YAML_STREAM_END_EVENT {
                    yaml_event_delete(&event)
                    return nil
                }
                guard event.type == YAML_DOCUMENT_START_EVENT else { throw Failure(message: "Expected a document") }
                yaml_event_delete(&event)
                let value = try node(try next())
                event = try next()
                yaml_event_delete(&event) // document end
                event = try next()
                defer { yaml_event_delete(&event) }
                if event.type != YAML_STREAM_END_EVENT {
                    throw Failure(message: "Source contains multiple documents; please use YAML.parseAllDocuments()")
                }
                return value
            }
        }

        private mutating func next() throws(Failure) -> yaml_event_t {
            var event = yaml_event_t()
            guard yaml_parser_parse(&parser, &event) == 1 else {
                let problem = parser.problem.map { String(cString: $0) } ?? "Invalid YAML"
                let mark = parser.problem_mark
                throw Failure(message: "\(problem) at line \(mark.line + 1), column \(mark.column + 1)")
            }
            return event
        }

        private func text(_ pointer: UnsafeMutablePointer<UInt8>?, length: Int) -> String {
            guard let pointer else { return "" }
            let string = String(decoding: UnsafeBufferPointer(start: pointer, count: length), as: UTF8.self)
            guard swapBack else { return string }
            return String(String.UnicodeScalarView(string.unicodeScalars.map { scalar in
                (0xF0000...0xFFFFF).contains(scalar.value) ? Unicode.Scalar(scalar.value - 0xF0000)! : scalar
            }))
        }

        private func cString(_ pointer: UnsafeMutablePointer<UInt8>?) -> String? {
            pointer.map { String(cString: $0) }
        }

        /// Takes ownership of `event`.
        private mutating func node(_ first: yaml_event_t) throws(Failure) -> JSValue {
            var event = first
            defer { yaml_event_delete(&event) }
            switch event.type {
            case YAML_ALIAS_EVENT:
                let name = cString(event.data.alias.anchor) ?? ""
                guard let value = anchors[name] else { throw Failure(message: "Aliased anchor not found: \(name)") }
                return value
            case YAML_SCALAR_EVENT:
                let scalar = event.data.scalar
                let value = Self.resolve(
                    text(scalar.value, length: scalar.length),
                    tag: cString(scalar.tag),
                    plain: scalar.style == YAML_PLAIN_SCALAR_STYLE,
                )
                if let anchor = cString(scalar.anchor) { anchors[anchor] = value }
                return value
            case YAML_SEQUENCE_START_EVENT:
                let anchor = cString(event.data.sequence_start.anchor)
                var items: [JSValue] = []
                while true {
                    var item = try next()
                    if item.type == YAML_SEQUENCE_END_EVENT {
                        yaml_event_delete(&item)
                        break
                    }
                    items.append(try node(item))
                }
                let value = JSValue.array(items)
                if let anchor { anchors[anchor] = value }
                return value
            case YAML_MAPPING_START_EVENT:
                let anchor = cString(event.data.mapping_start.anchor)
                var object = JSObject()
                while true {
                    var keyEvent = try next()
                    if keyEvent.type == YAML_MAPPING_END_EVENT {
                        yaml_event_delete(&keyEvent)
                        break
                    }
                    let key = try node(keyEvent)
                    let value = try node(try next())
                    // a repeated key keeps its first place and takes the last value, as on a JavaScript object
                    object[Self.stringKey(key)] = value
                }
                let value = JSValue.object(object)
                if let anchor { anchors[anchor] = value }
                return value
            default:
                throw Failure(message: "Unexpected YAML event")
            }
        }

        /// addPairToJSMap's stringifyKey: null is the empty key, other scalars as `String(value)`, collections
        /// in flow style.
        private static func stringKey(_ key: JSValue) -> String {
            switch key {
            case .null: ""
            case .string(let text): text
            case .bool(let flag): flag ? "true" : "false"
            case .number(let number): JSNumber.string(number)
            case .array, .object: YAMLStringify.flowKey(key)
            }
        }

        /// compose-scalar.js: a plain scalar without a tag goes through the core schema's tests in order, a tag
        /// picks the core tags of that name whose test the text passes, anything else is a string.
        static func resolve(_ text: String, tag: String?, plain: Bool) -> JSValue {
            guard let tag else { return plain ? CoreSchema.resolvePlain(text) : .string(text) }
            switch tag {
            case "!", "tag:yaml.org,2002:str": return .string(text)
            default: return CoreSchema.resolve(text, tagged: tag) ?? .string(text)
            }
        }
    }
}

/// The scalar tags of yaml 2.9.1's core schema (schema/core/{bool,int,float}.js, schema/common/null.js), in the
/// schema's order, used to read plain scalars and to decide which strings must be quoted when written.
nonisolated enum CoreSchema {
    struct Tag: Sendable {
        let name: String
        let test: @Sendable (String) -> Bool
        let resolve: @Sendable (String) -> JSValue
    }

    private static func all(_ units: String.UTF16View.SubSequence, _ check: (UInt16) -> Bool) -> Bool {
        !units.isEmpty && units.allSatisfy(check)
    }

    private static func digit(_ u: UInt16) -> Bool { (0x30...0x39).contains(u) }
    private static func octal(_ u: UInt16) -> Bool { (0x30...0x37).contains(u) }
    private static func hex(_ u: UInt16) -> Bool { digit(u) || (0x41...0x46).contains(u) || (0x61...0x66).contains(u) }

    private static func dropSign(_ units: String.UTF16View.SubSequence) -> String.UTF16View.SubSequence {
        units.first == 0x2B || units.first == 0x2D ? units.dropFirst() : units
    }

    /// `[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)` (`exponent` false) or `[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)` (true)
    private static func isDecimal(_ units: String.UTF16View.SubSequence, pointRequired: Bool) -> Bool {
        let body = dropSign(units)
        guard let dot = body.firstIndex(of: 0x2E) else { return !pointRequired && all(body, digit) }
        let whole = body[..<dot]
        let fraction = body[body.index(after: dot)...]
        if whole.isEmpty { return all(fraction, digit) }
        return all(whole, digit) && fraction.allSatisfy(digit)
    }

    /// parseInt(str, radix) of digits that fit, which converts exactly; longer ones are rounded once per digit.
    private static func integer(_ digits: Substring, radix: Int) -> Double {
        if let value = UInt64(digits, radix: radix) { return Double(value) }
        return MD.parseDigits(ArraySlice(digits.utf16), radix: radix)
    }

    static let tags: [Tag] = [
        Tag(name: "tag:yaml.org,2002:null", test: { ["", "~", "null", "Null", "NULL"].contains($0) }, resolve: { _ in .null }),
        Tag(name: "tag:yaml.org,2002:bool", test: { ["true", "True", "TRUE", "false", "False", "FALSE"].contains($0) },
            resolve: { .bool($0.hasPrefix("t") || $0.hasPrefix("T")) }),
        Tag(name: "tag:yaml.org,2002:int", test: { text in
            let units = text.utf16[...]
            return units.starts(with: "0o".utf16) && all(units.dropFirst(2), octal)
        }, resolve: { .number(integer($0.dropFirst(2), radix: 8)) }),
        Tag(name: "tag:yaml.org,2002:int", test: { all(dropSign($0.utf16[...]), digit) },
            resolve: { .number(Double($0) ?? integer(Substring(String(String.UnicodeScalarView($0.unicodeScalars.drop { $0 == "+" }))), radix: 10)) }),
        Tag(name: "tag:yaml.org,2002:int", test: { text in
            let units = text.utf16[...]
            return units.starts(with: "0x".utf16) && all(units.dropFirst(2), hex)
        }, resolve: { .number(integer($0.dropFirst(2), radix: 16)) }),
        Tag(name: "tag:yaml.org,2002:float", test: {
            ["-.inf", "+.inf", ".inf", "-.Inf", "+.Inf", ".Inf", "-.INF", "+.INF", ".INF", ".nan", ".NaN", ".NAN"].contains($0)
        }, resolve: { text in
            text.lowercased().hasSuffix("nan") ? .number(.nan) : .number(text.hasPrefix("-") ? -.infinity : .infinity)
        }),
        Tag(name: "tag:yaml.org,2002:float", test: { text in
            let units = text.utf16[...]
            guard let e = units.firstIndex(where: { $0 == 0x65 || $0 == 0x45 }) else { return false }
            return isDecimal(units[..<e], pointRequired: false) && all(dropSign(units[units.index(after: e)...]), digit)
        }, resolve: { .number(Double($0) ?? .nan) }),
        Tag(name: "tag:yaml.org,2002:float", test: { isDecimal($0.utf16[...], pointRequired: true) },
            resolve: { .number(Double($0) ?? .nan) }),
    ]

    /// findScalarTagByTest: the first core tag whose test the text passes, else a string.
    static func resolvePlain(_ text: String) -> JSValue {
        tags.first { $0.test(text) }?.resolve(text) ?? .string(text)
    }

    /// findScalarTagByName: the core tags with this name whose test passes, nil when none does.
    static func resolve(_ text: String, tagged name: String) -> JSValue? {
        tags.first { $0.name == name && $0.test(text) }?.resolve(text)
    }

    /// Whether a string written plain would be read back as something else, by the tests above.
    static func readsAsNonString(_ text: String) -> Bool {
        tags.contains { $0.test(text) }
    }
}
