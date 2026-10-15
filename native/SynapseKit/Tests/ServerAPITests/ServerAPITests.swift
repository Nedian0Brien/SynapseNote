import Foundation
import Testing
@testable import ServerAPI

@Suite struct ServerAPITests {
    @Test func decodesDocumentsAtOneLevel() throws {
        let json = """
        {"documents":[
          {"kind":"folder","path":"notes","size":0,"modified":"2026-10-16T00:00:00.000Z","isSymlink":false,"canonicalDocName":null,"targetPath":null,"hasChildren":true},
          {"kind":"document","docName":"notes/today","docExt":".md","size":12,"modified":"2026-10-16T00:00:00.000Z","isSymlink":false,"canonicalDocName":null,"targetPath":null},
          {"docName":"legacy","size":1,"modified":"x"}
        ]}
        """
        struct Response: Decodable { var documents: [DocumentEntry] }
        let entries = try JSONDecoder().decode(Response.self, from: Data(json.utf8)).documents
        #expect(entries.map(\.kind) == [.folder, .document, .document])
        #expect(entries[0].treePath == "notes")
        #expect(entries[0].hasChildren == true)
        #expect(entries[1].name == "today")
    }

    @Test func addressNormalisation() throws {
        let client = try ServerClient(address: "127.0.0.1:5190/")
        #expect(client.baseURL.absoluteString == "http://127.0.0.1:5190")
        #expect(client.collabURL.absoluteString == "ws://127.0.0.1:5190/collab")
        #expect(throws: ServerError.self) { try ServerClient(address: "ftp://x") }
    }
}
