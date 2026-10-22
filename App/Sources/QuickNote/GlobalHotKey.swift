#if os(macOS)
import AppKit
import Carbon.HIToolbox

/// ⌥⌘M from any app, as Morrow's `globalShortcut.register('CommandOrControl+Alt+M')` in `electron/main.cts`:
/// the app comes forward with the quick note sheet. A Carbon hot key needs no accessibility permission and
/// works in the sandbox, unlike watching every key press.
final class GlobalHotKey {
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private let pressed: () -> Void

    init(pressed: @escaping () -> Void) {
        self.pressed = pressed
    }

    var isRegistered: Bool { hotKey != nil }

    /// Takes ⌥⌘M; false when another app already has it.
    @discardableResult
    func register() -> Bool {
        guard hotKey == nil else { return true }
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let status = InstallEventHandler(GetApplicationEventTarget(), { _, _, context in
            guard let context else { return OSStatus(eventNotHandledErr) }
            // carbon delivers hot keys on the main thread's run loop
            MainActor.assumeIsolated { Unmanaged<GlobalHotKey>.fromOpaque(context).takeUnretainedValue().pressed() }
            return noErr
        }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
        guard status == noErr else { return false }
        // the signature is any four characters naming the app's hot keys
        let id = EventHotKeyID(signature: OSType(0x534E_514E), id: 1)
        let registered = RegisterEventHotKey(UInt32(kVK_ANSI_M), UInt32(cmdKey | optionKey), id, GetApplicationEventTarget(), 0, &hotKey)
        if registered != noErr {
            unregister()
            return false
        }
        return true
    }

    func unregister() {
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let handler { RemoveEventHandler(handler) }
        hotKey = nil
        handler = nil
    }
}
#endif
