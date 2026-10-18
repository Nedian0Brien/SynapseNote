import SwiftUI

/// Morrow's toasts, drawn by the app at the bottom centre above every screen, as Morrow's `Toasts`: the
/// message, its button when it has one, and a close button. Errors are red.
struct ToastOverlay: View {
    let controller: EditorController

    var body: some View {
        VStack(spacing: 8) {
            ForEach(controller.allToasts) { toast in
                ToastRow(toast: toast, controller: controller)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.bottom, 20)
        .padding(.horizontal, 16)
        .animation(.snappy, value: controller.allToasts)
    }
}

private struct ToastRow: View {
    let toast: EditorToast
    let controller: EditorController

    var body: some View {
        HStack(spacing: 12) {
            Text(toast.message)
                .multilineTextAlignment(.leading)
            if let action = toast.action {
                Button(action) { controller.runToastAction(toast.id) }
                    .buttonStyle(.plain)
                    .fontWeight(.semibold)
                    .underline()
            }
            Button("Dismiss", systemImage: "xmark") { controller.dismissToast(toast.id) }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .font(.caption.weight(.semibold))
                .opacity(0.7)
        }
        .font(.callout)
        .foregroundStyle(toast.isError ? AnyShapeStyle(.white) : AnyShapeStyle(.background))
        .padding(.vertical, 8)
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .background(toast.isError ? Color.red : Color.primary.opacity(0.88), in: .rect(cornerRadius: 8))
        .shadow(color: .black.opacity(0.15), radius: 8, y: 2)
        .accessibilityElement(children: .contain)
    }
}
