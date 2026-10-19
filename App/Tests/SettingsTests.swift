import Foundation
import Testing
@testable import SynapseNote

@MainActor
struct AppPreferencesTests {
    private func defaults() -> UserDefaults {
        let name = "settings-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func startsWithMorrowsDefaults() {
        let preferences = AppPreferences(defaults: defaults())
        #expect(preferences.theme == .system)
        #expect(preferences.font == .sans)
        #expect(preferences.width == .comfortable)
        #expect(preferences.accent == .ocean)
        #expect(preferences.colorful)
        #expect(preferences.name == "")
        #expect(preferences.quickNoteFromAnyApp)
    }

    @Test func keepsWhatWasChosenAndTellsThePage() {
        let store = defaults()
        let preferences = AppPreferences(defaults: store)
        var changes = 0
        preferences.changed = { changes += 1 }
        preferences.font = .serif
        preferences.width = .wide
        preferences.accent = .rose
        preferences.colorful = false
        preferences.name = "Dennis"
        #expect(changes == 5)
        let again = AppPreferences(defaults: store)
        #expect(again.font == .serif)
        #expect(again.width == .wide)
        #expect(again.accent == .rose)
        #expect(!again.colorful)
        #expect(again.json == .object([
            "font": .string("serif"), "width": .string("wide"), "accent": .string("rose"),
            "colorful": .bool(false), "name": .string("Dennis"),
        ]))
    }

    @Test func readsUnknownValuesAsDefaults() {
        let store = defaults()
        store.set("sepia", forKey: "preferences.theme")
        store.set("comic", forKey: "preferences.font")
        store.set("pink", forKey: "preferences.accent")
        let preferences = AppPreferences(defaults: store)
        #expect(preferences.theme == .system)
        #expect(preferences.font == .sans)
        #expect(preferences.accent == .ocean)
    }

    @Test func cleansTheNameAsMorrowDoes() {
        #expect(AppPreferences.clean("  Dennis \n") == "Dennis")
        #expect(AppPreferences.clean(String(repeating: "x", count: 80)).count == 60)
    }

    @Test func switchesToTheOppositeOfTheThemeShowing() {
        let preferences = AppPreferences(defaults: defaults())
        preferences.switchTheme(showingDark: false)
        #expect(preferences.theme == .dark)
        #expect(preferences.colorScheme == .dark)
        preferences.switchTheme(showingDark: true)
        #expect(preferences.theme == .light)
        preferences.theme = .system
        #expect(preferences.colorScheme == nil)
    }
}

struct QuickNoteLinkTests {
    @Test func readsTheCaptureLink() {
        #expect(AppLink(URL(string: "synapsenote://capture")!) == .capture)
        #expect(AppLink(URL(string: "SynapseNote://Capture")!) == .capture)
        #expect(AppLink(URL(string: "synapsenote://open")!) == nil)
        #expect(AppLink(URL(string: "https://capture")!) == nil)
    }
}

struct CoverTests {
    @Test func namesMorrowsGradients() {
        #expect(CoverGradient.number(ofCover: "gradient-1") == 1)
        #expect(CoverGradient.number(ofCover: "gradient-12") == 12)
        #expect(CoverGradient.number(ofCover: "gradient-13") == nil)
        #expect(CoverGradient.number(ofCover: "attachments/photo.png") == nil)
        #expect(CoverGradient.number(ofCover: nil) == nil)
    }
}
