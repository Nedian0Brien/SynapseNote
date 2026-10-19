import Foundation

/// Which screen shows a page: the editor page's own, or one the app draws over it (App/Sources/Pages).
nonisolated enum PageScreen: Equatable, Sendable {
    /// The editor page draws it: the text editor, a database, a canvas, or a locked page under the password view.
    case web
    /// The page file could not be read; it is left as it is.
    case unreadable
    /// Content this version does not know, shown as plain text and kept from changes.
    case unknown(types: [String], plain: String)
    /// The page as its Markdown source.
    case source
}
