import Foundation

/// An entry of `GET /api/documents` (`DocumentListEntrySchema` in
/// `packages/core/src/schemas/api/document-read.ts`).
public struct DocumentEntry: Decodable, Hashable, Sendable {
    public enum Kind: String, Decodable, Sendable { case document, folder, asset, file }

    public var kind: Kind
    /// Documents: the path relative to the content folder without `.md`/`.mdx`.
    public var docName: String?
    public var docExt: String?
    /// Folders, assets and files: the path relative to the content folder.
    public var path: String?
    public var modified: String?
    public var hasChildren: Bool?

    /// The path shown and used for nesting: `docName` for documents, `path` otherwise.
    public var treePath: String { docName ?? path ?? "" }
    public var name: String { treePath.split(separator: "/").last.map(String.init) ?? treePath }

    private enum CodingKeys: String, CodingKey { case kind, docName, docExt, path, modified, hasChildren }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = (try? c.decode(Kind.self, forKey: .kind)) ?? .document
        docName = try c.decodeIfPresent(String.self, forKey: .docName)
        docExt = try c.decodeIfPresent(String.self, forKey: .docExt)
        path = try c.decodeIfPresent(String.self, forKey: .path)
        modified = try c.decodeIfPresent(String.self, forKey: .modified)
        hasChildren = try c.decodeIfPresent(Bool.self, forKey: .hasChildren)
    }

    public init(kind: Kind, docName: String? = nil, path: String? = nil, hasChildren: Bool? = nil) {
        self.kind = kind
        self.docName = docName
        self.path = path
        self.hasChildren = hasChildren
    }
}

public struct ServerConfig: Decodable, Sendable {
    public var collabUrl: String?
    public var port: Int?
}

public enum ServerError: Error, CustomStringConvertible, Sendable {
    case invalidURL(String)
    case http(status: Int, detail: String)
    case transport(String)
    case decoding(String)

    public var description: String {
        switch self {
        case .invalidURL(let url): "서버 주소가 올바르지 않습니다: \(url)"
        case .http(let status, let detail): "서버가 \(status)로 응답했습니다: \(detail)"
        case .transport(let message): "서버에 연결하지 못했습니다: \(message)"
        case .decoding(let message): "서버 응답을 읽지 못했습니다: \(message)"
        }
    }
}

/// HTTP calls to a SynapseNote server. A native request carries no `Origin`
/// header, which the server accepts; mutating routes also require a loopback
/// peer and `Host` (P1 targets the local server).
public struct ServerClient: Sendable {
    public let baseURL: URL

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    public init(address: String) throws {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "http://" + text }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host != nil else {
            throw ServerError.invalidURL(address)
        }
        baseURL = url
    }

    /// The WebSocket endpoint Hocuspocus listens on: `/collab` on the same host.
    public var collabURL: URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.path = "/collab"
        return components.url!
    }

    public func config() async throws -> ServerConfig {
        try await get("/api/config", as: ServerConfig.self)
    }

    /// One level of the content tree (`dir` empty for the root).
    public func documents(in dir: String) async throws -> [DocumentEntry] {
        struct Response: Decodable { var documents: [DocumentEntry] }
        var query = [URLQueryItem(name: "showAll", value: "true"), URLQueryItem(name: "depth", value: "1")]
        if !dir.isEmpty { query.append(URLQueryItem(name: "dir", value: dir)) }
        return try await get("/api/documents", query: query, as: Response.self).documents
    }

    /// Create `path` (ending in `.md`) and return its document name.
    public func createPage(path: String) async throws -> String {
        struct Response: Decodable { var docName: String }
        return try await post("/api/create-page", body: ["path": path], as: Response.self).docName
    }

    public func createFolder(path: String) async throws {
        struct Response: Decodable { var path: String }
        _ = try await post("/api/create-folder", body: ["path": path], as: Response.self)
    }

    // MARK: Transport

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        return try await send(URLRequest(url: components.url!), as: type)
    }

    private func post<T: Decodable>(_ path: String, body: [String: String], as type: T.Type) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request, as: type)
    }

    private func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ServerError.transport(error.localizedDescription)
        }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["detail"] as? String
            throw ServerError.http(status: http.statusCode, detail: detail ?? String(decoding: data.prefix(200), as: UTF8.self))
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw ServerError.decoding(String(describing: error))
        }
    }
}
