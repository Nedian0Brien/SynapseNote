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
    /// A database and its views; not editable when its folder note could not be read.
    case database(editable: Bool)
}

/// What the database screen shows, read from the Swift session in one go (`SessionHost.database(_:)`).
nonisolated struct DatabaseSnapshot: Sendable {
    var page: PageMeta
    var database: DatabaseDef
    /// Morrow's `rowsOf`, in sibling order
    var rows: [PageMeta]
    /// a gallery card's cover, by row id
    var firstImages: [String: String]
    /// checklist items ticked and in all, by row id
    var progress: [String: (done: Int, total: Int)]
    /// every page title a relation value names, with the page it finds; a title missing here finds none
    var relations: [String: RelatedPage]
    /// the time formulas are computed at
    var now: Double

    nonisolated struct RelatedPage: Equatable, Sendable {
        var id: String
        var title: String
    }
}
