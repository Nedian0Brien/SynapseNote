import Foundation

/// Morrow's core/vault/layout.ts: where every page lives on disk, Title.md, with its subpages in a folder
/// named Title next to it.
nonisolated struct Placement: Equatable, Sendable {
    /// the page's own file, nil for a folder that has no note of its own
    var file: String?
    /// the folder that holds its subpages, which may not exist on disk yet
    var folder: String

    var json: JSValue { ["file": file.map(JSValue.string) ?? .null, "folder": .string(folder)] }
}

nonisolated enum VaultLayout {
    typealias Map = JSMap<Placement>

    private static let maxName = 120

    static func pageExtension(_ kind: PageKind) -> String { kind == .canvas ? ".canvas" : ".md" }

    static func desiredName(_ page: PageMeta) -> String {
        page.dailyDate ?? Paths.safeFileName(Model.displayTitle(page), maxLength: maxName)
    }

    private static func lower(_ text: String) -> String { JSText.string(JSText.lowercased(text.units)) }

    /// names stay put when they still fit, so renaming one page never renames its siblings
    static func placePages(_ state: WorkspaceState, previous: Map, folderOnly: JSSet, reserved: JSSet = JSSet()) -> Map {
        var result = Map()
        var groups = JSMap<[PageMeta]>()
        var byParent = Tree.ParentIndex()
        for page in state.pages.valuesInOrder { byParent.append(page, to: Tree.effectiveParent(state.pages, page)) }
        var used = JSMap<JSSet>()

        func assign(_ dir: String) {
            let pages = (groups[dir] ?? []).filter { !result.has($0.id) }
            var taken = used[dir] ?? JSSet()
            defer { used[dir] = taken }
            func isFree(_ name: String) -> Bool {
                !taken.has(lower(name)) && !reserved.has(lower(Paths.joinPath(dir, name)))
            }
            func place(_ page: PageMeta, _ name: String) {
                taken.insert(lower(name))
                let folder = Paths.joinPath(dir, name)
                result[page.id] = Placement(file: folderOnly.has(page.id) ? nil : folder + pageExtension(page.kind), folder: folder)
            }
            var later: [PageMeta] = []
            for page in pages {
                let before = previous[page.id]
                let name = before.map { Paths.basename($0.folder) }
                let wanted = desiredName(page)
                var fits = false
                if let name, let before, Paths.joinPath(dir, name).jsEquals(before.folder) {
                    fits = lower(name).jsEquals(lower(wanted)) || numberedName(name, of: wanted)
                }
                if fits, let name, isFree(name) { place(page, name) } else { later.append(page) }
            }
            for page in later {
                let wanted = desiredName(page)
                var name = wanted
                var n = 2
                while !isFree(name) {
                    name = "\(wanted) \(n)"
                    n += 1
                }
                place(page, name)
            }
        }

        func visit(_ parentId: String?, _ folder: String, _ depth: Int) {
            if depth > 256 { return }
            let children = (byParent[parentId] ?? []).jsSorted(Tree.compareSiblings)
            for page in children {
                // a page trashed on its own goes to the trash folder, its subpages travel inside it
                let dir = page.trashedAt != nil ? Paths.trashDir : folder
                groups[dir] = (groups[dir] ?? []) + [page]
            }
            // Morrow sorts the list in place, so the loops below see it sorted too
            var dirs = JSSet()
            for page in children { dirs.insert(page.trashedAt != nil ? Paths.trashDir : folder) }
            for dir in dirs { assign(dir) }
            for page in children {
                if let placed = result[page.id] { visit(page.id, placed.folder, depth + 1) }
            }
        }

        visit(nil, "", 0)
        return result
    }

    /// `new RegExp(`^${escapeRegExp(wanted)} \\d+$`, 'i').test(name)`: the wanted name, a space and a number,
    /// letters compared as JavaScript's `i` flag without `u` compares them
    static func numberedName(_ name: String, of wanted: String) -> Bool {
        let units = name.units
        let prefix = wanted.units
        guard units.count >= prefix.count + 2 else { return false }
        for (a, b) in zip(units, prefix) where JSText.canonicalize(a) != JSText.canonicalize(b) { return false }
        guard units[prefix.count] == 0x20 else { return false }
        return units[(prefix.count + 1)...].allSatisfy { (0x30...0x39).contains($0) }
    }

    /// how [[links]] name each page: the file name when it is unique in the vault, otherwise the full path,
    /// trashed pages keep their plain name so links read the same once they are restored
    static func linkTargets(_ layout: Map) -> JSMap<String> {
        var counts = JSMap<Int>()
        for (_, placement) in layout where !Paths.isInTrash(placement.folder) {
            let name = lower(Paths.basename(placement.folder))
            counts[name] = (counts[name] ?? 0) + 1
        }
        var targets = JSMap<String>()
        for (id, placement) in layout {
            let name = Paths.basename(placement.folder)
            let shared = !Paths.isInTrash(placement.folder) && (counts[lower(name)] ?? 0) > 1
            // obsidian names canvases with their extension
            let suffix = placement.file.map { JSText.endsWith($0.units, ".canvas".units) } == true ? ".canvas" : ""
            targets[id] = (shared ? placement.folder : name) + suffix
        }
        return targets
    }
}

extension JSText {
    /// The Canonicalize operation of a JavaScript regular expression with `i` and without `u` (ECMA-262
    /// §22.2.2.7.3): the unit's upper case when that is one unit, unless it would turn a non-ASCII unit into
    /// an ASCII one.
    nonisolated static func canonicalize(_ unit: UInt16) -> UInt16 {
        guard let scalar = Unicode.Scalar(unit) else { return unit }
        let upper = String(scalar).uppercased().utf16
        guard upper.count == 1, let cu = upper.first else { return unit }
        if unit >= 128, cu < 128 { return unit }
        return cu
    }
}
