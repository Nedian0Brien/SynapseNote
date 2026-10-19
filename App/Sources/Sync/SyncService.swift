import CryptoKit
import Foundation
import Observation
import os
#if os(iOS)
import UIKit
#endif

/// Sync between your own devices on the same network, as Morrow's `electron/sync.cts` and `app/sync.ts`:
/// no server and no account, every request encrypted with a key only two paired devices know, and each side
/// pulling what changed on the other since they last agreed.
@MainActor
@Observable
final class SyncService {
    /// A paired device, as Morrow's `Peer` without its secret, which is kept in `SyncSecrets`.
    struct Peer: Codable, Equatable, Sendable {
        var id: String
        var name: String
        var address: String?
        var port: UInt16?
        /// Milliseconds since 1970, as Morrow stores it.
        var lastSync: Double?
    }

    struct Config: Codable, Equatable, Sendable {
        var deviceId: String
        var name: String
        var enabled: Bool
        var peers: [Peer]
    }

    struct PeerStatus: Identifiable, Equatable {
        let id: String
        let name: String
        let online: Bool
        /// Worth trying even when it was not seen lately, as long as it was reached before.
        let reachable: Bool
        let lastSync: Date?
    }

    /// A device on the network waiting to be paired.
    struct Waiting: Identifiable, Equatable {
        let id: String
        let name: String
        let address: String
        let port: UInt16
    }

    struct Result: Equatable {
        var ok: Bool
        var received = 0
        var conflicts = 0
        var error: String?
        /// Vault paths written or removed, for the editor to read again.
        var changed: Set<String> = []
    }

    enum Failure: LocalizedError {
        case message(String)
        var errorDescription: String? {
            if case .message(let text) = self { text } else { nil }
        }
    }

    static let port: UInt16 = 47610
    static let autoSync: TimeInterval = 90
    static let afterEdit: TimeInterval = 12
    static let pairingTime: TimeInterval = 10 * 60
    static let onlineWindow: TimeInterval = 15
    static let contactWindow: TimeInterval = 3 * 60

    private(set) var config: Config
    private(set) var pairingCode: String?
    private(set) var peers: [PeerStatus] = []
    private(set) var waiting: [Waiting] = []
    /// The device a pull is running with.
    private(set) var busyPeer: String?

    // set by the editor controller
    /// The open vault, nil while none is open.
    var vault: SyncVault?
    /// Saves every edit still waiting in the editor before a pull reads the vault.
    var prepareForSync: () async -> Void = {}
    /// Files a pull wrote or removed, for the editor to read again.
    var filesChanged: (Set<String>) -> Void = { _ in }
    /// A message for the person, as Morrow's toasts; true for errors.
    var notify: (String, Bool) -> Void = { _, _ in }

    @ObservationIgnored private let folder: URL
    @ObservationIgnored private let secrets: any SyncSecrets
    @ObservationIgnored private let opener = SyncOpener()
    @ObservationIgnored private let discovery = SyncDiscovery()
    @ObservationIgnored private var server: SyncHTTPServer?
    @ObservationIgnored private var pairing: (code: String, key: SymmetricKey, expires: Date, attempts: Int)?
    /// When each paired device last answered or asked something; networks that block discovery still work.
    @ObservationIgnored private var contact: [String: Date] = [:]
    @ObservationIgnored private var running: Task<Result, Never>?
    @ObservationIgnored private var timers: [Task<Void, Never>] = []
    @ObservationIgnored private var soon: Task<Void, Never>?
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let logger = Logger(subsystem: "com.synapsenote.native", category: "sync")
    /// Ports tried for the server, replaced in tests.
    @ObservationIgnored var serverPorts: [UInt16] = SyncHTTPServer.ports
    /// Off in tests, which talk over the loopback address only.
    @ObservationIgnored var usesDiscovery = true

    init(folder: URL = SyncService.defaultFolder, secrets: any SyncSecrets = KeychainSyncSecrets(), defaultName: String? = nil) {
        self.folder = folder
        self.secrets = secrets
        let configuration = URLSessionConfiguration.ephemeral
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
        config = Self.loadConfig(from: folder) ?? Config(deviceId: UUID().uuidString.lowercased(), name: defaultName ?? Self.deviceName(), enabled: false, peers: [])
        if Self.loadConfig(from: folder) == nil { save() }
    }

