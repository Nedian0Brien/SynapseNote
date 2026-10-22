import Foundation
import Observation
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// The settings Morrow keeps in `src/app/platform/preferences.ts` that its settings dialog chooses, kept by the
/// app in `UserDefaults`.
@Observable
final class AppPreferences {
    enum Theme: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String {
            switch self {
            case .system: "System"
            case .light: "Light"
            case .dark: "Dark"
            }
        }
    }

    enum Font: String, CaseIterable, Identifiable {
        case serif, sans, mono
        var id: String { rawValue }
        var label: String {
            switch self {
            case .serif: "Serif"
            case .sans: "Sans"
            case .mono: "Mono"
            }
        }
    }

    enum Width: String, CaseIterable, Identifiable {
        case comfortable, wide
        var id: String { rawValue }
        var label: String { self == .comfortable ? "Comfortable" : "Wide" }
    }

    /// Morrow's `ACCENTS` with the swatch colours of `color.css`, for light and dark.
    enum Accent: String, CaseIterable, Identifiable {
        case ember, ocean, aqua, violet, forest, rose, amber, graphite
        var id: String { rawValue }
        var label: String { rawValue.capitalized }

        var swatch: (light: UInt32, dark: UInt32) {
            switch self {
            case .ember: (0xc0582f, 0xe27d50)
            case .ocean: (0x1e88d8, 0x4aa8f0)
            case .aqua: (0x0a9bc4, 0x2ec4e8)
            case .violet: (0x7353e0, 0x9b82ff)
            case .forest: (0x2f8f5b, 0x4fbf82)
            case .rose: (0xd63f6e, 0xf06a94)
            case .amber: (0xc97a0a, 0xf0a830)
            case .graphite: (0x4b5563, 0xb4bcc8)
            }
        }
    }

    /// Morrow keeps the name to 60 characters.
    static let nameLimit = 60

    var name: String { didSet { save("name", name) } }
    var theme: Theme { didSet { save("theme", theme.rawValue); applyTheme() } }
    var font: Font { didSet { save("font", font.rawValue) } }
    var width: Width { didSet { save("width", width.rawValue) } }
    var accent: Accent { didSet { save("accent", accent.rawValue) } }
    var colorful: Bool { didSet { save("colorful", colorful) } }
    /// macOS: ⌥⌘M opens a quick note from any app.
    var quickNoteFromAnyApp: Bool { didSet { save("quickNoteFromAnyApp", quickNoteFromAnyApp) } }
    /// Morrow's `canvasSizes`: the size each inline canvas was dragged to, its width nil for the page's width
    struct CanvasSize: Equatable {
        var width: Double?
        var height: Double
    }
    var canvasSizes: [String: CanvasSize] {
        didSet {
            defaults.set(canvasSizes.mapValues { size -> [String: Double] in
                var entry = ["height": size.height]
                if let width = size.width { entry["width"] = width }
                return entry
            }, forKey: Self.key("canvasSizes"))
        }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // morrow's defaults: the system theme, sans, comfortable, ocean and colourful
        name = Self.clean(defaults.string(forKey: Self.key("name")) ?? "")
        theme = defaults.string(forKey: Self.key("theme")).flatMap(Theme.init) ?? .system
        font = defaults.string(forKey: Self.key("font")).flatMap(Font.init) ?? .sans
        width = defaults.string(forKey: Self.key("width")).flatMap(Width.init) ?? .comfortable
        accent = defaults.string(forKey: Self.key("accent")).flatMap(Accent.init) ?? .ocean
        colorful = defaults.object(forKey: Self.key("colorful")) as? Bool ?? true
        quickNoteFromAnyApp = defaults.object(forKey: Self.key("quickNoteFromAnyApp")) as? Bool ?? true
        canvasSizes = Self.readCanvasSizes(defaults.dictionary(forKey: Self.key("canvasSizes")))
    }

    /// Morrow's readCanvasSizes: entries with a height, at most 500
    static func readCanvasSizes(_ raw: [String: Any]?) -> [String: CanvasSize] {
        var sizes: [String: CanvasSize] = [:]
        for (id, value) in (raw ?? [:]).prefix(500) {
            guard let entry = value as? [String: Any], let height = entry["height"] as? Double else { continue }
            sizes[id] = CanvasSize(width: entry["width"] as? Double, height: height)
        }
        return sizes
    }

    /// The name as Morrow stores it: trimmed, at most 60 characters.
    static func clean(_ name: String) -> String {
        String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(nameLimit))
    }

    /// The colour scheme the app's windows use, nil for the system's.
    var colorScheme: ColorScheme? {
        switch theme {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    /// Morrow's switch light or dark theme: the opposite of the one showing now.
    func switchTheme(showingDark: Bool) {
        theme = showingDark ? .light : .dark
    }

    /// macOS: every window, menus and the settings window follow the theme. iOS uses `colorScheme` on its
    /// window instead.
    func applyTheme() {
        #if os(macOS)
        NSApp?.appearance = switch theme {
        case .system: nil
        case .light: NSAppearance(named: .aqua)
        case .dark: NSAppearance(named: .darkAqua)
        }
        #endif
    }

    private static func key(_ name: String) -> String { "preferences.\(name)" }

    private func save(_ name: String, _ value: Any) {
        defaults.set(value, forKey: Self.key(name))
    }
}
