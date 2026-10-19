import Foundation

/// Morrow's core/insights.ts: small facts about a workspace for the home page.
nonisolated enum Insights {
    struct Day: Equatable, Sendable {
        var key: String
        var count: Double
        var future: Bool

        var json: JSValue { ["key": .string(key), "count": .number(count), "future": .bool(future)] }
    }

    private static var calendar: Calendar { JSEnvironment.calendar }

    /// `new Date(y, m, d)` of the day `date` falls on, then moved by `days`
    private static func day(_ date: Date, plus days: Int = 0) -> Date {
        let start = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: days, to: start)!
    }

    private static func written(_ activity: JSObject, _ date: Date) -> Bool {
        activity[Daily.dateKey(date)]?.truthy ?? false
    }

    /// days in a row with something written, counting back from today, or from yesterday when today is still empty
    static func streak(_ activity: JSObject, _ today: Date) -> Int {
        var current = day(today)
        if !written(activity, current) { current = day(current, plus: -1) }
        var count = 0
        while written(activity, current) {
            count += 1
            current = day(current, plus: -1)
        }
        return count
    }

    /// columns of weeks, monday first, ending with the week that holds today
    static func activityWeeks(_ activity: JSObject, _ today: Date, weeks: Int = 26) -> [[Day]] {
        let end = day(today)
        let weekday = calendar.component(.weekday, from: end) - 1 // getDay(): Sunday is 0
        let start = day(end, plus: -((weekday + 6) % 7) - (weeks - 1) * 7)
        var columns: [[Day]] = []
        for week in 0..<weeks {
            var column: [Day] = []
            for weekday in 0..<7 {
                let date = day(start, plus: week * 7 + weekday)
                let key = Daily.dateKey(date)
                column.append(Day(key: key, count: activity[key]?.number ?? 0, future: date > end))
            }
            columns.append(column)
        }
        return columns
    }

    /// daily notes written on this date in earlier years, or a month ago when there are none
    static func onThisDay(_ state: WorkspaceState, _ today: Date) -> [PageMeta] {
        let key = Daily.dateKey(today)
        let daily = Tree.livePages(state.pages).filter { page in page.dailyDate.map { !$0.isEmpty && !$0.jsEquals(key) } ?? false }
        let sameDay = daily.filter { JSText.slice($0.dailyDate!.units, 5) == JSText.slice(key.units, 5) }
        if !sameDay.isEmpty {
            return sameDay.jsSorted { JSCollator.compare($1.dailyDate!, $0.dailyDate!, locale: JSEnvironment.locale) }
        }
        let parts = calendar.dateComponents([.year, .month, .day], from: today)
        var monthAgoParts = DateComponents()
        (monthAgoParts.year, monthAgoParts.month, monthAgoParts.day) = (parts.year, 1, 1)
        // new Date(y, m - 1, d) rolls over as JavaScript's does
        let firstOfYear = calendar.date(from: monthAgoParts)!
        let monthAgo = calendar.date(byAdding: .day, value: parts.day! - 1,
                                     to: calendar.date(byAdding: .month, value: parts.month! - 2, to: firstOfYear)!)!
        let wanted = Daily.dateKey(monthAgo)
        return daily.filter { $0.dailyDate!.jsEquals(wanted) }
    }

    private static func words(_ doc: DocNode?) -> Int {
        Search.splitOnSpace(Doc.docToPlainText(doc ?? .node("doc"))).filter { !$0.isEmpty }.count
    }

    /// an older page with something in it, the same one all day and a different one tomorrow
    static func rediscover(_ state: WorkspaceState, _ today: Date) -> PageMeta? {
        let month = 30.0 * 24 * 60 * 60 * 1000
        let now = today.timeIntervalSince1970 * 1000
        let candidates = Tree.livePages(state.pages)
            .filter { $0.kind == .page && ($0.dailyDate ?? "").isEmpty }
            .filter { now - max($0.lastOpenedAt ?? 0, $0.updatedAt) > month }
            .filter { words(state.docs[$0.id]) >= 15 }
            .jsSorted { JSCollator.compare($0.id, $1.id, locale: JSEnvironment.locale) }
        if candidates.isEmpty { return nil }
        var hash: UInt64 = 0
        for scalar in Daily.dateKey(today).unicodeScalars { hash = (hash &* 31 &+ UInt64(scalar.value)) & 0xFFFF_FFFF }
        return candidates[Int(hash % UInt64(candidates.count))]
    }

    static func totalWords(_ state: WorkspaceState) -> Int {
        Tree.livePages(state.pages).reduce(0) { total, page in
            total + (state.docs[page.id].map { words($0) } ?? 0)
        }
    }
}

