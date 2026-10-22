import Foundation
#if os(macOS)
import CoreServices
#endif

/// Notices files changed in the vault by other apps and reports their vault paths, gathered for 150 ms
/// as Morrow's desktop shell does. macOS uses FSEvents, which sees every writer; iOS and iPadOS use a file
/// presenter for coordinated writers and compare modification times when the app comes back to the screen.
nonisolated final class VaultWatcher: NSObject, NSFilePresenter, @unchecked Sendable {
    private let root: URL
    private let onChange: @Sendable (Set<String>) -> Void
    private let lock = NSLock()
    private var pending = Set<String>()
    private var flushScheduled = false
    private var snapshot: [String: Date] = [:]
    let presentedItemOperationQueue = OperationQueue()
    #if os(macOS)
    private var stream: FSEventStreamRef?
    #endif

    var presentedItemURL: URL? { root }

    init(root: URL, onChange: @escaping @Sendable (Set<String>) -> Void) {
        self.root = root.standardizedFileURL
        self.onChange = onChange
        presentedItemOperationQueue.maxConcurrentOperationCount = 1
        super.init()
    }

    func start() {
        snapshot = takeSnapshot()
        #if os(macOS)
        startEvents()
        #else
        NSFileCoordinator.addFilePresenter(self)
        #endif
    }

    func stop() {
        #if os(macOS)
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
            self.stream = nil
        }
        #else
        NSFileCoordinator.removeFilePresenter(self)
        #endif
    }

    /// Reports files added, changed or removed since the last look, for writers that did not tell anyone.
    func checkForChanges() {
        let current = takeSnapshot()
        var changed = Set<String>()
        lock.withLock {
            for (path, date) in current where snapshot[path] != date { changed.insert(path) }
            for path in snapshot.keys where current[path] == nil { changed.insert(path) }
            snapshot = current
        }
        if !changed.isEmpty { queue(changed) }
    }

    private func takeSnapshot() -> [String: Date] {
        var result: [String: Date] = [:]
        let keys: [URLResourceKey] = [.contentModificationDateKey, .isRegularFileKey]
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else {
            return result
        }
        for case let url as URL in enumerator {
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true else { continue }
            result[VaultPaths.relative(url, to: root)] = values.contentModificationDate ?? .distantPast
        }
        return result
    }

    private func queue(_ paths: Set<String>) {
        let relevant = paths.filter { !$0.isEmpty && !$0.contains(VaultPaths.tempMark) && !VaultPaths.isHidden($0) }
        guard !relevant.isEmpty else { return }
        let schedule = lock.withLock {
            pending.formUnion(relevant)
            defer { flushScheduled = true }
            return !flushScheduled
        }
        guard schedule else { return }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .milliseconds(150)) { [weak self] in
            guard let self else { return }
            let paths = lock.withLock {
                defer { pending.removeAll(); flushScheduled = false }
                return pending
            }
            onChange(paths)
        }
    }

    // MARK: NSFilePresenter

    func presentedSubitemDidChange(at url: URL) {
        queue([VaultPaths.relative(url, to: root)])
    }

    func presentedSubitem(at oldURL: URL, didMoveTo newURL: URL) {
        queue([VaultPaths.relative(oldURL, to: root), VaultPaths.relative(newURL, to: root)])
    }

    func accommodatePresentedSubitemDeletion(at url: URL, completionHandler: @escaping @Sendable ((any Error)?) -> Void) {
        queue([VaultPaths.relative(url, to: root)])
        completionHandler(nil)
    }

    // MARK: FSEvents

    #if os(macOS)
    private func startEvents() {
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )
        let callback: FSEventStreamCallback = { _, info, count, paths, _, _ in
            guard let info else { return }
            let watcher = Unmanaged<VaultWatcher>.fromOpaque(info).takeUnretainedValue()
            let list = Unmanaged<CFArray>.fromOpaque(paths).takeUnretainedValue() as? [String] ?? []
            watcher.received(Array(list.prefix(count)))
        }
        let flags = FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)
        guard let stream = FSEventStreamCreate(nil, callback, &context, [root.path(percentEncoded: false)] as CFArray,
                                               FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.05, flags)
        else { return }
        FSEventStreamSetDispatchQueue(stream, DispatchQueue(label: "com.synapsenote.native.vault-events"))
        FSEventStreamStart(stream)
        self.stream = stream
    }

    private func received(_ absolutePaths: [String]) {
        // FSEvents reports resolved paths, such as /private/var for /var
        let roots = Set([root.path(percentEncoded: false), root.resolvingSymlinksInPath().path(percentEncoded: false)]
            .map { $0.trimmingSuffix("/") })
        var paths = Set<String>()
        for path in absolutePaths {
            for base in roots where path.hasPrefix(base + "/") {
                paths.insert(String(path.dropFirst(base.count + 1)))
            }
        }
        lock.withLock {
            for path in paths { snapshot[path] = nil }
        }
        queue(paths)
    }
    #endif
}
