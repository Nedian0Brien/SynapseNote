import SwiftUI
#if os(iOS)
import UIKit
typealias PlatformFont = UIFont
typealias PlatformColor = UIColor
typealias PlatformFontDescriptor = UIFontDescriptor
#else
import AppKit
typealias PlatformFont = NSFont
typealias PlatformColor = NSColor
typealias PlatformFontDescriptor = NSFontDescriptor
#endif

/// How Morrow's `.prose` draws a page (src/app/styles/editor.css, color.css, features.css, tokens.css): the
/// writing font from the settings at 18, 16 or 14.5 points, headings at 1.72, 1.36 and 1.13 times it, code in
/// the monospaced font, and the nine text and highlight colours in their light and dark forms.
enum EditorStyle {
    /// the kind of text block, which sets its font
    enum Block: Equatable {
        case paragraph
        case heading(Int)
        case code
        case summary
    }

    /// what the block sits in, which changes its colour
    struct Context: Equatable {
        var quoted = false
        var checked = false
        /// a table's header cell, in bold
        var header = false
    }

    static func bodySize(_ font: AppPreferences.Font) -> CGFloat {
        switch font {
        case .serif: 18
        case .sans: 16
        case .mono: 14.5
        }
    }

    static func lineHeight(_ font: AppPreferences.Font) -> CGFloat {
        switch font {
        case .serif: 1.7
        case .sans: 1.68
        case .mono: 1.75
        }
    }

    /// the height of one line of a font as the text view lays it out
    static func lineHeight(of font: PlatformFont) -> CGFloat {
        #if os(iOS)
        font.lineHeight
        #else
        ceil(font.ascender - font.descender + font.leading)
        #endif
    }

    static func size(_ block: Block, _ font: AppPreferences.Font) -> CGFloat {
        let body = bodySize(font)
        switch block {
        case .paragraph, .summary: return body
        case .heading(let level): return body * [1.72, 1.36, 1.13][min(max(level, 1), 3) - 1]
        case .code: return 13.5
        }
    }

    static func font(_ block: Block, _ font: AppPreferences.Font, bold: Bool = false, italic: Bool = false, code: Bool = false) -> PlatformFont {
        let size = size(block, font)
        let monospaced = code || block == .code || font == .mono
        let heading: Bool = if case .heading = block { true } else { false }
        let weight: PlatformFont.Weight = heading || bold ? .semibold : .regular
        var base: PlatformFont
        if monospaced {
            base = .monospacedSystemFont(ofSize: code && block != .code ? size * 0.82 : size, weight: weight)
        } else {
            base = .systemFont(ofSize: size, weight: weight)
            if font == .serif, let serif = base.fontDescriptor.withDesign(.serif) {
                #if os(iOS)
                base = PlatformFont(descriptor: serif, size: size)
                #else
                base = PlatformFont(descriptor: serif, size: size) ?? base
                #endif
            }
        }
        guard italic else { return base }
        #if os(iOS)
        let traits = base.fontDescriptor.symbolicTraits.union(.traitItalic)
        return base.fontDescriptor.withSymbolicTraits(traits).map { PlatformFont(descriptor: $0, size: size) } ?? base
        #else
        let descriptor = base.fontDescriptor.withSymbolicTraits(base.fontDescriptor.symbolicTraits.union(.italic))
        return PlatformFont(descriptor: descriptor, size: size) ?? base
        #endif
    }

