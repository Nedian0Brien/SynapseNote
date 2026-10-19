import Foundation

/// `String.prototype.localeCompare` as Morrow calls it, in the locale the JavaScript engine runs in.
nonisolated enum JSCollator {
    /// `a.localeCompare(b)`, or with `{ numeric: true, sensitivity: 'base' }` when `titles`.
    ///
    /// Foundation's locale comparison runs ICU's collator, but without `.literal` it first folds compatibility
    /// characters (ﬁ, ①, full width digits, kana) and reads precomposed Hangul by syllable, where ICU's default
    /// strength keeps them apart and reads Hangul by jamo. So the default comparison goes to ICU with `.literal`,
    /// on text in one normalization form (ICU treats canonically equivalent text as equal). The `base` comparison
    /// wants those folds, and gets ICU's Hangul order once the syllables are decomposed. Checked against
    /// Intl.Collator in en-US and ko-KR on Fixtures/core/expected/collation.json.
    /// `base` alone is `{ sensitivity: 'base' }` without `numeric`, as Morrow sorts tags.
    static func compare(_ a: String, _ b: String, locale: Locale = .current, titles: Bool = false, base: Bool = false) -> Int {
        let folds: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive, .widthInsensitive]
        let options: String.CompareOptions = titles ? folds.union(.numeric) : base ? folds : [.literal]
        let left = a.decomposedStringWithCanonicalMapping
        let right = b.decomposedStringWithCanonicalMapping
        switch left.compare(right, options: options, range: nil, locale: locale) {
        case .orderedAscending: return -1
        case .orderedSame: return 0
        case .orderedDescending: return 1
        }
    }
}

extension Array {
    /// `Array.prototype.sort` with a comparator: a stable sort, as JavaScript's is.
    nonisolated func jsSorted(_ compare: (Element, Element) -> Int) -> [Element] {
        enumerated().sorted { lhs, rhs in
            let order = compare(lhs.element, rhs.element)
            return order != 0 ? order < 0 : lhs.offset < rhs.offset
        }.map(\.element)
    }
}
