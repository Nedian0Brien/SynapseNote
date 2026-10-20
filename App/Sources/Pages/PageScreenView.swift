import SwiftUI

/// The screens the app draws over the editor page for a text page, by the rules of Morrow's PageView: a page
/// that could not be read, one with content this version does not know, and a page shown as its Markdown source.
/// The editor page draws an empty page under them; for every other page this draws nothing.
struct PageScreenView: View {
    let controller: EditorController
    let pageId: String
    @State private var screen: PageScreen = .web

    private struct Asked: Equatable {
        let revision: Int
        let sourceMode: String?
    }

    var body: some View {
        content
            // asked again whenever the page reports a change, the page's own copy is changed the same way
            .task(id: Asked(revision: controller.revision, sourceMode: controller.sourceMode)) {
                screen = await controller.pageScreen(pageId)
            }
    }

    @ViewBuilder private var content: some View {
        if let page = controller.workspace.infos[pageId], screen != .web {
            switch screen {
            case .unreadable:
                PageNoticeView(controller: controller, page: page, unreadable: true,
                               text: "The content of this page could not be read. It has been left untouched in storage and is protected from changes. Saving a backup will not include it.",
                               plain: nil)
            case .unknown(let types, let plain):
                PageNoticeView(controller: controller, page: page, unreadable: false,
                               text: "This page contains content SynapseNote does not know yet (\(types.joined(separator: ", "))). It is shown as plain text and protected from changes so nothing is lost.",
                               plain: plain)
            case .database(let editable):
                DatabaseScreenView(controller: controller, page: page, editable: editable)
            case .canvas(let unreadable):
                CanvasScreenView(controller: controller, page: page, unreadable: unreadable)
            case .editor:
                EditorScreenView(controller: controller, page: page)
            case .source, .web:
                SourcePageView(controller: controller, page: page)
            }
        } else {
            // the editor page shows through and takes the touches; a view is kept so the task above runs
            Color.clear
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// The page's width and font from the settings, as Morrow's `.page` takes them: 720 points of text, 980 when wide.
struct PageColumn<Content: View>: View {
    let controller: EditorController
    @ViewBuilder let content: Content

    var body: some View {
        content
            .frame(maxWidth: controller.preferences.width == .wide ? 980 : 720, alignment: .leading)
            .padding(.horizontal, 56)
            .frame(maxWidth: .infinity)
    }
}

/// Morrow's PageView for a page the editor is not given: the page's header, then why, and its text as plain text
/// when there is any. The header of a page that could not be read is read only: the vault never writes that
/// file (Morrow's vaultRepository skips locked pages), so a new title or cover would be lost when the vault opens
/// again. Morrow lets them be typed; here they are not offered.
struct PageNoticeView: View {
    let controller: EditorController
    let page: PageInfo
    let unreadable: Bool
    let text: String
    let plain: String?

    var body: some View {
        ScrollView {
            CoverBanner(controller: controller, page: page, editable: !unreadable)
            PageColumn(controller: controller) {
                VStack(alignment: .leading, spacing: 0) {
                    PageHeaderView(controller: controller, page: page, editable: !unreadable)
                    PageBanner(text: text, error: unreadable)
                    if let plain {
                        Text(plain)
                            .font(.system(size: 17))
                            .lineSpacing(17 * 0.7 - 4)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                            .padding(.top, 16)
                    }
                }
            }
            .padding(.top, page.cover == nil ? 32 : 0)
            .padding(.bottom, 120)
        }
        .background(.background)
    }
}

/// Morrow's `.banner`, a note across the page; `error` is its `is-error` form.
struct PageBanner<Actions: View>: View {
    let text: String
    var error = false
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(spacing: 12) {
            Text(text)
                .frame(maxWidth: .infinity, alignment: .leading)
            actions
        }
        .font(.callout.weight(error ? .medium : .regular))
        .foregroundStyle(error ? AnyShapeStyle(.red) : AnyShapeStyle(.primary))
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(error ? AnyShapeStyle(.red.opacity(0.1)) : AnyShapeStyle(.quaternary.opacity(0.6)), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
    }
}

extension PageBanner where Actions == EmptyView {
    init(text: String, error: Bool = false) {
        self.text = text
        self.error = error
        actions = EmptyView()
    }
}