/// Morrow's core/flashcards.ts: any line written as question :: answer, reviewed with spaced repetition.
nonisolated enum Flashcards {
    struct Card: Equatable, Sendable {
        var id: String
        var pageId: String
        var front: String
        var back: String

        var json: JSValue { ["id": .string(id), "pageId": .string(pageId), "front": .string(front), "back": .string(back)] }
    }

    static func hash(_ text: String) -> String {
        var a: UInt32 = 0x811C_9DC5
        var b: UInt32 = 0
        for unit in text.utf16 {
            a = (a ^ UInt32(unit)) &* 0x0100_0193
            b = b &* 31 &+ UInt32(unit)
        }
        return String(a, radix: 36) + String(b, radix: 36)
    }

    /// `/\s::\s/`: the first ` :: ` with any JavaScript whitespace around the colons
    private static func separator(_ units: [UInt16]) -> Range<Int>? {
        guard units.count >= 4 else { return nil }
        for index in 0...(units.count - 4)
        where JSText.isSpace(units[index]) && units[index + 1] == 0x3A && units[index + 2] == 0x3A && JSText.isSpace(units[index + 3]) {
            return index..<(index + 4)
        }
        return nil
    }

    static func cardsInDoc(_ pageId: String, _ doc: DocNode) -> [Card] {
        var cards: [Card] = []
        func visit(_ node: DocNode) {
            if node.type == "codeBlock" || node.type == "rawBlock" { return }
            if node.type == "paragraph" {
                let text = JSText.trim(Doc.inlineText(node).units)
                if let match = separator(text) {
                    let front = JSText.string(JSText.trim(Array(text[..<match.lowerBound])))
                    let back = JSText.string(JSText.trim(Array(text[match.upperBound...])))
                    // the card keeps its progress while its answer is reworded
                    if !front.isEmpty, !back.isEmpty { cards.append(Card(id: hash("\(pageId)\n\(front)"), pageId: pageId, front: front, back: back)) }
                }
                return
            }
            for child in node.content ?? [] { visit(child) }
        }
        visit(doc)
        return cards
    }

    static func collectCards(_ state: WorkspaceState) -> [Card] {
        var cards: [Card] = []
        var seen = JSSet()
        for page in Tree.livePages(state.pages) {
            guard let doc = state.docs[page.id], !page.encrypted else { continue }
            for card in cardsInDoc(page.id, doc) where seen.insert(card.id) { cards.append(card) }
        }
        return cards
    }

    /// A review log, `{ [cardId]: { due, interval, ease, reps, lapses } }`.
    static func isDue(_ card: Card, _ log: JSObject, _ today: Date) -> Bool {
        guard let entry = log[card.id], let due = entry["due"]?.string else { return log[card.id] == nil }
        return !Daily.dateKey(today).jsLess(due)
    }

    /// cards seen before come first, new ones after, so reviews never pile up behind new cards
    static func dueCards(_ cards: [Card], _ log: JSObject, _ today: Date) -> [Card] {
        cards.filter { isDue($0, log, today) }.jsSorted { a, b in
            let seen = (log[a.id] == nil ? 1 : 0) - (log[b.id] == nil ? 1 : 0)
            if seen != 0 { return seen }
            return JSCollator.compare(log[a.id]?["due"]?.string ?? "", log[b.id]?["due"]?.string ?? "", locale: JSEnvironment.locale)
        }
    }

    /// the sm-2 schedule anki made familiar: a forgotten card starts over, a remembered one waits longer each time
    static func schedule(_ previous: JSObject?, _ grade: String, _ today: Date) -> JSObject {
        var state = previous ?? JSObject([("due", .string(Daily.dateKey(today))), ("interval", 0), ("ease", 2.5), ("reps", 0), ("lapses", 0)])
        func number(_ key: String) -> Double { state[key]?.number ?? 0 }
        if grade == "again" {
            state["lapses"] = .number(number("lapses") + 1)
            state["reps"] = 0
            state["interval"] = 1
            state["ease"] = .number(max(1.3, number("ease") - 0.2))
        } else {
            let quality: Double = grade == "hard" ? 3 : grade == "good" ? 4 : 5
            state["ease"] = .number(max(1.3, number("ease") + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))))
            if number("reps") == 0 {
                state["interval"] = .number(grade == "easy" ? 4 : 1)
            } else if number("reps") == 1 {
                state["interval"] = .number(grade == "hard" ? 3 : grade == "easy" ? 8 : 6)
            } else {
                let next = number("interval") * (grade == "hard" ? 1.2 : number("ease")) * (grade == "easy" ? 1.3 : 1)
                // Math.round: halves go up
                state["interval"] = .number((next + 0.5).rounded(.down))
            }
            state["reps"] = .number(number("reps") + 1)
        }
        state["interval"] = .number(min(3650, max(1, number("interval"))))
        let parts = JSEnvironment.calendar.dateComponents([.year, .month, .day], from: today)
        var start = DateComponents()
        (start.year, start.month, start.day) = (parts.year, parts.month, parts.day)
        let due = JSEnvironment.calendar.date(byAdding: .day, value: Int(number("interval")), to: JSEnvironment.calendar.date(from: start)!)!
        state["due"] = .string(Daily.dateKey(due))
        return state
    }
}
