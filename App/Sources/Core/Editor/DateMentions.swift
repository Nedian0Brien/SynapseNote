import Foundation

/// Morrow's date mentions (src/app/editor/Structure.ts): how a date reads in the text, and the dates the "@" menu
/// offers for what was typed.
nonisolated enum DateMentions {
    static let weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    /// describeDate: Today, Tomorrow or Yesterday, a weekday name for the next few days, otherwise the day and
    /// month, with the year when it is not this year
    static func describe(_ key: String, today: Date = Date(), calendar: Calendar = JSEnvironment.calendar, locale: Locale = .current) -> String {
        guard let date = Daily.parseDateKey(key) else { return key }
        let start = calendar.startOfDay(for: today)
        let days = Int((date.timeIntervalSince(start) / 86_400).rounded())
        if days == 0 { return "Today" }
        if days == 1 { return "Tomorrow" }
        if days == -1 { return "Yesterday" }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: today)
        var style = Date.FormatStyle(date: .omitted, time: .omitted, locale: locale, calendar: calendar).day().month(.abbreviated)
        if days > 1, days < 7 { style = style.weekday(.wide) }
        if !sameYear { style = style.year() }
        return date.formatted(style)
    }

    /// the long form a mention's menu row and tooltip use: weekday, day, month and year
    static func long(_ date: Date, locale: Locale = .current) -> String {
        date.formatted(Date.FormatStyle(locale: locale).weekday(.abbreviated).day().month(.abbreviated).year())
    }

    /// dateSuggestions: the named days that start with what was typed, a date written out in full, or a day of
    /// this year typed as "oct 25"; four with nothing typed, six at most
    static func suggestions(_ query: String, today: Date = Date(), calendar: Calendar = JSEnvironment.calendar) -> [Date] {
        let base = calendar.startOfDay(for: today)
        func at(_ days: Int) -> Date { calendar.date(byAdding: .day, value: days, to: base)! }
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var all: [(String, Date)] = [("today", at(0)), ("tomorrow", at(1)), ("yesterday", at(-1)), ("next week", at(7))]
        for offset in 1...7 {
            let date = at(offset)
            all.append((weekdays[calendar.component(.weekday, from: date) - 1], date))
        }
        if let exact = Daily.parseDateKey(text) { return [exact] }
        let typed = text.isEmpty ? nil : JSDate.parse("\(text) \(calendar.component(.year, from: today))").map { Date(timeIntervalSince1970: $0 / 1000) }
        var dates = all.filter { name, _ in
            text.isEmpty || name.hasPrefix(text) || name.split(separator: " ").contains { $0.hasPrefix(text) }
        }.map(\.1)
        if let typed, text.contains(where: \.isNumber) { dates.insert(typed, at: 0) }
        var seen = Set<String>()
        let unique = dates.filter { seen.insert(Daily.dateKey($0)).inserted }
        return Array(unique.prefix(text.isEmpty ? 4 : 6))
    }
}
