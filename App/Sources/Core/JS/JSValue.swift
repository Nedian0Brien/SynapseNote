import Foundation

/// A JSON value with the meaning JavaScript gives it, so the Swift core reads and writes exactly what
/// Morrow's TypeScript core does: object keys keep JavaScript's property order, strings compare by UTF-16
/// code units rather than by Unicode equivalence, and numbers print as `Number.prototype.toString` prints them.
/// A key that is missing stands for `undefined`.
nonisolated enum JSValue: Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSValue])
    case object(JSObject)

    subscript(key: String) -> JSValue? {
        if case .object(let object) = self { object[key] } else { nil }
    }

    var string: String? {
        if case .string(let value) = self { value } else { nil }
    }

    var number: Double? {
        if case .number(let value) = self { value } else { nil }
    }

    var bool: Bool? {
        if case .bool(let value) = self { value } else { nil }
    }

    var array: [JSValue]? {
        if case .array(let values) = self { values } else { nil }
    }

    var object: JSObject? {
        if case .object(let object) = self { object } else { nil }
    }

    var isNull: Bool {
        if case .null = self { true } else { false }
    }

    /// JavaScript's `typeof value === 'object' && value !== null && !Array.isArray(value)`.
    var isRecord: Bool { object != nil }
}

extension JSValue: Equatable {
    /// Strict equality of the JSON values, strings by their UTF-16 code units as `===` compares them.
    nonisolated static func == (lhs: JSValue, rhs: JSValue) -> Bool {
        switch (lhs, rhs) {
        case (.null, .null): true
        case (.bool(let a), .bool(let b)): a == b
        case (.number(let a), .number(let b)): a == b
        case (.string(let a), .string(let b)): a.utf16.elementsEqual(b.utf16)
        case (.array(let a), .array(let b)): a.count == b.count && zip(a, b).allSatisfy { $0 == $1 }
        case (.object(let a), .object(let b)): a == b
        default: false
        }
    }
}

extension JSValue {
    /// The same value to the bit, NaN included: what two references to one JavaScript object hold.
    nonisolated func identical(to other: JSValue) -> Bool {
        switch (self, other) {
        case (.number(let a), .number(let b)): a.bitPattern == b.bitPattern
        case (.array(let a), .array(let b)): a.count == b.count && zip(a, b).allSatisfy { $0.identical(to: $1) }
        case (.object(let a), .object(let b)):
            a.count == b.count && zip(a, b).allSatisfy { $0.key.jsEquals($1.key) && $0.value.identical(to: $1.value) }
        default: self == other
        }
    }
}

extension JSValue: ExpressibleByStringLiteral, ExpressibleByBooleanLiteral, ExpressibleByIntegerLiteral,
    ExpressibleByFloatLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    nonisolated init(stringLiteral value: String) { self = .string(value) }
    nonisolated init(booleanLiteral value: Bool) { self = .bool(value) }
    nonisolated init(integerLiteral value: Int) { self = .number(Double(value)) }
    nonisolated init(floatLiteral value: Double) { self = .number(value) }
    nonisolated init(arrayLiteral elements: JSValue...) { self = .array(elements) }
    nonisolated init(dictionaryLiteral elements: (String, JSValue)...) {
        var object = JSObject()
        for (key, value) in elements { object[key] = value }
        self = .object(object)
    }
    nonisolated init(nilLiteral: ()) { self = .null }
}

/// A JavaScript object: keys that are array indices come first in ascending order, the others in the order they
/// were first set, as `Object.keys` and `JSON.stringify` list them. Keys compare by UTF-16 code units.
nonisolated struct JSRecord<Value>: Sequence {
    private(set) var keys: [String] = []
    private var values: [JSKey: Value] = [:]

    init() {}

    init(_ pairs: [(String, Value)]) {
        for (key, value) in pairs { self[key] = value }
    }

    var count: Int { keys.count }
    var isEmpty: Bool { keys.isEmpty }
    var valuesInOrder: [Value] { keys.map { values[JSKey($0)]! } }

    subscript(key: String) -> Value? {
        get { values[JSKey(key)] }
        set {
            let id = JSKey(key)
            guard let newValue else {
                if values.removeValue(forKey: id) != nil { keys.removeAll { JSKey($0) == id } }
                return
            }
            if values.updateValue(newValue, forKey: id) == nil { insert(key) }
        }
    }

    func has(_ key: String) -> Bool { values[JSKey(key)] != nil }

    func makeIterator() -> AnyIterator<(key: String, value: Value)> {
        var index = 0
        let keys = keys
        let values = values
        return AnyIterator {
            guard index < keys.count else { return nil }
            defer { index += 1 }
            let key = keys[index]
            return (key, values[JSKey(key)]!)
        }
    }

    func mapValues<T>(_ transform: (Value) throws -> T) rethrows -> JSRecord<T> {
        var out = JSRecord<T>()
        for (key, value) in self { out[key] = try transform(value) }
        return out
    }

    /// Integer keys before the others, ascending, as JavaScript orders an object's own properties.
    private mutating func insert(_ key: String) {
        guard let index = Self.arrayIndex(key) else {
            keys.append(key)
            return
        }
        let position = keys.firstIndex { other in
            guard let otherIndex = Self.arrayIndex(other) else { return true }
            return otherIndex > index
        } ?? keys.count
        keys.insert(key, at: position)
    }

    /// The key as an array index: digits with no leading zero, below 2^32 - 1.
    static func arrayIndex(_ key: String) -> UInt32? {
        let units = Array(key.utf16)
        guard !units.isEmpty, units.count <= 10, units.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) else { return nil }
        if units.count > 1, units[0] == 0x30 { return nil }
        guard let value = UInt64(key), value < 4_294_967_295 else { return nil }
        return UInt32(value)
    }
}

