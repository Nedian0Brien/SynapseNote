import Foundation

/// yaml 2.9.1 `stringify(value, { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' })`, as
/// Morrow's joinFrontmatter writes frontmatter, ported from yaml/dist/stringify. Values are plain JSON values, so
/// the parts of yaml that deal with comments, anchors, tags and node styles never apply; with `lineWidth: 0` no
/// line is folded.
nonisolated enum YAMLStringify {
    private struct Context {
        var indent = ""
        var implicitKey = false
        var inFlow: Bool?
        var forceBlockIndent = false
        let indentStep = "  "
    }

    static func stringify(_ value: JSValue) -> String {
        stringify(value, Context()) + "\n"
    }

    /// A collection used as a map key, which yaml's toJS writes in flow style (stringifyKey).
    static func flowKey(_ value: JSValue) -> String {
        var context = Context()
        context.inFlow = true
        return stringify(value, context)
    }

    private static func stringify(_ value: JSValue, _ ctx: Context) -> String {
        switch value {
        case .null: return "null"
        case .bool(let flag): return flag ? "true" : "false"
        case .number(let number): return stringifyNumber(number)
        case .string(let text): return stringifyString(text, ctx)
        case .array(let items): return collection(items.map { .item($0) }, ctx, prefix: "- ", start: "[", end: "]", itemIndent: ctx.indent + "  ")
        case .object(let object): return collection(object.map { .pair($0.key, $0.value) }, ctx, prefix: "", start: "{", end: "}", itemIndent: ctx.indent)
        }
    }

    /// stringifyNumber of a number with no source format
    private static func stringifyNumber(_ number: Double) -> String {
        if !number.isFinite { return number.isNaN ? ".nan" : number < 0 ? "-.inf" : ".inf" }
        if number == 0, number.sign == .minus { return "-0" }
        return JSNumber.string(number)
    }

    // MARK: collections

    private enum Entry {
        case item(JSValue)
        case pair(String, JSValue)
    }

    private static func isCollection(_ value: JSValue) -> Bool {
        if case .array = value { return true }
        if case .object = value { return true }
        return false
    }

    private static func isEmptyCollection(_ value: JSValue) -> Bool {
        switch value {
        case .array(let items): items.isEmpty
        case .object(let object): object.isEmpty
        default: false
        }
    }

    private static func collection(_ entries: [Entry], _ ctx: Context, prefix: String, start: String, end: String, itemIndent: String) -> String {
        if ctx.inFlow == true { return flowCollection(entries, ctx, start: start, end: end, itemIndent: itemIndent) }
        // stringifyBlockCollection
        var itemCtx = ctx
        itemCtx.indent = itemIndent
        let lines = entries.map { prefix + stringify($0, itemCtx) }
        guard var str = lines.first else { return start + end }
        for line in lines.dropFirst() { str += line.isEmpty ? "\n" : "\n\(ctx.indent)\(line)" }
        return str
    }

    private static func flowCollection(_ entries: [Entry], _ ctx: Context, start: String, end: String, itemIndent: String) -> String {
        var itemCtx = ctx
        itemCtx.indent = itemIndent + ctx.indentStep
        itemCtx.inFlow = true
        var reqNewline = false
        var lines: [String] = []
        for (i, entry) in entries.enumerated() {
            var str = stringify(entry, itemCtx)
            reqNewline = reqNewline || str.utf16.contains(0x0A)
            if i < entries.count - 1 { str += "," }
            lines.append(str)
        }
        if lines.isEmpty { return start + end }
        if reqNewline {
            var str = start
            for line in lines { str += line.isEmpty ? "\n" : "\n\(ctx.indentStep)\(ctx.indent)\(line)" }
            return "\(str)\n\(ctx.indent)\(end)"
        }
        return "\(start) \(lines.joined(separator: " ")) \(end)"
    }

    private static func stringify(_ entry: Entry, _ ctx: Context) -> String {
        switch entry {
        case .item(let value): stringify(value, ctx)
        case .pair(let key, let value): stringifyPair(key, value, ctx)
        }
    }

    /// stringifyPair for a string key and a value that is not null-free of nodes: never all-null, no comments
    private static func stringifyPair(_ key: String, _ value: JSValue, _ outer: Context) -> String {
        var ctx = outer
        ctx.implicitKey = true
        ctx.indent = outer.indent + outer.indentStep
        var str = stringify(.string(key), ctx)
        var explicitKey = false
        if outer.inFlow != true, str.utf16.count > 1024 { explicitKey = true }
        str = explicitKey ? "? \(str)\n\(outer.indent):" : "\(str):"
        ctx.implicitKey = false
        let valueStr = stringify(value, ctx)
        var ws = " "
        if !explicitKey, isCollection(value) {
            let hasNewline = valueStr.utf16.contains(0x0A)
            let flow = ctx.inFlow ?? isEmptyCollection(value)
            if hasNewline || !flow { ws = "\n\(ctx.indent)" }
        } else if valueStr.isEmpty || valueStr.utf16.first == 0x0A {
            ws = ""
        }
        return str + ws + valueStr
    }

    // MARK: strings

    private static func containsDocumentMarker(_ text: String) -> Bool {
        // /^(%|---|\.\.\.)/m, where a line starts after \n, \r, U+2028 or U+2029
        text.utf16.split(omittingEmptySubsequences: false) { [0x0A, 0x0D, 0x2028, 0x2029].contains($0) }.contains { line in
            line.starts(with: "%".utf16) || line.starts(with: "---".utf16) || line.starts(with: "...".utf16)
        }
    }

    private static func stringifyString(_ value: String, _ ctx: Context) -> String {
        // force double quotes on control characters & unpaired surrogates
        let units = value.units
        var index = 0
        while index < units.count {
            let u = units[index]
            if u <= 0x08 || (0x0B...0x1F).contains(u) || (0x7F...0x9F).contains(u) { return doubleQuotedString(value, ctx) }
            if (0xD800...0xDBFF).contains(u), index + 1 < units.count, (0xDC00...0xDFFF).contains(units[index + 1]) {
                index += 2
                continue
            }
            if (0xD800...0xDFFF).contains(u) { return doubleQuotedString(value, ctx) }
            index += 1
        }
        return plainString(value, ctx)
    }

    private static let plainForbidden = JSRegex(#"^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$"#)

    private static func plainString(_ value: String, _ outer: Context) -> String {
        var ctx = outer
        let units = value.units
        let hasNewline = units.contains(0x0A)
        let inFlow = ctx.inFlow == true
        if (ctx.implicitKey && hasNewline) || (inFlow && units.contains { [0x5B, 0x5D, 0x7B, 0x7D, 0x2C].contains($0) }) {
            return quotedString(value, ctx)
        }
        if plainForbidden.test(units) {
            return ctx.implicitKey || inFlow || !hasNewline ? quotedString(value, ctx) : blockString(value, ctx)
        }
        if !ctx.implicitKey, !inFlow, hasNewline { return blockString(value, ctx) }
        if containsDocumentMarker(value) {
            if ctx.indent.isEmpty {
                ctx.forceBlockIndent = true
                return blockString(value, ctx)
            } else if ctx.implicitKey, ctx.indent == ctx.indentStep {
                return quotedString(value, ctx)
            }
        }
        let str = replaceNewlineRuns(value) { $0 + "\n" + ctx.indent }
        // a plain string that reads back as a number, a boolean or null is quoted
        if CoreSchema.readsAsNonString(str) { return quotedString(value, ctx) }
        return str
    }

    /// `text.replace(/\n+/g, run => ...)`
    private static func replaceNewlineRuns(_ text: String, _ replacement: (String) -> String) -> String {
        let units = text.units
        var out: [UInt16] = []
        var index = 0
        while index < units.count {
            if units[index] == 0x0A {
                var end = index
                while end < units.count, units[end] == 0x0A { end += 1 }
                out += replacement(JSText.string(units[index..<end])).units
                index = end
            } else {
                out.append(units[index])
                index += 1
            }
        }
        return JSText.string(out)
    }

    private static func quotedString(_ value: String, _ ctx: Context) -> String {
        let hasDouble = value.utf16.contains(0x22)
        let hasSingle = value.utf16.contains(0x27)
        if hasDouble, !hasSingle { return singleQuotedString(value, ctx) }
        return doubleQuotedString(value, ctx)
    }

    private static func singleQuotedString(_ value: String, _ ctx: Context) -> String {
        let units = value.units
        let spaceAroundNewline = units.indices.contains { i in
            units[i] == 0x0A && ((i > 0 && (units[i - 1] == 0x20 || units[i - 1] == 0x09))
                || (i + 1 < units.count && (units[i + 1] == 0x20 || units[i + 1] == 0x09)))
        }
        if (ctx.implicitKey && units.contains(0x0A)) || spaceAroundNewline { return doubleQuotedString(value, ctx) }
        let indent = ctx.indent.isEmpty ? (containsDocumentMarker(value) ? "  " : "") : ctx.indent
        let escaped = JSText.replacing(value, 0x27, with: "''")
        return "'" + replaceNewlineRuns(escaped) { $0 + "\n" + indent } + "'"
    }

    private static func doubleQuotedString(_ value: String, _ ctx: Context) -> String {
        let json = JSJSON.quote(value).units
        let implicitKey = ctx.implicitKey
        let minMultiLineLength = 40
        let indent = ctx.indent.isEmpty ? (containsDocumentMarker(value) ? "  " : "") : ctx.indent
        var str: [UInt16] = []
        var start = 0
        var i = 0
        func at(_ index: Int) -> Int { json.at(index) }
        while i < json.count {
            var ch = json[i]
            if ch == 0x20, at(i + 1) == 0x5C, at(i + 2) == 0x6E {
                // space before newline needs to be escaped to not be folded
                str += json[start..<i] + [0x5C, 0x20]
                i += 1
                start = i
                ch = 0x5C
            }
            if ch == 0x5C {
                switch at(i + 1) {
                case 0x75:
                    str += json[start..<i]
                    let code = JSText.string(json[(i + 2)..<min(i + 6, json.count)])
                    switch code {
                    case "0000": str += "\\0".units
                    case "0007": str += "\\a".units
                    case "000b": str += "\\v".units
                    case "001b": str += "\\e".units
                    case "0085": str += "\\N".units
                    case "00a0": str += "\\_".units
                    case "2028": str += "\\L".units
                    case "2029": str += "\\P".units
                    default:
                        if code.hasPrefix("00") { str += "\\x".units + code.dropFirst(2).utf16 } else { str += json[i..<min(i + 6, json.count)] }
                    }
                    i += 5
                    start = i + 1
                case 0x6E:
                    if implicitKey || at(i + 2) == 0x22 || json.count < minMultiLineLength {
                        i += 1
                    } else {
                        // folding will eat first newline
                        str += json[start..<i] + [0x0A, 0x0A]
                        while at(i + 2) == 0x5C, at(i + 3) == 0x6E, at(i + 4) != 0x22 {
                            str.append(0x0A)
                            i += 2
                        }
                        str += indent.units
                        // space after newline needs to be escaped to not be folded
                        if at(i + 2) == 0x20 { str.append(0x5C) }
                        i += 1
                        start = i + 1
                    }
                default:
                    i += 1
                }
            }
            i += 1
        }
        return start > 0 ? JSText.string(str + json[start...]) : JSText.string(json)
    }

    private static func blockString(_ input: String, _ ctx: Context) -> String {
        var value = input.units
        // a block can't end in whitespace unless the last line is non-empty
        if let lastNewline = value.lastIndex(of: 0x0A), lastNewline + 1 < value.count,
           value[(lastNewline + 1)...].allSatisfy({ $0 == 0x09 || $0 == 0x20 }) {
            return quotedString(input, ctx)
        }
        let indent = ctx.indent.isEmpty ? (ctx.forceBlockIndent || containsDocumentMarker(input) ? "  " : "") : ctx.indent
        let indentUnits = indent.units
        // lineWidth 0: never over the limit, so always literal
        if value.isEmpty { return "|\n" }
        // determine chomping from whitespace at value end
        var endStart = value.count
        while endStart > 0 {
            let ch = value[endStart - 1]
            if ch != 0x0A, ch != 0x09, ch != 0x20 { break }
            endStart -= 1
        }
        var end = Array(value[endStart...])
        let endNlPos = end.firstIndex(of: 0x0A)
        let chomp: String
        if endNlPos == nil {
            chomp = "-"
        } else if value == end || endNlPos != end.count - 1 {
            chomp = "+"
        } else {
            chomp = ""
        }
        if !end.isEmpty {
            value = Array(value.dropLast(end.count))
            if end.last == 0x0A { end.removeLast() }
            // /(^|(?<!\n))\n+(?!\n|$)/g: a run of newlines not at the end gets the indent after it
            var out: [UInt16] = []
            var index = 0
            while index < end.count {
                if end[index] == 0x0A {
                    var runEnd = index
                    while runEnd < end.count, end[runEnd] == 0x0A { runEnd += 1 }
                    out += end[index..<runEnd]
                    if runEnd < end.count { out += indentUnits }
                    index = runEnd
                } else {
                    out.append(end[index])
                    index += 1
                }
            }
            end = out
        }
        // determine indent indicator from whitespace at value start
        var startWithSpace = false
        var startEnd = 0
        var startNlPos = -1
        while startEnd < value.count {
            let ch = value[startEnd]
            if ch == 0x20 { startWithSpace = true } else if ch == 0x0A { startNlPos = startEnd } else { break }
            startEnd += 1
        }
        var start = Array(value[..<(startNlPos < startEnd ? startNlPos + 1 : startEnd)])
        if !start.isEmpty {
            value = Array(value[start.count...])
            start = replaceNewlineRuns(JSText.string(start)) { $0 + indent }.units
        }
        let indentSize = indent.isEmpty ? "1" : "2"
        let header = (startWithSpace ? indentSize : "") + chomp
        let body = replaceNewlineRuns(JSText.string(value)) { $0 + indent }
        return "|\(header)\n\(indent)\(JSText.string(start))\(body)\(JSText.string(end))"
    }
}
