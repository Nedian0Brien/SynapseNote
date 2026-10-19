import dnssd
import Foundation
import Network

/// A computer seen on the network, as Morrow's `Seen`: where it listens, when it was last heard from, and
/// its name while it is waiting to be paired.
nonisolated struct SyncSighting: Equatable, Sendable {
    let id: String
    var address: String
    var port: UInt16
    var at: Date
    var pairingName: String?
}

/// Finds other computers on the network. Morrow announces itself with a UDP broadcast every four seconds;
/// macOS does the same so Morrow's desktop app finds it. iOS and iPadOS may not broadcast without a
/// restricted entitlement, so every SynapseNote device also announces itself over Bonjour.
nonisolated final class SyncDiscovery: @unchecked Sendable {
    static let broadcastPort: UInt16 = 47611
    static let broadcastInterval: TimeInterval = 4
    static let bonjourType = "_synapsenote-sync._tcp"

    private let queue = DispatchQueue(label: "com.synapsenote.sync.discovery")
    private let lock = NSLock()
    private var seen: [String: SyncSighting] = [:]
    private var browser: NWBrowser?
    /// This device's Bonjour service, registered apart from the server so a failed announcement never stops it.
    private var registration: DNSServiceRef?
    /// Bonjour results by service name, kept while they are on the network.
    private var services: [String: (id: String, pairing: String?)] = [:]
    #if os(macOS)
    private var socket: Int32 = -1
    private var source: DispatchSourceRead?
    private var timer: DispatchSourceTimer?
    #endif
    private var me: (id: String, port: UInt16, pairing: String?) = ("", 0, nil)

    /// What this computer says about itself: its id, the port it listens on, its name while pairing.
    func announce(id: String, port: UInt16, pairing: String?) {
        lock.withLock { me = (id, port, pairing) }
    }

    private func announcement() -> (id: String, port: UInt16, pairing: String?) {
        lock.withLock { me }
    }

    var isRunning: Bool { lock.withLock { browser != nil } }

    func start() {
        guard lock.withLock({ browser == nil }) else { return }
        startBrowsing()
        #if os(macOS)
        startBroadcast()
        #endif
    }

    func stop() {
        advertise(id: "", port: 0, pairing: nil)
        lock.withLock {
            browser?.cancel()
            browser = nil
            services = [:]
        }
        #if os(macOS)
        timer?.cancel()
        timer = nil
        // the read source closes the socket when it is cancelled
        source?.cancel()
        source = nil
        socket = -1
        #endif
    }

    /// Everything seen recently, by device id.
    func sightings() -> [String: SyncSighting] {
        lock.withLock { seen }
    }

    func forget(_ id: String) {
        _ = lock.withLock { seen.removeValue(forKey: id) }
    }

    private func record(_ sighting: SyncSighting) {
        guard sighting.id != announcement().id else { return }
        lock.withLock { seen[sighting.id] = sighting }
    }

    // MARK: Bonjour

    private func startBrowsing() {
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: Self.bonjourType, domain: nil), using: .tcp)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            self?.update(results)
        }
        lock.withLock { self.browser = browser }
        browser.start(queue: queue)
    }

    private func update(_ results: Set<NWBrowser.Result>) {
        var current: [String: (id: String, pairing: String?)] = [:]
        for result in results {
            guard case .service(let name, _, _, _) = result.endpoint,
                  case .bonjour(let txt) = result.metadata,
                  let id = txt["id"], SyncVault.isValidId(id), id != announcement().id
            else { continue }
            let pairing = txt["pairing"].flatMap { $0.isEmpty ? nil : String($0.prefix(60)) }
            current[name] = (id, pairing)
            resolve(result.endpoint, id: id, pairing: pairing)
        }
        lock.withLock { services = current }
    }

    /// Bonjour names a service, requests need its address: a short connection over IPv4 tells it.
    private func resolve(_ endpoint: NWEndpoint, id: String, pairing: String?) {
        let parameters = NWParameters.tcp
        if let ip = parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options { ip.version = .v4 }
        let connection = NWConnection(to: endpoint, using: parameters)
        let once = Once()
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                once.run {
                    if case .hostPort(let host, let port) = connection.currentPath?.remoteEndpoint,
                       let address = SyncHTTPServer.plainAddress(host) {
                        self?.record(SyncSighting(id: id, address: address, port: port.rawValue, at: Date(), pairingName: pairing))
                    }
                    connection.cancel()
                }
            case .failed, .cancelled:
                once.run { connection.cancel() }
            default:
                break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 8) { once.run { connection.cancel() } }
    }

    /// Bonjour keeps a service listed while it is on the network; those count as seen now.
    func refreshBonjour() {
        let ids = lock.withLock { Set(services.values.map(\.id)) }
        let pairing = lock.withLock { Dictionary(services.values.map { ($0.id, $0.pairing) }, uniquingKeysWith: { first, _ in first }) }
        lock.withLock {
            for id in ids where seen[id] != nil {
                seen[id]?.at = Date()
                seen[id]?.pairingName = pairing[id] ?? nil
            }
        }
    }

    /// Announces this device over Bonjour: named by its device id so a name collision never renames it,
    /// with its name in the TXT record only while it waits to be paired. A port of 0 stops announcing.
    func advertise(id: String, port: UInt16, pairing: String?) {
        queue.async { [weak self] in
            guard let self else { return }
            // dns_sd wants a reference released on the queue it was given
            if let registration { DNSServiceRefDeallocate(registration) }
            registration = nil
            guard port > 0, !id.isEmpty else { return }
            var txt = TXTRecordRef()
            TXTRecordCreate(&txt, 0, nil)
            defer { TXTRecordDeallocate(&txt) }
            for (key, value) in [("id", id), ("pairing", pairing)] {
                guard let value else { continue }
                let bytes = Array(value.utf8.prefix(240))
                TXTRecordSetValue(&txt, key, UInt8(bytes.count), bytes)
            }
            var reference: DNSServiceRef?
            let error = DNSServiceRegister(&reference, 0, 0, id, Self.bonjourType, nil, nil, port.bigEndian,
                                           TXTRecordGetLength(&txt), TXTRecordGetBytesPtr(&txt), nil, nil)
            guard error == kDNSServiceErr_NoError, let reference else { return }
            DNSServiceSetDispatchQueue(reference, queue)
            registration = reference
        }
    }

    // MARK: broadcast, macOS

    #if os(macOS)
    private func startBroadcast() {
        let fd = Darwin.socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard fd >= 0 else { return }
        var yes: Int32 = 1
        // a Morrow desktop on the same Mac listens on the same port, so both may bind it
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &yes, socklen_t(MemoryLayout<Int32>.size))
        setsockopt(fd, SOL_SOCKET, SO_BROADCAST, &yes, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = Self.broadcastPort.bigEndian
        address.sin_addr = in_addr(s_addr: INADDR_ANY)
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0 else {
            close(fd)
            return
        }
        socket = fd
        let source = DispatchSource.makeReadSource(fileDescriptor: fd, queue: queue)
        source.setEventHandler { [weak self] in self?.receiveBroadcast() }
        source.setCancelHandler { close(fd) }
        source.resume()
        self.source = source
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: Self.broadcastInterval)
        timer.setEventHandler { [weak self] in self?.sendAnnouncement() }
        timer.resume()
        self.timer = timer
    }

    /// Sends Morrow's announcement now, as when pairing starts.
    func announceNow() {
        queue.async { [weak self] in self?.sendAnnouncement() }
    }

    private func sendAnnouncement() {
        guard socket >= 0 else { return }
        let me = announcement()
        guard !me.id.isEmpty else { return }
        let message = JSONValue.object([
            "app": .string("morrow-sync"),
            "v": .number(1),
            "id": .string(me.id),
            "port": .number(Double(me.port)),
            "pairing": me.pairing.map(JSONValue.string) ?? .null,
        ])
        guard let data = try? JSONEncoder().encode(message) else { return }
        for target in Self.broadcastAddresses() {
            var address = sockaddr_in()
            address.sin_family = sa_family_t(AF_INET)
            address.sin_port = Self.broadcastPort.bigEndian
            inet_pton(AF_INET, target, &address.sin_addr)
            _ = data.withUnsafeBytes { bytes in
                withUnsafePointer(to: &address) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                        sendto(socket, bytes.baseAddress, bytes.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }
            }
        }
    }

    private func receiveBroadcast() {
        var buffer = [UInt8](repeating: 0, count: 2048)
        var from = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let count = withUnsafeMutablePointer(to: &from) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(socket, &buffer, buffer.count, 0, $0, &length) }
        }
        guard count > 0,
              let message = try? JSONDecoder().decode(JSONValue.self, from: Data(buffer[0..<count])),
              message["app"]?.stringValue == "morrow-sync",
              let id = message["id"]?.stringValue, SyncVault.isValidId(id)
        else { return }
        var text = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        inet_ntop(AF_INET, &from.sin_addr, &text, socklen_t(INET_ADDRSTRLEN))
        let port = message["port"]?.doubleValue.map { UInt16(clamping: Int($0)) } ?? 47610
        record(SyncSighting(
            id: id,
            address: String(cString: text),
            port: port,
            at: Date(),
            pairingName: message["pairing"]?.stringValue.map { String($0.prefix(60)) }
        ))
    }

    /// 255.255.255.255 and the broadcast address of every IPv4 network this Mac is on, as Morrow's.
    static func broadcastAddresses() -> [String] {
        var result: Set<String> = ["255.255.255.255"]
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return Array(result) }
        defer { freeifaddrs(list) }
        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let item = pointer.pointee
            guard let address = item.ifa_addr, address.pointee.sa_family == sa_family_t(AF_INET),
                  let mask = item.ifa_netmask, item.ifa_flags & UInt32(IFF_LOOPBACK) == 0
            else { continue }
            let ip = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr }
            let netmask = mask.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr }
            var broadcast = in_addr(s_addr: ip | ~netmask)
            var text = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            inet_ntop(AF_INET, &broadcast, &text, socklen_t(INET_ADDRSTRLEN))
            result.insert(String(cString: text))
        }
        return Array(result)
    }
    #else
    func announceNow() {}
    #endif
}