nonisolated extension JSRecord: Sendable where Value: Sendable {}

nonisolated extension JSRecord: Equatable where Value: Equatable {
    static func == (lhs: JSRecord, rhs: JSRecord) -> Bool {
        lhs.keys.count == rhs.keys.count
            && zip(lhs.keys, rhs.keys).allSatisfy { JSKey($0) == JSKey($1) }
            && lhs.keys.allSatisfy { lhs.values[JSKey($0)] == rhs.values[JSKey($0)] }
    }
}

typealias JSObject = JSRecord<JSValue>

/// A JavaScript `Map` with string keys: insertion order, keys compared by UTF-16 code units.
nonisolated struct JSMap<Value>: Sequence {
    private(set) var keys: [String] = []
    private var values: [JSKey: Value] = [:]

    init() {}

    var count: Int { keys.count }
    var isEmpty: Bool { keys.isEmpty }

    subscript(key: String) -> Value? {
        get { values[JSKey(key)] }
        set {
            let id = JSKey(key)
            guard let newValue else {
                if values.removeValue(forKey: id) != nil { keys.removeAll { JSKey($0) == id } }
                return
            }
            if values.updateValue(newValue, forKey: id) == nil { keys.append(key) }
        }
    }

    func has(_ key: String) -> Bool { values[JSKey(key)] != nil }

    func makeIterator() -> AnyIterator<(key: String, value: Value)> {
        var index = 0
        let keys = keys
        let values = values
        return AnyIterator {
            guard index < keys.count else { return nil }
            defer { index += 1 }
            return (keys[index], values[JSKey(keys[index])]!)
        }
    }
}

nonisolated extension JSMap: Sendable where Value: Sendable {}
nonisolated extension JSMap: Equatable where Value: Equatable {
    static func == (lhs: JSMap, rhs: JSMap) -> Bool {
        lhs.keys.count == rhs.keys.count
            && zip(lhs.keys, rhs.keys).allSatisfy { JSKey($0) == JSKey($1) }
            && lhs.keys.allSatisfy { lhs.values[JSKey($0)] == rhs.values[JSKey($0)] }
    }
}

/// A JavaScript `Set` of strings: insertion order, compared by UTF-16 code units.
nonisolated struct JSSet: Sequence, Sendable, Equatable {
    private(set) var items: [String] = []
    private var members: Set<JSKey> = []

    init() {}
    init<S: Sequence>(_ items: S) where S.Element == String { for item in items { insert(item) } }

    var count: Int { items.count }
    var isEmpty: Bool { items.isEmpty }

    func has(_ item: String) -> Bool { members.contains(JSKey(item)) }

    @discardableResult
    mutating func insert(_ item: String) -> Bool {
        guard members.insert(JSKey(item)).inserted else { return false }
        items.append(item)
        return true
    }

    mutating func remove(_ item: String) {
        guard members.remove(JSKey(item)) != nil else { return }
        items.removeAll { JSKey($0) == JSKey(item) }
    }

    func makeIterator() -> IndexingIterator<[String]> { items.makeIterator() }

    static func == (lhs: JSSet, rhs: JSSet) -> Bool {
        lhs.items.count == rhs.items.count && zip(lhs.items, rhs.items).allSatisfy { JSKey($0) == JSKey($1) }
    }
}

/// A string compared and hashed by its UTF-16 code units, as JavaScript compares strings: two names that
/// differ only in Unicode normalization stay two different keys.
nonisolated struct JSKey: Hashable, Sendable {
    let units: [UInt16]

    init(_ string: String) { units = Array(string.utf16) }

    var string: String { String(decoding: units, as: UTF16.self) }
}

extension String {
    /// JavaScript `===` on two strings.
    nonisolated func jsEquals(_ other: String) -> Bool { utf16.elementsEqual(other.utf16) }

    /// JavaScript's `<` on two strings: by UTF-16 code units.
    nonisolated func jsLess(_ other: String) -> Bool { utf16.lexicographicallyPrecedes(other.utf16) }
}
