import Foundation
import Testing
@testable import SynapseNote

struct JSONValueTests {
    private func roundTrip(_ json: String) throws -> JSONValue {
        let value = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
        let again = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
        #expect(again == value)
        return value
    }

    @Test func keepsEveryKindOfValue() throws {
        let value = try roundTrip(#"{"a":null,"b":true,"c":false,"d":1.5,"e":"x","f":[1,"y",null],"g":{"h":{}}}"#)
        #expect(value["a"] == .null)
        #expect(value["b"] == .bool(true))
        #expect(value["c"] == .bool(false))
        #expect(value["d"] == .number(1.5))
        #expect(value["f"] == .array([.number(1), .string("y"), .null]))
        #expect(value["g"] == .object(["h": .object([:])]))
    }

    @Test func writesWholeNumbersWithoutAFraction() throws {
        let value = try roundTrip(#"{"createdAt":1767603600000,"order":3}"#)
        let text = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
        #expect(text.contains("1767603600000"))
        #expect(!text.contains("1767603600000.0"))
        #expect(text.contains(#""order":3"#))
    }

    @Test func booleansStayBooleans() throws {
        let value = try roundTrip(#"[true,1,0,false]"#)
        #expect(value == .array([.bool(true), .number(1), .number(0), .bool(false)]))
    }
}
