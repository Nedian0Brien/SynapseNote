import Foundation
import Testing
@testable import SynapseNote

struct EmojiCatalogTests {
    @Test func findsImagesTheWayMorrowsEmojiSrcDoes() {
        let files: Set<String> = ["1f600", "2764-fe0f", "0023-fe0f-20e3", "1f3f3-fe0f"]
        #expect(EmojiCatalog.fileName(for: "😀", in: files) == "1f600")
        // the image set spells some emoji with the variation selector, some without
        #expect(EmojiCatalog.fileName(for: "❤", in: files) == "2764-fe0f")
        #expect(EmojiCatalog.fileName(for: "❤️", in: files) == "2764-fe0f")
        // keycaps are padded to four digits
        #expect(EmojiCatalog.fileName(for: "#️⃣", in: files) == "0023-fe0f-20e3")
        #expect(EmojiCatalog.fileName(for: "🦄", in: files) == nil)
    }

    @MainActor
    @Test func bundledCatalogOnlyOffersEmojiWithImages() {
        let catalog = EmojiCatalog.shared
        #expect(catalog.entries.count > 1000)
        #expect(catalog.entries.allSatisfy { catalog.image(for: $0.emoji) != nil })
        #expect(!catalog.entries.contains { $0.group == 2 })
        #expect(catalog.search("grinning", group: nil).contains { $0.emoji == "😀" })
        #expect(catalog.search("", group: 9).allSatisfy { $0.group == 9 })
    }
}
