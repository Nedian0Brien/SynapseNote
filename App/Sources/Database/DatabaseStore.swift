import Foundation
import Observation

/// What the database screen shows and the changes it makes. The data comes from the Swift session after every
/// report; a change is applied here at once and sent to the page as a Morrow command, so a second change made
/// before the next report builds on the first, as Morrow's screen does with `getState()`.
@MainActor
@Observable
final class DatabaseStore {
    let controller: EditorController
    let dbId: String
    private(set) var snapshot: DatabaseSnapshot?
    /// the view on screen, remembered per database like Morrow's `morrow.view.<id>`
    private(set) var chosenViewId: String?
    /// a row just added to the table, whose name gets focus
    var focusRow: String?
    @ObservationIgnored private var askedForView = false

    init(controller: EditorController, dbId: String) {
        self.controller = controller
        self.dbId = dbId
        chosenViewId = UserDefaults.standard.string(forKey: Self.viewKey(dbId))
    }

    static func viewKey(_ id: String) -> String { "morrow.view.\(id)" }
    static func newId() -> String { UUID().uuidString.lowercased() }

    func load() async {
        guard let next = await controller.databaseSnapshot(dbId) else { return }
        snapshot = next
    }

    var database: DatabaseDef { snapshot?.database ?? DatabaseDef(properties: [], views: []) }
    var now: Double { snapshot?.now ?? JSEnvironment.now() }

    var view: ViewDef? {
        database.views.first { chosenViewId.map($0.id.jsEquals) == true } ?? database.views.first
    }

    func choose(_ viewId: String) {
        chosenViewId = viewId
        UserDefaults.standard.set(viewId, forKey: Self.viewKey(dbId))
    }

    /// a database always has at least one view; asked once, the report brings it back
    func ensureView(editable: Bool) {
        guard editable, !askedForView, snapshot != nil, database.views.isEmpty else { return }
        askedForView = true
        var next = database
        next.views = [Database.newView("table", next, Self.newId)]
        save(next)
    }

    // MARK: changes

    func save(_ database: DatabaseDef) {
        snapshot?.database = database
        controller.perform(.setDatabase(id: dbId, database: database))
    }

    func updateView(_ viewId: String, _ change: (ViewDef) -> ViewDef) {
        save(DatabaseEdits.updateView(database, viewId, change))
    }

    func setValue(_ rowId: String, _ propId: String, _ value: JSValue) {
        if let index = snapshot?.rows.firstIndex(where: { $0.id.jsEquals(rowId) }) {
            snapshot?.rows[index].properties[propId] = value
        }
        controller.perform(.setProperties(id: rowId, values: JSObject([(propId, value)])))
    }

    func rename(_ rowId: String, _ title: String) {
        if let index = snapshot?.rows.firstIndex(where: { $0.id.jsEquals(rowId) }) { snapshot?.rows[index].title = title }
        controller.perform(.rename(id: rowId, title: title))
    }

    /// data.ts' createRow: a page in the database with these values
    @discardableResult
    func createRow(_ values: JSObject = JSObject()) -> String {
        let id = Self.newId()
        controller.perform(.createPage(id: id, parentId: dbId, title: "", properties: values))
        return id
    }

    func newRowAndOpen(_ values: JSObject = JSObject()) {
        open(createRow(values))
    }

    func open(_ pageId: String) {
        controller.go(to: .page(pageId))
    }

    /// a property's new type with every row's value converted, all or none
    func changeType(_ propId: String, to type: String) {
        guard let snapshot, let change = DatabaseEdits.changeType(database, propId, to: type, rows: snapshot.rows, newId: Self.newId)
        else { return }
        self.snapshot?.database = change.database
        for (rowId, value) in change.values {
            if let index = self.snapshot?.rows.firstIndex(where: { $0.id.jsEquals(rowId) }) {
                self.snapshot?.rows[index].properties[propId] = value
            }
        }
        controller.performAll([.setDatabase(id: dbId, database: change.database)]
            + change.values.map { .setProperties(id: $0.rowId, values: JSObject([(propId, $0.value)])) })
    }

    /// a name result from the edits: saved, or an error toast as Morrow shows it
    @discardableResult
    func apply(_ result: DatabaseEdits.NameResult) -> Bool {
        switch result {
        case .ok(let next):
            save(next)
            return true
        case .empty:
            return false
        case .refused(let message):
            controller.showToast(message, error: true)
            return false
        }
    }

    /// OptionPicker's create: the option is made when new, then chosen
    func createOption(_ prop: PropDef, named name: String, for row: PageMeta, selected: [String]) -> Bool {
        guard let made = DatabaseEdits.ensureOption(database, prop.id, name, newId: Self.newId) else { return false }
        if let next = made.database { save(next) }
        setValue(row.id, prop.id, DatabaseEdits.chooseCreated(made.option.id, selected: selected, multi: prop.type == "multiSelect"))
        return true
    }

    // MARK: reading

    func value(_ row: PageMeta, _ prop: PropDef) -> JSValue {
        Database.valueOf(row, prop.id, database, now: now)
    }

    func info(_ pageId: String) -> PageInfo? { controller.workspace.infos[pageId] }
}