    static var defaultFolder: URL { URL.applicationSupportDirectory }

    static func deviceName() -> String {
        #if os(macOS)
        Host.current().localizedName ?? "Mac"
        #else
        UIDevice.current.name
        #endif
    }

    private var pairingName: String? {
        guard let pairing, pairing.expires > Date() else { return nil }
        return config.name
    }

    // MARK: settings

    private static func loadConfig(from folder: URL) -> Config? {
        guard let data = try? Data(contentsOf: folder.appending(path: "sync.json")),
              let config = try? JSONDecoder().decode(Config.self, from: data),
              SyncVault.isValidId(config.deviceId)
        else { return nil }
        return config
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(config)
            try data.write(to: folder.appending(path: "sync.json"), options: [.atomic, .completeFileProtection])
        } catch {
            logger.error("sync settings were not saved: \(error.localizedDescription, privacy: .public)")
        }
    }

    func setEnabled(_ enabled: Bool) async {
        config.enabled = enabled
        save()
        await refreshServices()
    }

    func setName(_ name: String) {
        let clean = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
        guard !clean.isEmpty else { return }
        config.name = clean
        save()
        advertise()
    }

    func forget(_ peerId: String) {
        config.peers.removeAll { $0.id == peerId }
        secrets.delete(for: peerId)
        save()
        refresh()
    }

    // MARK: running

    /// Starts or stops the server and discovery, as Morrow's `refreshServices`: on while sync is on or a
    /// pairing code is shown.
    func refreshServices() async {
        if config.enabled || pairing != nil {
            if server == nil {
                let server = SyncHTTPServer { [weak self] request in
                    await self?.respond(to: request) ?? .json(500, .object([:]))
                }
                // a listener the system stopped, such as after the network changed, is started again
                server.onFailure = { [weak self] in
                    Task { @MainActor in
                        guard let self else { return }
                        self.server?.stop()
                        self.server = nil
                        await self.refreshServices()
                    }
                }
                do {
                    try await server.start(ports: serverPorts)
                    self.server = server
                    logger.info("sync listening on \(server.port, privacy: .public)")
                } catch {
                    logger.error("sync server did not start: \(error.localizedDescription, privacy: .public)")
                    notify("Sync could not start: \(error.localizedDescription)", true)
                    return
                }
            }
            advertise()
            if usesDiscovery { discovery.start() }
            startTimers()
        } else {
            stopTimers()
            discovery.stop()
            server?.stop()
            server = nil
        }
        refresh()
    }

    /// Stops everything, as when the app leaves.
    func stop() {
        stopTimers()
        discovery.stop()
        server?.stop()
        server = nil
    }

    var listeningPort: UInt16 { server?.port ?? 0 }

    /// Tells the network who this device is: Bonjour, and Morrow's broadcast on macOS.
    private func advertise() {
        discovery.announce(id: config.deviceId, port: listeningPort, pairing: pairingName)
        if usesDiscovery { discovery.advertise(id: config.deviceId, port: listeningPort, pairing: pairingName) }
    }

    /// Recomputes the device list from what discovery saw, as Morrow's `syncStatus`.
    func refresh() {
        discovery.refreshBonjour()
        let now = Date()
        let seen = discovery.sightings()
        if let pairing, pairing.expires <= now {
            self.pairing = nil
            pairingCode = nil
            advertise()
        }
        peers = config.peers.map { peer in
            let found = seen[peer.id]
            let fresh = found.map { now.timeIntervalSince($0.at) < Self.onlineWindow } ?? false
            let recent = (contact[peer.id].map { now.timeIntervalSince($0) < Self.contactWindow }) ?? false
            return PeerStatus(
                id: peer.id,
                name: peer.name,
                online: fresh || recent,
                reachable: fresh || peer.address != nil,
                lastSync: peer.lastSync.map { Date(timeIntervalSince1970: $0 / 1000) }
            )
        }
        waiting = seen.values
            .filter { sighting in
                sighting.pairingName != nil && now.timeIntervalSince(sighting.at) < Self.onlineWindow
                    && !config.peers.contains { $0.id == sighting.id }
            }
            .sorted { $0.pairingName ?? "" < $1.pairingName ?? "" }
            .map { Waiting(id: $0.id, name: $0.pairingName ?? "", address: $0.address, port: $0.port) }
    }

    private func startTimers() {
        guard timers.isEmpty else { return }
        timers = [
            Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    self?.refresh()
                }
            },
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(5))
                while !Task.isCancelled {
                    await self?.syncAll()
                    try? await Task.sleep(for: .seconds(Self.autoSync))
                }
            },
        ]
    }

    private func stopTimers() {
        timers.forEach { $0.cancel() }
        timers = []
        soon?.cancel()
        soon = nil
    }

    /// Edits were saved: syncs a little later, as Morrow does twelve seconds after a save.
    func savesSettled() {
        guard config.enabled, server != nil else { return }
        soon?.cancel()
        soon = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.afterEdit))
            guard !Task.isCancelled else { return }
            await self?.syncAll()
        }
    }

    // MARK: pairing

    /// Shows a code the other device types in, valid for ten minutes.
    @discardableResult
    func startPairing() async -> String {
        let code = SyncCrypto.newCode()
        let key = SyncCrypto.pairingKey(code: code, deviceId: config.deviceId)
        pairing = (code, key, Date().addingTimeInterval(Self.pairingTime), 0)
        pairingCode = code
        await refreshServices()
        discovery.announceNow()
        return code
    }

    func stopPairing() async {
        pairing = nil
        pairingCode = nil
        await refreshServices()
    }

    /// Pairs with a device showing a code, found on the network or typed in by its address.
    func pair(with target: (id: String?, address: String, port: UInt16?), code: String) async -> (ok: Bool, name: String?, error: String?) {
        let port = target.port ?? Self.port
        var id = target.id
        do {
            if id == nil {
                var request = URLRequest(url: try url(target.address, port, "/morrow/v1/id"), timeoutInterval: 8)
                request.httpMethod = "GET"
                let (data, response) = try await session.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { return (false, nil, "That computer is not waiting to pair.") }
                id = (try? JSONDecoder().decode(JSONValue.self, from: data))?["id"]?.stringValue
            }
            guard let id, SyncVault.isValidId(id) else { return (false, nil, "That computer did not answer.") }
            // this device starts listening first, so the other one learns where to reach it
            config.enabled = true
            save()
            await refreshServices()
            let key = SyncCrypto.pairingKey(code: code, deviceId: id)
            let secret = SyncCrypto.newSecret()
            let envelope = try SyncCrypto.seal(.object([
                "deviceId": .string(config.deviceId),
                "name": .string(config.name),
                "secret": .string(secret.base64EncodedString()),
                "port": .number(Double(listeningPort)),
            ]), with: key)
            let body = JSONValue.object(["pair": .bool(true), "iv": .string(envelope.iv), "data": .string(envelope.data)])
            let (status, answer) = try await post(target.address, port, body: body, timeout: 20)
            guard status == 200 else { return (false, nil, answer["error"]?.stringValue ?? "Pairing failed.") }
            guard let iv = answer["iv"]?.stringValue, let data = answer["data"]?.stringValue else { return (false, nil, "Pairing failed.") }
            let other = try opener.open(.init(iv: iv, data: data), with: key)
            guard other["deviceId"]?.stringValue == id else { return (false, nil, "Pairing failed.") }
            let name = other["name"]?.stringValue ?? "Computer"
            secrets.save(secret, for: id)
            config.peers = config.peers.filter { $0.id != id } + [Peer(id: id, name: name, address: target.address, port: port)]
            contact[id] = Date()
            save()
            refresh()
            return (true, name, nil)
        } catch {
            return (false, nil, error.localizedDescription)
        }
    }

    // MARK: the server other devices talk to

    private func respond(to request: SyncHTTPRequest) async -> SyncHTTPResponse {
        if request.method == "GET", request.path == "/morrow/v1/id" {
            // only says who it is while it is waiting to be paired
            guard pairing != nil else { return .json(404, .object([:])) }
            return .json(200, .object(["id": .string(config.deviceId), "name": .string(config.name)]))
        }
        guard request.method == "POST", request.path == "/morrow/v1",
              let body = try? JSONDecoder().decode(JSONValue.self, from: request.body)
        else {
            return request.method == "POST" && request.path == "/morrow/v1" ? .json(400, .object([:])) : .json(404, .object([:]))
        }
        let envelope = SyncCrypto.Envelope(iv: body["iv"]?.stringValue ?? "", data: body["data"]?.stringValue ?? "")
        if body["pair"] == .bool(true) { return acceptPairing(envelope, from: request.remoteAddress) }

        guard let from = body["from"]?.stringValue, let index = config.peers.firstIndex(where: { $0.id == from }),
              config.enabled, let secret = secrets.secret(for: from)
        else { return .json(403, .object([:])) }
        let key = SyncCrypto.peerKey(secret: secret, deviceId: config.deviceId, peerId: from)
        guard let payload = try? opener.open(envelope, with: key) else { return .json(403, .object([:])) }
        // the address the request came from, and the port the other device listens on
        if let address = request.remoteAddress { config.peers[index].address = address }
        if let port = payload["port"]?.doubleValue, port > 0, port < 65536 { config.peers[index].port = UInt16(port) }
        contact[from] = Date()
        let send = { (value: JSONValue) -> SyncHTTPResponse in
            (try? SyncCrypto.seal(value, with: key)).map { .json(200, encoding: $0) } ?? .json(500, .object([:]))
        }
        guard let vault else {
            if payload["op"]?.stringValue == "hello" {
                return send(.object(["deviceId": .string(config.deviceId), "name": .string(config.name), "vaultId": .null, "vaultName": .null]))
            }
            return send(.object(["error": .string("No vault is open.")]))
        }
        do {
            switch payload["op"]?.stringValue {
            case "hello":
                let id = try vault.identity()
                return send(.object(["deviceId": .string(config.deviceId), "name": .string(config.name), "vaultId": .string(id), "vaultName": .string(vault.name)]))
            case "manifest":
                guard payload["vaultId"]?.stringValue == (try vault.identity()) else { return send(.object(["error": .string("different vault")])) }
                let manifest = try await Task.detached { try vault.manifest() }.value
                return send(.object(["manifest": .object(manifest.mapValues(JSONValue.string))]))
            case "get":
                guard payload["vaultId"]?.stringValue == (try vault.identity()), let path = payload["path"]?.stringValue, SyncRules.isSynced(path) else {
                    return send(.object(["error": .string("not allowed")]))
                }
                let data = await Task.detached { vault.read(path) }.value
                return send(.object(["data": data.map { .string($0.base64EncodedString()) } ?? .null]))
            case "pull":
                // the other device has changes, this one fetches them
                Task { [weak self] in _ = await self?.sync(with: from, askBack: false) }
                return send(.object(["ok": .bool(true)]))
            default:
                return send(.object(["error": .string("unknown")]))
            }
        } catch {
            return send(.object(["error": .string(error.localizedDescription)]))
        }
    }

    private func acceptPairing(_ envelope: SyncCrypto.Envelope, from address: String?) -> SyncHTTPResponse {
        guard var current = pairing, current.expires > Date() else {
            return .json(403, .object(["error": .string("This computer is not waiting to pair.")]))
        }
        current.attempts += 1
        pairing = current
        guard current.attempts <= 5 else {
            pairing = nil
            pairingCode = nil
            advertise()
            return .json(403, .object(["error": .string("Too many tries, start pairing again.")]))
        }
        guard let payload = try? opener.open(envelope, with: current.key),
              let id = payload["deviceId"]?.stringValue, SyncVault.isValidId(id),
              let secretText = payload["secret"]?.stringValue, let secret = Data(base64Encoded: secretText)
        else { return .json(403, .object(["error": .string("That code is not right.")])) }
        let name = payload["name"]?.stringValue.map { String($0.prefix(60)) } ?? "Computer"
        let port = payload["port"]?.doubleValue.map { UInt16(clamping: Int($0)) }
        secrets.save(secret, for: id)
        config.peers = config.peers.filter { $0.id != id } + [Peer(id: id, name: name, address: address, port: port)]
        contact[id] = Date()
        save()
        pairing = nil
        pairingCode = nil
        advertise()
        refresh()
        notify("Paired with \(name).", false)
        guard let reply = try? SyncCrypto.seal(.object(["deviceId": .string(config.deviceId), "name": .string(config.name)]), with: current.key) else {
            return .json(500, .object([:]))
        }
        return .json(200, encoding: reply)
    }

    // MARK: talking to a paired device

    private func url(_ address: String, _ port: UInt16, _ path: String) throws -> URL {
        let host = address.contains(":") ? "[\(address)]" : address
        guard let url = URL(string: "http://\(host):\(port)\(path)") else { throw Failure.message("Invalid address.") }
        return url
    }

    private func post(_ address: String, _ port: UInt16, body: JSONValue, timeout: TimeInterval) async throws -> (Int, JSONValue) {
        var request = URLRequest(url: try url(address, port, "/morrow/v1"), timeoutInterval: timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (status, (try? JSONDecoder().decode(JSONValue.self, from: data)) ?? .object([:]))
    }

    /// One encrypted request to a paired device, as Morrow's `requestPeer`.
    func request(_ peerId: String, _ payload: [String: JSONValue]) async throws -> JSONValue {
        guard let index = config.peers.firstIndex(where: { $0.id == peerId }), let secret = secrets.secret(for: peerId) else {
            throw Failure.message("That computer is not paired.")
        }
        let peer = config.peers[index]
        let found = discovery.sightings()[peerId]
        guard let address = found?.address ?? peer.address else { throw Failure.message("\(peer.name) has not been seen on this network.") }
        let port = found?.port ?? peer.port ?? Self.port
        let key = SyncCrypto.peerKey(secret: secret, deviceId: config.deviceId, peerId: peerId)
        var inner = payload
        inner["port"] = .number(Double(listeningPort))
        let envelope = try SyncCrypto.seal(.object(inner), with: key)
        let body = JSONValue.object(["from": .string(config.deviceId), "iv": .string(envelope.iv), "data": .string(envelope.data)])
        let (status, answer) = try await post(address, port, body: body, timeout: payload["op"] == .string("get") ? 120 : 30)
        guard status == 200 else { throw Failure.message("\(peer.name) refused the request. Is sync turned on there?") }
        let result = try opener.open(.init(iv: answer["iv"]?.stringValue ?? "", data: answer["data"]?.stringValue ?? ""), with: key)
        contact[peerId] = Date()
        if let current = config.peers.firstIndex(where: { $0.id == peerId }),
           config.peers[current].address != address || config.peers[current].port != port {
            config.peers[current].address = address
            config.peers[current].port = port
            save()
        }
        return result
    }

    // MARK: pulling

    /// One pull from one device, then that device is asked to pull from this one, as Morrow's `syncWith`.
    /// A pull already running is joined rather than started again.
    func sync(with peerId: String, askBack: Bool = true) async -> Result {
        if let running { return await running.value }
        let task = Task { await pull(from: peerId, askBack: askBack) }
        running = task
        busyPeer = peerId
        let result = await task.value
        running = nil
        busyPeer = nil
        if !result.changed.isEmpty { filesChanged(result.changed) }
        refresh()
        return result
    }

    private func pull(from peerId: String, askBack: Bool) async -> Result {
        guard let vault else { return Result(ok: false, error: "No vault is open.") }
        do {
            let here = try vault.identity()
            let hello = try await request(peerId, ["op": .string("hello")])
            let theirs = hello["name"]?.stringValue ?? "The other computer"
            guard hello["vaultId"]?.stringValue == here else {
                if let name = hello["vaultName"]?.stringValue, hello["vaultId"]?.stringValue != nil {
                    return Result(ok: false, error: "\(theirs) has a different vault open (\(name)). Open the same vault on both, or copy it over first.")
                }
                return Result(ok: false, error: "\(theirs) has no vault open.")
            }
            await prepareForSync()
            let local = try await Task.detached { try vault.manifest() }.value
            let answer = try await request(peerId, ["op": .string("manifest"), "vaultId": .string(here)])
            guard let remote = answer["manifest"]?.objectValue?.compactMapValues(\.stringValue) else {
                throw Failure.message(answer["error"]?.stringValue ?? "No list of files came back.")
            }
            let base = vault.base(for: peerId)
            let plan = SyncRules.planPull(local: local, remote: remote, base: base, device: config.name, now: Date())
            var next = plan.base
            var result = Result(ok: true)
            func restore(_ path: String) {
                if let previous = base[path] { next[path] = previous } else { next.removeValue(forKey: path) }
            }
            for action in plan.actions {
                switch action {
                case .delete(let path, _):
                    if vault.remove(path) { result.changed.insert(path) } else { restore(path) }
                case .download(let path, _), .conflict(let path, _, _):
                    let file = try await request(peerId, ["op": .string("get"), "vaultId": .string(here), "path": .string(path)])
                    guard let text = file["data"]?.stringValue, let data = Data(base64Encoded: text) else {
                        restore(path)
                        continue
                    }
                    if case .conflict(_, _, let copy) = action {
                        // this device's version keeps living under a conflict name before theirs takes the name
                        guard let ours = vault.read(path), (try? vault.write(copy, data: ours, expect: nil)) == .ok else {
                            restore(path)
                            continue
                        }
                        result.changed.insert(copy)
                        result.conflicts += 1
                    }
                    if (try? vault.write(path, data: data, expect: local[path])) == .ok {
                        result.received += 1
                        result.changed.insert(path)
                    } else {
                        // changed here while syncing, the next sync sorts it out
                        restore(path)
                    }
                }
            }
            try vault.saveBase(next, for: peerId)
            if let index = config.peers.firstIndex(where: { $0.id == peerId }) {
                config.peers[index].lastSync = (Date().timeIntervalSince1970 * 1000).rounded()
                save()
            }
            if askBack { _ = try? await request(peerId, ["op": .string("pull")]) }
            return result
        } catch {
            return Result(ok: false, error: error.localizedDescription)
        }
    }

    /// Pulls from every paired device that can be reached, as Morrow's `syncAll`.
    func syncAll(quiet: Bool = true) async {
        guard config.enabled, vault != nil else { return }
        refresh()
        for peer in peers where peer.online || peer.reachable {
            let result = await sync(with: peer.id)
            if !result.ok, !quiet {
                notify("Sync with \(peer.name) failed: \(result.error ?? "")", true)
            } else if result.conflicts > 0 {
                notify(
                    "\(result.conflicts) page\(result.conflicts == 1 ? " was" : "s were") changed on both computers. Both versions are kept, look for “conflict” in the name.",
                    false
                )
            }
        }
    }

    /// Sync now from the settings, with Morrow's messages.
    func syncNow(_ peerId: String) async {
        let name = config.peers.first { $0.id == peerId }?.name ?? "the other computer"
        let result = await sync(with: peerId)
        if result.ok {
            notify(result.received == 0 ? "Up to date with \(name)." : "Received \(result.received) change\(result.received == 1 ? "" : "s") from \(name).", false)
        } else {
            notify(result.error ?? "Sync failed.", true)
        }
    }

    /// The id of the vault open on a paired device, to make a copy of it here.
    func vaultId(of peerId: String) async throws -> String {
        let hello = try await request(peerId, ["op": .string("hello")])
        guard let id = hello["vaultId"]?.stringValue else {
            throw Failure.message("\(hello["name"]?.stringValue ?? "That computer") has no vault open.")
        }
        return id
    }
}

