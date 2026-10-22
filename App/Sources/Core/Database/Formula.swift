import Foundation

/// Morrow's core/formula.ts: formula properties, a small expression language in the style of Notion's, read and
/// run without eval. A value is a number, text, true/false or null (`JSValue` without arrays and objects).
///
///     prop("Price") * prop("Count")
///     if(prop("Done"), "✅", "⏳")
///     dateBetween(prop("Due"), today(), "days")
nonisolated enum Formula {
    struct Failure: Error, Equatable {
        let message: String
    }

    private enum Token {
        case number(Double)
        case string([UInt16])
        case name(String)
        case op(String)

        var text: String {
            switch self {
            case .number(let value): JSNumber.string(value)
            case .string(let units): JSText.string(units)
            case .name(let name), .op(let name): name
            }
        }
    }

    indirect enum Expr: Sendable {
        case literal(JSValue)
        case call(name: String, args: [Expr])
        case unary(op: String, arg: Expr)
        case binary(op: String, left: Expr, right: Expr)
    }

    private static let maxLength = 2000
    private static let maxDepth = 64
    private static let operators = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "!", "(", ")", ","]
    private static let numberPattern = JSRegex(#"^\d*\.?\d+(e[+-]?\d+)?"#, ignoreCase: true)

    private static func isDigitOrPoint(_ unit: UInt16) -> Bool { (0x30...0x39).contains(unit) || unit == 0x2E }
    private static func isNameStart(_ unit: UInt16) -> Bool { (0x41...0x5A).contains(unit) || (0x61...0x7A).contains(unit) || unit == 0x5F }
    private static func isNamePart(_ unit: UInt16) -> Bool { isNameStart(unit) || (0x30...0x39).contains(unit) }

    /// the character at `index` as JavaScript's `source[i]` shows it in a message
    private static func char(_ units: [UInt16], _ index: Int) -> String { JSText.string([units[index]]) }

    private static func tokenize(_ units: [UInt16]) throws(Failure) -> [Token] {
        var tokens: [Token] = []
        var i = 0
        while i < units.count {
            let unit = units[i]
            if JSText.isSpace(unit) {
                i += 1
                continue
            }
            if isDigitOrPoint(unit) {
                guard let match = numberPattern.exec(Array(units[i...])) else { throw Failure(message: "Unexpected “\(char(units, i))”") }
                let text = JSText.string(units[i..<(i + match.range.count)])
                tokens.append(.number(JSNumber.parse(text)))
                i += match.range.count
                continue
            }
            if unit == 0x22 || unit == 0x27 {
                var value: [UInt16] = []
                var j = i + 1
                while j < units.count, units[j] != unit {
                    if units[j] == 0x5C, j + 1 < units.count { j += 1 }
                    value.append(units[j])
                    j += 1
                }
                if j >= units.count { throw Failure(message: "A piece of text is missing its closing quote") }
                tokens.append(.string(value))
                i = j + 1
                continue
            }
            if isNameStart(unit) {
                var j = i + 1
                while j < units.count, isNamePart(units[j]) { j += 1 }
                tokens.append(.name(JSText.string(units[i..<j])))
                i = j
                continue
            }
            guard let op = operators.first(where: { JSText.startsWith(units, $0.units, at: i) }) else {
                throw Failure(message: "Unexpected “\(char(units, i))”")
            }
            tokens.append(.op(op))
            i += op.utf16.count
        }
        return tokens
    }

    /// precedence climbing, lowest first
    private static let levels: [[String]] = [["||", "or"], ["&&", "and"], ["==", "!="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"], ["^"]]

    static func parse(_ source: String) throws(Failure) -> Expr {
        let units = source.units
        if units.count > maxLength { throw Failure(message: "This formula is too long") }
        let tokens = try tokenize(units)
        var pos = 0
        func isOp(_ value: String) -> Bool {
            guard pos < tokens.count else { return false }
            switch tokens[pos] {
            case .op(let op): return op == value
            case .name(let name): return name == value
            default: return false
            }
        }
        func expect(_ value: String) throws(Failure) {
            if !isOp(value) { throw Failure(message: "Expected “\(value)”") }
            pos += 1
        }
        func level(_ index: Int, _ depth: Int) throws(Failure) -> Expr {
            if depth > maxDepth { throw Failure(message: "This formula is nested too deeply") }
            if index == levels.count { return try unary(depth) }
            var left = try level(index + 1, depth + 1)
            while true {
                guard let op = levels[index].first(where: isOp) else { return left }
                pos += 1
                let right = index == levels.count - 1 ? try level(index, depth + 1) : try level(index + 1, depth + 1)
                left = .binary(op: op == "or" ? "||" : op == "and" ? "&&" : op, left: left, right: right)
            }
        }
        func unary(_ depth: Int) throws(Failure) -> Expr {
            if isOp("-") || isOp("!") || isOp("not") {
                let op = tokens[pos].text == "not" ? "!" : tokens[pos].text
                pos += 1
                return .unary(op: op, arg: try unary(depth + 1))
            }
            return try primary(depth)
        }
        func primary(_ depth: Int) throws(Failure) -> Expr {
            guard pos < tokens.count else { throw Failure(message: "The formula ends too early") }
            let token = tokens[pos]
            pos += 1
            switch token {
            case .number(let value): return .literal(.number(value))
            case .string(let units): return .literal(.string(JSText.string(units)))
            case .op("("):
                let inner = try level(0, depth + 1)
                try expect(")")
                return inner
            case .name(let name):
                if name == "true" || name == "false" { return .literal(.bool(name == "true")) }
                if !isOp("(") { throw Failure(message: "“\(name)” needs brackets, like \(name)()") }
                pos += 1
                var args: [Expr] = []
                if !isOp(")") {
                    repeat {
                        args.append(try level(0, depth + 1))
                        guard isOp(",") else { break }
                        pos += 1
                    } while true
                }
                try expect(")")
                return .call(name: JSText.string(JSText.lowercased(name.units)), args: args)
            default:
                throw Failure(message: "Unexpected “\(token.text)”")
            }
        }
        let expr = try level(0, 0)
        if pos < tokens.count { throw Failure(message: "Unexpected “\(tokens[pos].text)”") }
        return expr
    }

    // MARK: values

    static func toNumber(_ value: JSValue) -> Double {
        switch value {
        case .number(let number): return number
        case .bool(let flag): return flag ? 1 : 0
        case .string(let text):
            if JSText.trim(text).isEmpty { return .nan }
            let number = JSNumber.parse(text)
            return number.isFinite ? number : .nan
        default: return .nan
        }
    }

    /// `Math.round`: halves go up, toward positive infinity
    static func mathRound(_ value: Double) -> Double {
        if !value.isFinite { return value }
        let floor = value.rounded(.down)
        return value - floor >= 0.5 ? floor + 1 : floor
    }

    static func toText(_ value: JSValue) -> String {
        switch value {
        case .null: return ""
        case .number(let number): return JSNumber.string(mathRound(number * 1e10) / 1e10)
        case .string(let text): return text
        case .bool(let flag): return flag ? "true" : "false"
        default: return value.jsString
        }
    }

    static func truthy(_ value: JSValue) -> Bool {
        switch value {
        case .null: false
        case .bool(let flag): flag
        case .number(let number): number != 0
        case .string(let text): !text.isEmpty
        default: true
        }
    }

    // MARK: dates, in the local time zone as JavaScript's Date

    private static let day = 86_400_000.0
    private static let units: [String: Double] = ["days": day, "day": day, "weeks": 7 * day, "week": 7 * day, "hours": 3_600_000, "hour": 3_600_000]
    private static let datePrefix = JSRegex(#"^(\d{4})-(\d{2})-(\d{2})"#)

    /// milliseconds since 1970, NaN for JavaScript's Invalid Date
    private static func toDate(_ value: JSValue) -> Double? {
        if case .number(let number) = value { return timeClip(number) }
        guard case .string(let text) = value, let match = datePrefix.exec(text.units),
              let year = match.group(1), let month = match.group(2), let dayOfMonth = match.group(3) else { return nil }
        return localTime(year: Double(JSText.string(year))!, month: Double(JSText.string(month))! - 1, day: Double(JSText.string(dayOfMonth))!,
                         constructor: true)
    }

    /// `TimeClip`: whole milliseconds within ±8.64e15, otherwise NaN
    private static func timeClip(_ time: Double) -> Double {
        guard time.isFinite, abs(time) <= 8.64e15 else { return .nan }
        return time.rounded(.towardZero) + 0
    }

    private static var calendar: Calendar { JSEnvironment.calendar }

    /// a local date and time as JavaScript's MakeDay and MakeTime make it: months and days past their end roll
    /// over. `new Date(y, m, d)` also reads years 0 to 99 as 1900 to 1999 (`constructor`); setMonth and
    /// setFullYear do not
    private static func localTime(year: Double, month: Double, day: Double, hour: Double = 0, minute: Double = 0, second: Double = 0, ms: Double = 0,
                                  constructor: Bool = false) -> Double {
        let parts = [year, month, day, hour, minute, second, ms]
        guard parts.allSatisfy(\.isFinite) else { return .nan }
        var y = year.rounded(.towardZero)
        if constructor, (0...99).contains(y) { y += 1900 }
        let m = month.rounded(.towardZero)
        // the first of the month, then the days, so out-of-range days roll over as JavaScript's MakeDay
        let years = y + (m / 12).rounded(.down)
        let monthInYear = m - (m / 12).rounded(.down) * 12
        var components = DateComponents()
        components.year = Int(years)
        components.month = Int(monthInYear) + 1
        components.day = 1
        guard abs(years) < 300_000, let first = calendar.date(from: components) else { return .nan }
        let start = first.timeIntervalSince1970 * 1000
        let offsetDays = day.rounded(.towardZero) - 1
        guard let shifted = calendar.date(byAdding: .day, value: Int(offsetDays), to: Date(timeIntervalSince1970: start / 1000)) else { return .nan }
        let base = shifted.timeIntervalSince1970 * 1000
        return timeClip(base + hour.rounded(.towardZero) * 3_600_000 + minute.rounded(.towardZero) * 60_000 + second.rounded(.towardZero) * 1000 + ms.rounded(.towardZero))
    }

    private struct Parts {
        var year: Double
        var month: Double
        var day: Double
        var hour: Double
        var minute: Double
        var second: Double
        var ms: Double
    }

    private static func parts(_ time: Double) -> Parts? {
        guard time.isFinite else { return nil }
        let date = Date(timeIntervalSince1970: time / 1000)
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: date)
        let ms = time - (time / 1000).rounded(.down) * 1000
        return Parts(year: Double(c.year!), month: Double(c.month! - 1), day: Double(c.day!), hour: Double(c.hour!),
                     minute: Double(c.minute!), second: Double(c.second!), ms: ms)
    }

    private static func dateText(_ time: Double) -> String {
        guard let p = parts(time) else { return "NaN-NaN-NaN" }
        func pad(_ value: Double) -> String {
            let text = JSNumber.string(value)
            return text.count < 2 ? String(repeating: "0", count: 2 - text.count) + text : text
        }
        return "\(JSNumber.string(p.year))-\(pad(p.month + 1))-\(pad(p.day))"
    }

    // MARK: running

    private static let functionNames = ["if", "empty", "round", "floor", "ceil", "abs", "sqrt", "min", "max", "sum", "length", "concat", "join",
                                        "upper", "lower", "contains", "replace", "slice", "number", "text", "format", "now", "today",
                                        "dateadd", "datebetween", "year", "month", "day"]
    static let functionsList = ["prop"] + functionNames

    /// JavaScript's `**`
    private static func power(_ base: Double, _ exponent: Double) -> Double {
        if exponent.isNaN { return .nan }
        if abs(base) == 1, exponent.isInfinite { return .nan }
        return pow(base, exponent)
    }

    /// `String.prototype.slice` with numbers as JavaScript converts them
    private static func sliceText(_ text: String, _ start: Double, _ end: Double?) -> String {
        let units = text.units
        let count = Double(units.count)
        func position(_ value: Double) -> Int {
            let integer = value.isNaN ? 0 : value.rounded(.towardZero)
            if integer < 0 { return Int(max(0, count + integer)) }
            return Int(min(integer, count))
        }
        let from = position(start)
        let to = end.map(position) ?? units.count
        return from < to ? JSText.string(units[from..<to]) : ""
    }

    private static func callFunction(_ name: String, _ args: [JSValue], _ now: Double) -> JSValue {
        func arg(_ index: Int, _ fallback: JSValue = .null) -> JSValue { index < args.count ? args[index] : fallback }
        switch name {
        case "if": return truthy(arg(0)) ? arg(1) : arg(2)
        case "empty": return .bool(!truthy(arg(0)))
        case "round":
            // Math.max and Math.min give NaN when either side is NaN, Swift's max and min do not
            let places = toNumber(arg(1, .number(0)))
            let factor = power(10, places.isNaN ? .nan : max(0, min(10, places)))
            return .number(mathRound(toNumber(arg(0)) * factor) / factor)
        case "floor": return .number(toNumber(arg(0)).rounded(.down))
        case "ceil": return .number(toNumber(arg(0)).rounded(.up))
        case "abs": return .number(abs(toNumber(arg(0))))
        case "sqrt": return .number(toNumber(arg(0)).squareRoot())
        case "min", "max":
            let numbers = args.map(toNumber)
            if numbers.contains(where: \.isNaN) { return .number(.nan) }
            return .number(name == "min" ? numbers.min() ?? .infinity : numbers.max() ?? -.infinity)
        case "sum":
            return .number(args.reduce(0.0) { total, value in total + (toNumber(value).isNaN ? 0 : toNumber(value)) })
        case "length": return .number(Double(toText(arg(0)).utf16.count))
        case "concat": return .string(args.map(toText).joined())
        case "join":
            let separator = toText(arg(0, .string("")))
            return .string(args.dropFirst().map(toText).filter { !$0.isEmpty }.joined(separator: separator))
        case "upper": return .string(JSText.string(JSText.uppercased(toText(arg(0)).units)))
        case "lower": return .string(JSText.string(JSText.lowercased(toText(arg(0)).units)))
        case "contains":
            let text = JSText.lowercased(toText(arg(0)).units)
            return .bool(JSText.indexOf(text, JSText.lowercased(toText(arg(1)).units)) != -1)
        case "replace":
            let text = toText(arg(0)).units
            let from = toText(arg(1)).units
            let to = toText(arg(2))
            return .string(splitText(text, from).joined(separator: to))
        case "slice":
            let end = arg(2)
            return .string(sliceText(toText(arg(0)), toNumber(arg(1, .number(0))), end.isNull ? nil : toNumber(end)))
        case "number": return .number(toNumber(arg(0)))
        case "text", "format": return .string(toText(arg(0)))
        case "now": return .number(now)
        case "today": return .string(dateText(now))
        case "dateadd":
            guard let start = toDate(arg(0)) else { return .null }
            let step = JSText.string(JSText.lowercased(toText(arg(2, .string("days"))).units))
            let amount = toNumber(arg(1, .number(0)))
            let result: Double
            if step.hasPrefix("month") || step.hasPrefix("year") {
                guard let p = parts(start) else { return .string("NaN-NaN-NaN") }
                result = step.hasPrefix("month")
                    ? localTime(year: p.year, month: p.month + amount, day: p.day, hour: p.hour, minute: p.minute, second: p.second, ms: p.ms)
                    : localTime(year: p.year + amount, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second, ms: p.ms)
            } else {
                result = timeClip(start + amount * (units[step] ?? day))
            }
            return .string(dateText(result))
        case "datebetween":
            guard let first = toDate(arg(0)), let second = toDate(arg(1)) else { return .null }
            let unit = units[JSText.string(JSText.lowercased(toText(arg(2, .string("days"))).units))] ?? day
            return .number(((first - second) / unit).rounded(.towardZero))
        case "year", "month", "day":
            guard let time = toDate(arg(0)) else { return .null }
            guard let p = parts(time) else { return .number(.nan) }
            return .number(name == "year" ? p.year : name == "month" ? p.month + 1 : p.day)
        default:
            return .null
        }
    }

    /// `text.split(part)` as JavaScript splits on a string: an empty separator gives each unit
    private static func splitText(_ text: [UInt16], _ part: [UInt16]) -> [String] {
        if part.isEmpty { return text.map { JSText.string([$0]) } }
        var pieces: [String] = []
        var start = 0
        var index = JSText.indexOf(text, part)
        while index != -1 {
            pieces.append(JSText.string(text[start..<index]))
            start = index + part.count
            index = JSText.indexOf(text, part, from: start)
        }
        pieces.append(JSText.string(text[start...]))
        return pieces
    }

    /// `evaluateFormula`; `now` is milliseconds since 1970
    static func evaluate(_ expr: Expr, prop: (String) -> JSValue, now: Double) throws(Failure) -> JSValue {
        var steps = 0
        func run(_ node: Expr) throws(Failure) -> JSValue {
            steps += 1
            if steps > 10_000 { throw Failure(message: "This formula takes too long") }
            switch node {
            case .literal(let value):
                return value
            case .unary(let op, let arg):
                let value = try run(arg)
                return op == "!" ? .bool(!truthy(value)) : .number(-toNumber(value))
            case .binary(let op, let left, let right):
                if op == "&&" {
                    if !truthy(try run(left)) { return .bool(false) }
                    return .bool(truthy(try run(right)))
                }
                if op == "||" {
                    if truthy(try run(left)) { return .bool(true) }
                    return .bool(truthy(try run(right)))
                }
                let a = try run(left)
                let b = try run(right)
                switch op {
                case "+":
                    if case .string = a { return .string(toText(a) + toText(b)) }
                    if case .string = b { return .string(toText(a) + toText(b)) }
                    return .number(toNumber(a) + toNumber(b))
                case "-": return .number(toNumber(a) - toNumber(b))
                case "*": return .number(toNumber(a) * toNumber(b))
                case "/": return toNumber(b) == 0 ? .null : .number(toNumber(a) / toNumber(b))
                case "%": return .number(toNumber(a).truncatingRemainder(dividingBy: toNumber(b)))
                case "^": return .number(power(toNumber(a), toNumber(b)))
                case "==": return .bool(toText(a).jsEquals(toText(b)))
                case "!=": return .bool(!toText(a).jsEquals(toText(b)))
                default:
                    let order: Double
                    if case .number = a { order = toNumber(a) - toNumber(b) } else if case .number = b { order = toNumber(a) - toNumber(b) } else {
                        order = Double(JSCollator.compare(toText(a), toText(b), locale: JSEnvironment.locale))
                    }
                    switch op {
                    case "<": return .bool(order < 0)
                    case "<=": return .bool(order <= 0)
                    case ">": return .bool(order > 0)
                    default: return .bool(order >= 0)
                    }
                }
            case .call(let name, let args):
                if name == "prop" {
                    var key = ""
                    if let first = args.first { key = toText(try run(first)) }
                    return prop(key)
                }
                guard functionNames.contains(name) else { throw Failure(message: "There is no function called \(name)()") }
                // if only runs the branch it needs
                if name == "if" {
                    var test = JSValue.null
                    if let first = args.first { test = try run(first) }
                    let index = truthy(test) ? 1 : 2
                    return index < args.count ? try run(args[index]) : .null
                }
                var values: [JSValue] = []
                for arg in args { values.append(try run(arg)) }
                return callFunction(name, values, now)
            }
        }
        let result = try run(expr)
        if case .number(let number) = result, !number.isFinite { return .null }
        return result
    }

    /// `computeFormula`: a mistake in the formula becomes a message instead of a value
    static func compute(_ source: String, prop: (String) -> JSValue, now: Double) -> (value: JSValue, error: String?) {
        if JSText.trim(source).isEmpty { return (.null, nil) }
        do {
            return (try evaluate(try parse(source), prop: prop, now: now), nil)
        } catch {
            return (.null, error.message)
        }
    }
}
