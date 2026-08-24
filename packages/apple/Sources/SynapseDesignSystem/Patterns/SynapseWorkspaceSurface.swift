import SwiftUI

/// Responsive workspace structures exercised by the design lab.
public enum SynapseWorkspaceLayout: String, CaseIterable, Identifiable, Sendable {
  case compact
  case split
  case desktop

  public var id: String { rawValue }
}

/// A working SwiftUI workspace used to validate design tokens and component behavior.
@MainActor
public struct SynapseWorkspaceSurface: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private let layout: SynapseWorkspaceLayout
  private let syncStatus: SynapseSyncStatus

  @State private var selectedDocumentID = Fixture.documents[0].id
  @State private var searchText = ""
  @State private var title = "제품 설계 노트"
  @State private var selectedBlock = true
  @State private var completedPrinciples: Set<String> = ["로컬 우선", "문서가 중심"]
  @State private var inspectorPresented = true

  public init(
    layout: SynapseWorkspaceLayout,
    syncStatus: SynapseSyncStatus = .synced
  ) {
    self.layout = layout
    self.syncStatus = syncStatus
  }

  public var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    HStack(spacing: 0) {
      if layout != .compact {
        sidebar(colors: colors)
          .frame(width: layout == .desktop ? 250 : 226)

        Rectangle()
          .fill(colors.separator)
          .frame(width: 1)
      }

      documentWorkspace(colors: colors)

      if layout == .desktop, inspectorPresented {
        Rectangle()
          .fill(colors.separator)
          .frame(width: 1)

        inspector(colors: colors)
          .frame(width: 244)
          .transition(.move(edge: .trailing).combined(with: .opacity))
      }
    }
    .background(colors.canvas)
    .animation(reduceMotion ? nil : SynapseMotion.reveal, value: inspectorPresented)
  }

  private func sidebar(colors: SynapseColorRoles) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Label("SynapseNote", systemImage: "point.3.connected.trianglepath.dotted")
          .font(.system(.headline, design: .default, weight: .semibold))
          .foregroundStyle(colors.contentPrimary)

        Spacer()

        SynapseIconButton(symbol: "square.and.pencil", accessibilityLabel: "새 문서") {}
      }
      .padding(.horizontal, theme.spacing.medium)
      .frame(height: 52)

      HStack(spacing: theme.spacing.small) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(colors.contentSecondary)
        TextField("검색", text: $searchText)
          .textFieldStyle(.plain)
      }
      .padding(.horizontal, theme.spacing.small)
      .frame(height: 36)
      .background(colors.elevatedSurface.opacity(0.7))
      .clipShape(RoundedRectangle(cornerRadius: SynapseCorner.control, style: .continuous))
      .padding(.horizontal, theme.spacing.medium)
      .padding(.bottom, theme.spacing.medium)

      Text("최근 문서")
        .font(SynapseTypography.metadata)
        .foregroundStyle(colors.contentSecondary)
        .padding(.horizontal, theme.spacing.large)
        .padding(.bottom, theme.spacing.xSmall)

      ScrollView {
        LazyVStack(spacing: 2) {
          ForEach(filteredDocuments) { document in
            Button {
              selectedDocumentID = document.id
              title = document.title
            } label: {
              SynapseDocumentRow(
                document: document,
                isSelected: selectedDocumentID == document.id
              )
            }
            .buttonStyle(.plain)
          }
        }
        .padding(.horizontal, theme.spacing.small)
      }

      Divider()
        .overlay(colors.separator)

      HStack {
        SynapseStatusBadge(status: syncStatus)
        Spacer()
        SynapseIconButton(symbol: "gearshape", accessibilityLabel: "설정") {}
      }
      .padding(theme.spacing.medium)
    }
    .background(colors.sidebar)
  }

  private func documentWorkspace(colors: SynapseColorRoles) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: theme.spacing.small) {
        if layout == .compact {
          SynapseIconButton(symbol: "sidebar.left", accessibilityLabel: "사이드바") {}
        }

        Text("Research")
          .font(SynapseTypography.metadata)
          .foregroundStyle(colors.contentSecondary)
        Image(systemName: "chevron.right")
          .font(.caption2)
          .foregroundStyle(colors.contentSecondary)
        Text(title)
          .font(SynapseTypography.metadata)
          .foregroundStyle(colors.contentPrimary)
          .lineLimit(1)

        Spacer()

        if layout == .desktop {
          SynapseIconButton(
            symbol: inspectorPresented ? "sidebar.right" : "sidebar.right",
            accessibilityLabel: "관계 패널"
          ) {
            inspectorPresented.toggle()
          }
        }
        SynapseIconButton(symbol: "ellipsis", accessibilityLabel: "문서 메뉴") {}
      }
      .padding(.horizontal, theme.spacing.medium)
      .frame(height: 52)
      .background(colors.canvas.opacity(0.96))
      .overlay(alignment: .bottom) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: theme.spacing.large) {
          TextField("제목 없음", text: $title)
            .textFieldStyle(.plain)
            .font(SynapseTypography.documentTitle)
            .foregroundStyle(colors.contentPrimary)

          HStack(spacing: theme.spacing.small) {
            Label("오늘", systemImage: "calendar")
            Text("·")
            Label("설계", systemImage: "number")
            Spacer()
            SynapseStatusBadge(status: syncStatus)
          }
          .font(SynapseTypography.metadata)
          .foregroundStyle(colors.contentSecondary)

          Text("SynapseNote의 Apple 플랫폼 기반을 정리하는 문서입니다. 글쓰기가 중심에 놓이고, 도구와 관계 정보는 필요한 순간에만 나타나야 합니다.")
            .font(SynapseTypography.documentBody)
            .foregroundStyle(colors.contentPrimary)
            .lineSpacing(6)

          VStack(alignment: .leading, spacing: theme.spacing.small) {
            Text("디자인 시스템의 역할")
              .font(.title2.weight(.semibold))
              .foregroundStyle(colors.contentPrimary)

            Text("색상이나 여백을 모아두는 데서 끝나지 않고, 모든 화면이 같은 계층과 상태 언어를 사용하도록 만드는 것이 목표입니다.")
              .font(SynapseTypography.documentBody)
              .foregroundStyle(colors.contentPrimary)
              .lineSpacing(6)
          }
          .padding(theme.spacing.medium)
          .background(selectedBlock ? colors.accentSurface : .clear)
          .overlay {
            RoundedRectangle(cornerRadius: SynapseCorner.selection, style: .continuous)
              .stroke(selectedBlock ? colors.accent.opacity(0.55) : .clear, lineWidth: 1)
          }
          .contentShape(Rectangle())
          .onTapGesture {
            selectedBlock.toggle()
          }

          if selectedBlock {
            inlineToolbar(colors: colors)
              .transition(.opacity.combined(with: .scale(scale: 0.97)))
          }

          VStack(alignment: .leading, spacing: theme.spacing.small) {
            Text("원칙")
              .font(.title3.weight(.semibold))
              .foregroundStyle(colors.contentPrimary)

            ForEach(Fixture.principles, id: \.self) { principle in
              Toggle(
                principle,
                isOn: Binding(
                  get: { completedPrinciples.contains(principle) },
                  set: { isCompleted in
                    if isCompleted {
                      completedPrinciples.insert(principle)
                    } else {
                      completedPrinciples.remove(principle)
                    }
                  }
                )
              )
              .toggleStyle(.checkbox)
              .font(SynapseTypography.documentBody)
            }
          }

          Text(
            "SwiftUI 컴포넌트와 TextKit 편집 표면은 같은 의미 기반 토큰을 사용합니다. 플랫폼별 표현은 달라질 수 있지만 정보의 우선순위와 피드백은 유지됩니다."
          )
          .font(SynapseTypography.documentBody)
          .foregroundStyle(colors.contentPrimary)
          .lineSpacing(6)

          codeSample(colors: colors)
        }
        .frame(maxWidth: theme.documentWidth, alignment: .leading)
        .padding(.horizontal, layout == .compact ? theme.spacing.large : theme.spacing.xLarge)
        .padding(.vertical, theme.spacing.xLarge)
        .frame(maxWidth: .infinity)
      }
    }
    .background(colors.canvas)
  }

  private func inlineToolbar(colors: SynapseColorRoles) -> some View {
    HStack(spacing: 2) {
      ForEach(["textformat", "bold", "italic", "link", "list.bullet"], id: \.self) { symbol in
        SynapseIconButton(symbol: symbol, accessibilityLabel: "서식") {}
      }
      Divider().frame(height: 20)
      SynapseIconButton(symbol: "ellipsis", accessibilityLabel: "추가 서식") {}
    }
    .padding(4)
    .background(colors.elevatedSurface)
    .clipShape(RoundedRectangle(cornerRadius: SynapseCorner.control, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: SynapseCorner.control, style: .continuous)
        .stroke(colors.separator, lineWidth: 1)
    }
    .fixedSize()
  }

  private func codeSample(colors: SynapseColorRoles) -> some View {
    VStack(alignment: .leading, spacing: theme.spacing.small) {
      HStack {
        Text("Theme.swift")
          .font(SynapseTypography.metadata)
          .foregroundStyle(colors.contentSecondary)
        Spacer()
        Image(systemName: "doc.on.doc")
          .foregroundStyle(colors.contentSecondary)
      }

      Text("@Environment(SynapseTheme.self) private var theme")
        .font(SynapseTypography.code)
        .foregroundStyle(colors.contentPrimary)
    }
    .padding(theme.spacing.medium)
    .background(colors.elevatedSurface)
    .clipShape(RoundedRectangle(cornerRadius: SynapseCorner.panel, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: SynapseCorner.panel, style: .continuous)
        .stroke(colors.separator, lineWidth: 1)
    }
  }

  private func inspector(colors: SynapseColorRoles) -> some View {
    VStack(alignment: .leading, spacing: theme.spacing.large) {
      HStack {
        Text("문서 관계")
          .font(.headline)
          .foregroundStyle(colors.contentPrimary)
        Spacer()
        SynapseIconButton(symbol: "xmark", accessibilityLabel: "관계 패널 닫기") {
          inspectorPresented = false
        }
      }

      inspectorSection(
        title: "백링크",
        items: ["사용자 흐름 초안", "디자인 원칙"],
        colors: colors
      )
      inspectorSection(
        title: "언급된 문서",
        items: ["Apple 플랫폼 계획", "동기화 계약"],
        colors: colors
      )

      Spacer()
    }
    .padding(theme.spacing.medium)
    .background(colors.sidebar)
  }

  private func inspectorSection(
    title: String,
    items: [String],
    colors: SynapseColorRoles
  ) -> some View {
    VStack(alignment: .leading, spacing: theme.spacing.small) {
      Text(title)
        .font(SynapseTypography.metadata)
        .foregroundStyle(colors.contentSecondary)

      ForEach(items, id: \.self) { item in
        Label(item, systemImage: "arrow.turn.down.right")
          .font(SynapseTypography.navigation)
          .foregroundStyle(colors.contentPrimary)
          .padding(.vertical, theme.spacing.xSmall)
      }
    }
  }

  private var filteredDocuments: [SynapseDocumentSummary] {
    guard !searchText.isEmpty else { return Fixture.documents }
    return Fixture.documents.filter { document in
      document.title.localizedCaseInsensitiveContains(searchText)
        || document.location.localizedCaseInsensitiveContains(searchText)
    }
  }
}

