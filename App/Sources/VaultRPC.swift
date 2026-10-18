import Foundation

/// Answers the editor's `VaultBridge` calls with the vault folder, one call at a time in the order they came.
nonisolated final class VaultRPC: Sendable {
    let files: VaultFileSystem
    private let queue = DispatchQueue(label: "com.synapsenote.native.vault")

    init(files: VaultFileSystem) {
        self.files = files
    }

    func handle(method: String, params: [JSONValue], reply: @escaping @Sendable (Result<JSONValue, EditorCommand.RPCFailure>) -> Void) {
        queue.async { [files] in
            do {
                reply(.success(try Self.run(method, params, on: files)))
            } catch {
                reply(.failure(EditorCommand.RPCFailure(message: error.localizedDescription)))
            }
        }
    }

    static func run(_ method: String, _ params: [JSONValue], on files: VaultFileSystem) throws -> JSONValue {
        func string(_ index: Int) throws -> String {
            guard index < params.count, let value = params[index].stringValue else { throw VaultPaths.Failure.invalid }
            return value
        }
        switch method {
        case "scan":
            return try JSONValue(encoding: try files.scan())
        case "apply":
            guard let ops = params.first else { throw VaultPaths.Failure.invalid }
            let decoded = try JSONDecoder().decode([VaultFileSystem.Op].self, from: JSONEncoder().encode(ops))
            return try JSONValue(encoding: files.apply(decoded))
        case "readText":
            return try files.readText(try string(0)).map(JSONValue.string) ?? .null
        case "readBytes":
            return files.readBytes(try string(0)).map { .string($0.base64EncodedString()) } ?? .null
        case "createFile":
            guard let data = Data(base64Encoded: try string(1)) else { throw VaultPaths.Failure.invalid }
            try files.createFile(try string(0), data: data)
            return .null
        case "exists":
            return .bool(try files.exists(try string(0)))
        case "listFiles":
            return try JSONValue(encoding: try files.listFiles(try string(0)))
        default:
            throw VaultFileSystem.Failure.notAllowed("Unknown vault call \(method).")
        }
    }
}
