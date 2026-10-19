import Foundation

/// JavaScript's `Date.parse` for the text Morrow reads dates from (CSV cells): the ECMAScript date-time format,
/// where a date alone is UTC and a date with a time but no offset is local time, and the English forms engines
/// also accept, read in local time: "October 19, 2026", "Oct 19 2026", "19 October 2026", "10/19/2026",
/// "2026/10/19". As V8 (checked with node), a month name is read from its first three letters and a day past the
/// end of its month rolls over. Anything else gives nil, where an engine might still read something.
nonisolated enum JSDate {
    private static let iso = JSRegex(#"^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?)?$"#)
    private static let monthFirst = JSRegex(#"^([A-Za-z]+)\.? (\d{1,2}),? (\d{4})$"#)
    private static let dayFirst = JSRegex(#"^(\d{1,2}) ([A-Za-z]+)\.?,? (\d{4})$"#)
    private static let slashes = JSRegex(#"^(\d{1,2})\/(\d{1,2})\/(\d{4})$"#)
    private static let yearFirstSlashes = JSRegex(#"^(\d{4})\/(\d{1,2})\/(\d{1,2})$"#)
    private static let months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

    /// milliseconds since 1970, nil where JavaScript gives NaN
    static func parse(_ text: String) -> Double? {
        let units = JSText.trim(text.units)
        func number(_ match: JSRegex.Match, _ index: Int) -> Int? { match.group(index).flatMap { Int(JSText.string($0)) } }
        if let match = iso.exec(units) {
            let year = number(match, 1)!
            let month = number(match, 2) ?? 1
            let day = number(match, 3) ?? 1
            let hour = number(match, 4) ?? 0
            let minute = number(match, 5) ?? 0
            let second = number(match, 6) ?? 0
            let fraction = match.group(7).map { Double("0." + JSText.string($0))! * 1000 } ?? 0
            guard (1...12).contains(month), (1...31).contains(day), hour <= 24, minute < 60, second < 60,
                  hour < 24 || (minute == 0 && second == 0 && fraction == 0) else { return nil }
            let zone = match.group(8).map(JSText.string)
            let hasTime = match.group(4) != nil
            var calendar = Calendar(identifier: .gregorian)
            if let zone {
                if zone == "Z" {
                    calendar.timeZone = TimeZone(identifier: "UTC")!
                } else {
                    let sign = zone.hasPrefix("-") ? -1 : 1
                    let parts = zone.dropFirst().split(separator: ":").compactMap { Int($0) }
                    calendar.timeZone = TimeZone(secondsFromGMT: sign * (parts[0] * 3600 + parts[1] * 60))!
                }
            } else {
                calendar.timeZone = hasTime ? JSEnvironment.timeZone : TimeZone(identifier: "UTC")!
            }
            return time(calendar, year, month, day, hour, minute, second, fraction)
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = JSEnvironment.timeZone
        if let match = monthFirst.exec(units), let month = monthIndex(match.group(1)!), let day = number(match, 2), let year = number(match, 3) {
            return time(calendar, year, month, day)
        }
        if let match = dayFirst.exec(units), let month = monthIndex(match.group(2)!), let day = number(match, 1), let year = number(match, 3) {
            return time(calendar, year, month, day)
        }
        if let match = slashes.exec(units), let month = number(match, 1), let day = number(match, 2), let year = number(match, 3), (1...12).contains(month) {
            return time(calendar, year, month, day)
        }
        if let match = yearFirstSlashes.exec(units), let year = number(match, 1), let month = number(match, 2), let day = number(match, 3), (1...12).contains(month) {
            return time(calendar, year, month, day)
        }
        return nil
    }

    /// a month written as a word whose first three letters are those of an English month name
    private static func monthIndex(_ units: [UInt16]) -> Int? {
        let name = JSText.string(JSText.asciiLower(units))
        guard name.count >= 3 else { return nil }
        return months.firstIndex { $0.prefix(3) == name.prefix(3) }.map { $0 + 1 }
    }

    private static func time(_ calendar: Calendar, _ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0, _ second: Int = 0,
                             _ ms: Double = 0) -> Double? {
        guard (1...31).contains(day) else { return nil }
        let components = DateComponents(year: year, month: month, day: 1, hour: hour, minute: minute, second: second)
        guard let first = calendar.date(from: components), let date = calendar.date(byAdding: .day, value: day - 1, to: first) else { return nil }
        // a day past the end of its month rolls over in engines, as it does here
        return (date.timeIntervalSince1970 * 1000).rounded(.down) + ms.rounded(.down)
    }
}
