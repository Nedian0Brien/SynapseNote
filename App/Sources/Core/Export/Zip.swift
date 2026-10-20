import Compression
import Foundation

/// Zip archives, as Morrow makes and reads them with fflate (`zipSync`, `unzipSync`): exports, published sites
/// and imports. Entries are compressed with DEFLATE from the Compression framework, whose `COMPRESSION_ZLIB`
/// "encoded format is the raw DEFLATE format as described in IETF RFC 1951" (compression.h), the format zip's
/// method 8 stores. Names are UTF-8 and say so (general purpose flag bit 11). Reading takes stored (0) and
/// deflated (8) entries; ZIP64 and encrypted archives are refused with a reason.
nonisolated enum Zip {
    struct Failure: Error, Equatable {
        let message: String
    }

    /// an archive of the entries in their order, each deflated unless that makes it no smaller
    static func write(_ entries: [(path: String, data: Data)], date: Date = Date()) -> Data {
        var out = Data()
        var central = Data()
        let (time, day) = dosTime(date)
        for entry in entries {
            let name = Data(entry.path.utf8)
            let crc = crc32(entry.data)
            let deflated = entry.data.isEmpty ? nil : deflate(entry.data)
            let method: UInt16 = deflated.map { $0.count < entry.data.count } == true ? 8 : 0
            let body = method == 8 ? deflated! : entry.data
            let offset = UInt32(out.count)
            out.append(le32(0x0403_4b50))
            out.append(le16(20))
            out.append(le16(0x0800))
            out.append(le16(method))
            out.append(le16(time))
            out.append(le16(day))
            out.append(le32(crc))
            out.append(le32(UInt32(body.count)))
            out.append(le32(UInt32(entry.data.count)))
            out.append(le16(UInt16(name.count)))
            out.append(le16(0))
            out.append(name)
            out.append(body)
            central.append(le32(0x0201_4b50))
            central.append(le16(20))
            central.append(le16(20))
            central.append(le16(0x0800))
            central.append(le16(method))
            central.append(le16(time))
            central.append(le16(day))
            central.append(le32(crc))
            central.append(le32(UInt32(body.count)))
            central.append(le32(UInt32(entry.data.count)))
            central.append(le16(UInt16(name.count)))
            central.append(le16(0))
            central.append(le16(0))
            central.append(le16(0))
            central.append(le16(0))
            central.append(le32(0))
            central.append(le32(offset))
            central.append(name)
        }
        let start = UInt32(out.count)
        out.append(central)
        out.append(le32(0x0605_4b50))
        out.append(le16(0))
        out.append(le16(0))
        out.append(le16(UInt16(entries.count)))
        out.append(le16(UInt16(entries.count)))
        out.append(le32(UInt32(central.count)))
        out.append(le32(start))
        out.append(le16(0))
        return out
    }

    /// the entries of an archive in its central directory's order, folders left out
    static func read(_ data: Data) throws(Failure) -> [(path: String, data: Data)] {
        let bytes = [UInt8](data)
        guard let end = endRecord(bytes) else { throw Failure(message: "This is not a zip file, or it is damaged.") }
        let count = Int(u16(bytes, end + 10))
        let directory = Int(u32(bytes, end + 16))
        if count == 0xFFFF || directory == 0xFFFF_FFFF { throw Failure(message: "This zip file is too large to read (ZIP64).") }
        var entries: [(String, Data)] = []
        var at = directory
        for _ in 0..<count {
            guard at + 46 <= bytes.count, u32(bytes, at) == 0x0201_4b50 else { throw Failure(message: "This zip file is damaged.") }
            let flags = u16(bytes, at + 8)
            let method = u16(bytes, at + 10)
            let compressed = Int(u32(bytes, at + 20))
            let size = Int(u32(bytes, at + 24))
            let nameLength = Int(u16(bytes, at + 28))
            let extraLength = Int(u16(bytes, at + 30))
            let commentLength = Int(u16(bytes, at + 32))
            let local = Int(u32(bytes, at + 42))
            guard at + 46 + nameLength <= bytes.count else { throw Failure(message: "This zip file is damaged.") }
            let nameBytes = Array(bytes[(at + 46)..<(at + 46 + nameLength)])
            // fflate reads a name without the UTF-8 flag as Latin-1
            let name = flags & 0x0800 != 0 ? String(decoding: nameBytes, as: UTF8.self) : String(nameBytes.map { Character(Unicode.Scalar($0)) })
            at += 46 + nameLength + extraLength + commentLength
            if compressed == 0xFFFF_FFFF || size == 0xFFFF_FFFF || local == 0xFFFF_FFFF {
                throw Failure(message: "This zip file is too large to read (ZIP64).")
            }
            if flags & 1 != 0 { throw Failure(message: "Encrypted zip files cannot be read.") }
            if name.hasSuffix("/") { continue }
            guard local + 30 <= bytes.count, u32(bytes, local) == 0x0403_4b50 else { throw Failure(message: "This zip file is damaged.") }
            let start = local + 30 + Int(u16(bytes, local + 26)) + Int(u16(bytes, local + 28))
            guard start + compressed <= bytes.count else { throw Failure(message: "This zip file is damaged.") }
            let body = Data(bytes[start..<(start + compressed)])
            switch method {
            case 0: entries.append((name, body))
            case 8:
                guard let inflated = inflate(body, size: size) else { throw Failure(message: "A file in this zip could not be unpacked.") }
                entries.append((name, inflated))
            default:
                throw Failure(message: "This zip file uses a compression method that cannot be read.")
            }
        }
        return entries
    }

    // MARK: DEFLATE

    static func deflate(_ data: Data) -> Data? { process(data, COMPRESSION_STREAM_ENCODE, capacity: max(64, data.count)) }

    static func inflate(_ data: Data, size: Int) -> Data? {
        if size == 0 { return Data() }
        guard let out = process(data, COMPRESSION_STREAM_DECODE, capacity: max(64, size)), out.count == size else { return nil }
        return out
    }

    private static func process(_ data: Data, _ operation: compression_stream_operation, capacity: Int) -> Data? {
        let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { stream.deallocate() }
        guard compression_stream_init(stream, operation, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else { return nil }
        defer { compression_stream_destroy(stream) }
        var out = Data()
        let chunk = min(capacity, 1 << 20)
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: chunk)
        defer { buffer.deallocate() }
        return data.withUnsafeBytes { (source: UnsafeRawBufferPointer) -> Data? in
            stream.pointee.src_ptr = source.bindMemory(to: UInt8.self).baseAddress ?? UnsafePointer(buffer)
            stream.pointee.src_size = data.count
            while true {
                stream.pointee.dst_ptr = buffer
                stream.pointee.dst_size = chunk
                let status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
                out.append(buffer, count: chunk - stream.pointee.dst_size)
                switch status {
                case COMPRESSION_STATUS_OK: continue
                case COMPRESSION_STATUS_END: return out
                default: return nil
                }
            }
        }
    }

    // MARK: records

    private static func endRecord(_ bytes: [UInt8]) -> Int? {
        guard bytes.count >= 22 else { return nil }
        // the end record is the last 22 bytes and a comment of at most 65535
        let lowest = max(0, bytes.count - 22 - 0xFFFF)
        var at = bytes.count - 22
        while at >= lowest {
            if u32(bytes, at) == 0x0605_4b50 { return at }
            at -= 1
        }
        return nil
    }

    /// the date and time fields of a zip entry, in local time as zip tools read them
    static func dosTime(_ date: Date) -> (time: UInt16, day: UInt16) {
        let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let year = max(1980, parts.year ?? 1980)
        let time = UInt16((parts.hour ?? 0) << 11 | (parts.minute ?? 0) << 5 | (parts.second ?? 0) / 2)
        let day = UInt16((year - 1980) << 9 | (parts.month ?? 1) << 5 | (parts.day ?? 1))
        return (time, day)
    }

    private static let crcTable: [UInt32] = (0..<256).map { index in
        var value = UInt32(index)
        for _ in 0..<8 { value = value & 1 != 0 ? 0xEDB8_8320 ^ (value >> 1) : value >> 1 }
        return value
    }

    /// CRC-32 (ISO 3309), as zip records it
    static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in data { crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
        return crc ^ 0xFFFF_FFFF
    }

    private static func le16(_ value: UInt16) -> Data { Data([UInt8(value & 0xFF), UInt8(value >> 8)]) }
    private static func le32(_ value: UInt32) -> Data { Data([UInt8(value & 0xFF), UInt8((value >> 8) & 0xFF), UInt8((value >> 16) & 0xFF), UInt8(value >> 24)]) }
    private static func u16(_ bytes: [UInt8], _ at: Int) -> UInt16 { UInt16(bytes[at]) | UInt16(bytes[at + 1]) << 8 }
    private static func u32(_ bytes: [UInt8], _ at: Int) -> UInt32 {
        UInt32(bytes[at]) | UInt32(bytes[at + 1]) << 8 | UInt32(bytes[at + 2]) << 16 | UInt32(bytes[at + 3]) << 24
    }
}
