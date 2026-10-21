import Foundation

/// Morrow's welcome guide (core/sample.ts `sampleCommands`) with this app's wording (web/sampleRenames.ts), put in a
/// vault opened for the first time. The commands come from App/Resources/WelcomeGuide.json, written by
/// `npm run guide-resource` in web/ from Morrow's own code, with placeholders for what sampleCommands takes from
/// its arguments: `@@id:N@@` for the Nth new page id, `@@day:K@@` for the date key K days from now, and
/// `{"@@now": k}` for the time k milliseconds from now.
nonisolated enum WelcomeGuide {
    static let day = 86_400_000.0

    /// the guide's commands for a vault opened at `now`, nil when the resource is missing or unreadable
    static func commands(newId: () -> String, now: Double) -> [JSValue]? {
        guard let url = Bundle.main.url(forResource: "WelcomeGuide", withExtension: "json"),
              let text = try? String(contentsOf: url, encoding: .utf8),
              let resource = try? JSJSON.parse(text) else { return nil }
        return commands(resource, newId: newId, now: now)
    }

    static func commands(_ resource: JSValue, newId: () -> String, now: Double) -> [JSValue]? {
        guard let count = resource["ids"]?.number, let template = resource["commands"]?.array else { return nil }
        // sampleCommands makes its ids in this order, so the Nth placeholder is the Nth id asked for
        let ids = (0..<Int(count)).map { _ in newId() }
        return template.map { fill($0, ids: ids, now: now) }
    }

    private static let placeholder = JSRegex(#"@@(id|day):(-?\d+)@@"#)

    private static func fill(_ value: JSValue, ids: [String], now: Double) -> JSValue {
        switch value {
        case .string(let text):
            return .string(fill(text, ids: ids, now: now))
        case .array(let items):
            return .array(items.map { fill($0, ids: ids, now: now) })
        case .object(let fields):
            if fields.count == 1, let offset = fields["@@now"]?.number { return .number(now + offset) }
            var filled = JSObject()
            // a database row's values are keyed by property ids, which are new ids too
            for (key, item) in fields { filled[fill(key, ids: ids, now: now)] = fill(item, ids: ids, now: now) }
            return .object(filled)
        default:
            return value
        }
    }

    private static func fill(_ text: String, ids: [String], now: Double) -> String {
        guard text.contains("@@") else { return text }
        return JSText.string(placeholder.replaceAll(text.units) { match in
            let number = Int(JSText.string(match.group(2)!))!
            if JSText.string(match.group(1)!) == "id" { return ids[number - 1].units }
            return Daily.dateKey(Date(timeIntervalSince1970: (now + Double(number) * day) / 1000)).units
        })
    }
}