private enum Fixture {
  static let documents = [
    SynapseDocumentSummary(
      id: UUID(uuidString: "F0228A4B-318C-4AD9-9764-E91F4A2D2B61")!,
      title: "제품 설계 노트",
      location: "Research/Design",
      modifiedLabel: "방금 전"
    ),
    SynapseDocumentSummary(
      id: UUID(uuidString: "AFA425A7-146D-4B38-B90E-F92F1C2F9363")!,
      title: "사용자 흐름 초안",
      location: "Research/Product",
      modifiedLabel: "오늘"
    ),
    SynapseDocumentSummary(
      id: UUID(uuidString: "38F489E0-26B3-4776-82B4-FC94955B4CAB")!,
      title: "Oracle 배포 계획",
      location: "Operations",
      modifiedLabel: "어제",
      symbol: "server.rack"
    ),
    SynapseDocumentSummary(
      id: UUID(uuidString: "2B397181-4A2E-4B09-A62B-A22EFAE969E4")!,
      title: "동기화 계약",
      location: "Engineering",
      modifiedLabel: "8월 21일",
      symbol: "arrow.trianglehead.2.clockwise.rotate.90"
    ),
    SynapseDocumentSummary(
      id: UUID(uuidString: "8867FA7F-B236-4E37-824A-E9095D11CFA7")!,
      title: "디자인 원칙",
      location: "Research/Design",
      modifiedLabel: "8월 19일",
      symbol: "swatchpalette"
    ),
  ]

  static let principles = [
    "로컬 우선",
    "문서가 중심",
    "도구는 필요할 때만",
    "접근성은 기본 상태",
  ]
}

#Preview("iPad workspace") {
  SynapseWorkspaceSurface(layout: .split)
    .synapseTheme(SynapseTheme())
    .frame(width: 834, height: 1194)
}

#Preview("iPhone workspace") {
  SynapseWorkspaceSurface(layout: .compact, syncStatus: .offline)
    .synapseTheme(SynapseTheme())
    .frame(width: 390, height: 844)
}
