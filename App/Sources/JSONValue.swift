import Foundation

/// Any JSON value. Documents and page records cross the editor bridge in this form, so the app keeps
/// every field the editor wrote, including ones it does not read itself.
nonisolated enum JSONValue: Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    subscript(key: String) -> JSONValue? {
        if case .object(let fields) = self { fields[key] } else { nil }
    }

    var stringValue: String? {
        if case .string(let value) = self { value } else { nil }
    }

    var doubleValue: Double? {
        if case .number(let value) = self { value } else { nil }
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let fields) = self { fields } else { nil }
    }

    /// The value as Foundation objects, for JSONSerialization.
    var foundationObject: Any {
        switch self {
        case .null: NSNull()
        case .bool(let value): value
        case .number(let value): value
        case .string(let value): value
        case .array(let values): values.map(\.foundationObject)
        case .object(let fields): fields.mapValues(\.foundationObject)
        }
    }
}

extension JSONValue: Codable {
    nonisolated init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    nonisolated func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value):
            // whole numbers such as timestamps and orders are written without a fraction
            if value.rounded() == value, abs(value) < 9_007_199_254_740_992 {
                try container.encode(Int64(value))
            } else {
                try container.encode(value)
            }
        case .string(let value): try container.encode(value)
        case .array(let values): try container.encode(values)
        case .object(let fields): try container.encode(fields)
        }
    }
}
