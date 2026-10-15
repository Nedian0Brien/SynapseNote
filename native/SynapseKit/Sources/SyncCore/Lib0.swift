import Foundation

/// The two lib0 encodings the Hocuspocus envelope uses: unsigned LEB128
/// varints and length-prefixed UTF-8 strings. y-protocols payloads themselves
/// are encoded in Rust (`yrs::sync`); only the envelope is built here.
public enum Lib0 {
    public enum DecodeError: Error, Equatable {
        case unexpectedEnd
        case varintTooLong
        case invalidUTF8
    }

    public static func writeVarUint(_ value: UInt64, into data: inout Data) {
        var v = value
        while v >= 0x80 {
            data.append(UInt8(v & 0x7F) | 0x80)
            v >>= 7
        }
        data.append(UInt8(v))
    }

    public static func writeVarString(_ string: String, into data: inout Data) {
        let bytes = Data(string.utf8)
        writeVarUint(UInt64(bytes.count), into: &data)
        data.append(bytes)
    }

    public struct Reader {
        public let data: Data
        public private(set) var offset: Int

        public init(_ data: Data) {
            self.data = data
            self.offset = data.startIndex
        }

        public var isAtEnd: Bool { offset >= data.endIndex }

        public mutating func readVarUint() throws -> UInt64 {
            var result: UInt64 = 0
            var shift: UInt64 = 0
            while true {
                guard offset < data.endIndex else { throw DecodeError.unexpectedEnd }
                let byte = data[offset]
                offset += 1
                result |= UInt64(byte & 0x7F) << shift
                if byte < 0x80 { return result }
                shift += 7
                if shift > 63 { throw DecodeError.varintTooLong }
            }
        }

        public mutating func readVarString() throws -> String {
            let length = Int(try readVarUint())
            guard offset + length <= data.endIndex else { throw DecodeError.unexpectedEnd }
            let slice = data[offset..<(offset + length)]
            offset += length
            guard let string = String(data: slice, encoding: .utf8) else {
                throw DecodeError.invalidUTF8
            }
            return string
        }

        /// The unread bytes, re-based to start at index 0.
        public func remainder() -> Data {
            Data(data[offset..<data.endIndex])
        }
    }
}

extension Lib0 {
    /// A length-prefixed byte array (`writeVarUint8Array` in lib0).
    public static func writeVarBytes(_ bytes: Data, into data: inout Data) {
        writeVarUint(UInt64(bytes.count), into: &data)
        data.append(bytes)
    }
}