/// Where paired devices' secrets are kept.
protocol SyncSecrets: Sendable {
    func secret(for peerId: String) -> Data?
    func save(_ secret: Data, for peerId: String)
    func delete(for peerId: String)
}

/// The keychain, one item per paired device, kept on this device only.
nonisolated struct KeychainSyncSecrets: SyncSecrets {
    static let service = "com.synapsenote.native.sync"

    private func query(_ peerId: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Self.service, kSecAttrAccount as String: peerId]
    }

    func secret(for peerId: String) -> Data? {
        var item: CFTypeRef?
        var search = query(peerId)
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        guard SecItemCopyMatching(search as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    func save(_ secret: Data, for peerId: String) {
        delete(for: peerId)
        var item = query(peerId)
        item[kSecValueData as String] = secret
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    func delete(for peerId: String) {
        SecItemDelete(query(peerId) as CFDictionary)
    }
}

/// Secrets kept in memory, for tests.
nonisolated final class MemorySyncSecrets: SyncSecrets, @unchecked Sendable {
    private let lock = NSLock()
    private var secrets: [String: Data] = [:]

    func secret(for peerId: String) -> Data? { lock.withLock { secrets[peerId] } }
    func save(_ secret: Data, for peerId: String) { lock.withLock { secrets[peerId] = secret } }
    func delete(for peerId: String) { _ = lock.withLock { secrets.removeValue(forKey: peerId) } }
}