    static func paragraphStyle(_ block: Block, _ font: AppPreferences.Font) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        let size = size(block, font)
        let height: CGFloat = switch block {
        case .heading: 1.28
        case .code: 1.6
        default: lineHeight(font)
        }
        // CSS line-height spreads the extra space around the line; the text view adds it below
        style.lineSpacing = max(0, size * (height - 1.2))
        return style
    }

    /// the display attributes for a run of text with these marks, added over the editor's own attributes
    static func attributes(_ marks: EditorMarkSet?, _ block: Block, _ context: Context, _ font: AppPreferences.Font) -> [NSAttributedString.Key: Any] {
        let code = marks?.has("code") == true
        var attributes: [NSAttributedString.Key: Any] = [
            .font: Self.font(block, font, bold: marks?.has("bold") == true || context.header, italic: marks?.has("italic") == true || context.quoted, code: code),
            .paragraphStyle: paragraphStyle(block, font),
            .foregroundColor: context.checked ? faint : context.quoted ? muted : text,
        ]
        if marks?.has("underline") == true || marks?.has("link") == true {
            attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
            if marks?.has("link") == true { attributes[.underlineColor] = accent.withAlphaComponent(0.45) }
        }
        if marks?.has("strike") == true || context.checked { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
        if code { attributes[.backgroundColor] = codeBackground }
        if let highlight = marks?.mark("highlight") {
            attributes[.backgroundColor] = highlight.attrs?["color"]?.string.flatMap(background) ?? mark
        }
        if let color = marks?.mark("textColor")?.attrs?["color"]?.string.flatMap(textColor) {
            attributes[.foregroundColor] = color
        }
        return attributes
    }

    /// the display attributes laid over an attributed text that holds only the editor's own attributes
    static func styled(_ text: NSAttributedString, _ block: Block, _ context: Context, _ font: AppPreferences.Font) -> NSAttributedString {
        let out = NSMutableAttributedString(attributedString: text)
        restyle(out, block, context, font)
        return out
    }

    static func restyle(_ text: NSMutableAttributedString, _ block: Block, _ context: Context, _ font: AppPreferences.Font) {
        let whole = NSRange(location: 0, length: text.length)
        text.enumerateAttribute(.editorMarks, in: whole) { value, range, _ in
            let display = attributes(value as? EditorMarkSet, block, context, font)
            for key in displayKeys where display[key] == nil { text.removeAttribute(key, range: range) }
            text.addAttributes(display, range: range)
        }
    }

    /// what `restyle` sets, removed first so a mark taken off leaves no trace
    static let displayKeys: [NSAttributedString.Key] = [.font, .paragraphStyle, .foregroundColor, .underlineStyle, .underlineColor,
                                                        .strikethroughStyle, .backgroundColor]

    // MARK: colours

    static let colorNames = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]

    /// `--c-*-text`
    static func textColor(_ name: String) -> PlatformColor? {
        let pairs: [String: (UInt32, UInt32)] = [
            "gray": (0x5e5a52, 0xc9c3b8), "brown": (0x7a5232, 0xd9b394), "orange": (0xa3521c, 0xf0a971),
            "yellow": (0x876214, 0xe9cb6d), "green": (0x3a6e47, 0x93cf9f), "blue": (0x3b628c, 0x9cc1ea),
            "purple": (0x67468c, 0xc6a8ec), "pink": (0x9a3a6c, 0xefa3c9), "red": (0xa3302a, 0xf39a90),
        ]
        return pairs[name].map { dynamic(light: rgb($0.0), dark: rgb($0.1)) }
    }

    /// `--c-*`, the highlight colours
    static func background(_ name: String) -> PlatformColor? {
        let pairs: [String: ((Double, Double, Double, Double), (Double, Double, Double, Double))] = [
            "gray": ((120, 116, 108, 0.16), (200, 195, 185, 0.14)), "brown": ((150, 100, 60, 0.16), (190, 140, 100, 0.18)),
            "orange": ((214, 120, 40, 0.16), (230, 140, 70, 0.18)), "yellow": ((214, 170, 40, 0.22), (230, 190, 70, 0.18)),
            "green": ((77, 138, 92, 0.16), (110, 180, 125, 0.18)), "blue": ((79, 122, 168, 0.16), (110, 160, 215, 0.18)),
            "purple": ((130, 94, 170, 0.16), (170, 135, 215, 0.2)), "pink": ((196, 84, 140, 0.15), (225, 120, 175, 0.18)),
            "red": ((179, 38, 30, 0.13), (240, 122, 110, 0.18)),
        ]
        return pairs[name].map { dynamic(light: rgba($0.0), dark: rgba($0.1)) }
    }

    /// `--mark`, a highlight with no colour
    static let mark = dynamic(light: rgba((214, 160, 40, 0.28)), dark: rgba((230, 180, 60, 0.3)))
    /// `--code-bg`
    static let codeBackground = dynamic(light: rgb(0xf6f6f5), dark: rgb(0x222222))
    #if os(iOS)
    static var accent: PlatformColor { .tintColor }
    static let text = PlatformColor.label
    static let muted = PlatformColor.secondaryLabel
    static let faint = PlatformColor.tertiaryLabel
    #else
    static var accent: PlatformColor { .controlAccentColor }
    static let text = PlatformColor.labelColor
    static let muted = PlatformColor.secondaryLabelColor
    static let faint = PlatformColor.tertiaryLabelColor
    #endif

    static func rgb(_ hex: UInt32) -> PlatformColor {
        PlatformColor(red: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }

    static func rgba(_ value: (Double, Double, Double, Double)) -> PlatformColor {
        PlatformColor(red: value.0 / 255, green: value.1 / 255, blue: value.2 / 255, alpha: value.3)
    }

    static func dynamic(light: PlatformColor, dark: PlatformColor) -> PlatformColor {
        #if os(iOS)
        PlatformColor { $0.userInterfaceStyle == .dark ? dark : light }
        #else
        PlatformColor(name: nil) { $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light }
        #endif
    }
}
