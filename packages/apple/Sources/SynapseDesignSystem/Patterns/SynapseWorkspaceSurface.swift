import SwiftUI

/// Responsive workspace structures exercised by the design lab.
public enum SynapseWorkspaceLayout: String, CaseIterable, Identifiable, Sendable {
  case compact
  case split
  case desktop

  public var id: String { rawValue }
}

/// Product panels that share the trailing SynapseNote workspace column.
public enum SynapseWorkspacePanel: String, CaseIterable, Identifiable, Sendable {
  case chat
  case outline
  case links

  public var id: String { rawValue }

  public var title: String {
    switch self {
    case .chat: "Chat"
    case .outline: "Outline"
    case .links: "Links"
    }
  }
}

/// A native SwiftUI calibration surface based on the shipping SynapseNote workspace.
///
/// The surface preserves the product's information architecture: project navigation,
/// a tabbed long-form editor, and a document/AI panel. It intentionally uses standard
/// controls and quiet content surfaces so the design system is tested against the real
/// product density instead of an unrelated demonstration screen.
@MainActor
public struct SynapseWorkspaceSurface: View {
  @Environment(SynapseTheme.self) private var theme
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private let layout: SynapseWorkspaceLayout
  private let syncStatus: SynapseSyncStatus
  private let requestedFilesVisibility: Bool
  private let requestedPanelVisibility: Bool
  private let requestedPanel: SynapseWorkspacePanel

  @State private var filesVisible: Bool
  @State private var panelVisible: Bool
  @State private var selectedPanel: SynapseWorkspacePanel
  @State private var selectedTreeItem = "이재명 정부, 불평등과 양극화의 진화"
  @State private var selectedChatID = WorkspaceFixture.chats[0].id
  @State private var activeTab = WorkspaceFixture.tabs.last!
  @State private var searchText = ""
  @State private var documentTitle = "이재명 정부, 불평등과 양극화의 진화"
  @State private var propertiesExpanded = true
  @State private var expandedGroups: Set<String> = ["Chat", "Research", "note", "지대모"]
  @State private var activeFormats: Set<String> = []
  @State private var draft = ""
  @State private var chatMessages = WorkspaceFixture.messages
  @State private var sharePresented = false
  @State private var settingsPresented = false
  @State private var helpPresented = false

  public init(
    layout: SynapseWorkspaceLayout,
    syncStatus: SynapseSyncStatus = .synced,
    showsFileSidebar: Bool = true,
    showsAssistantPanel: Bool = true,
    selectedPanel: SynapseWorkspacePanel = .chat
  ) {
    self.layout = layout
    self.syncStatus = syncStatus
    requestedFilesVisibility = showsFileSidebar
    requestedPanelVisibility = showsAssistantPanel
    requestedPanel = selectedPanel
    _filesVisible = State(initialValue: showsFileSidebar)
    _panelVisible = State(initialValue: showsAssistantPanel)
    _selectedPanel = State(initialValue: selectedPanel)
  }

  public var body: some View {
    let colors = theme.colors(for: colorScheme, contrast: contrast)

    HStack(spacing: 0) {
      if showsFiles {
        projectSidebar(colors: colors)
          .frame(width: layout == .desktop ? 224 : 210)

        Divider()
      }

      documentWorkspace(colors: colors)
        .layoutPriority(1)

      if showsPanel {
        Divider()

        documentPanel(colors: colors)
          .frame(width: 304)
          .transition(.move(edge: .trailing).combined(with: .opacity))
      }
    }
    .background(colors.canvas)
    .animation(reduceMotion ? nil : SynapseMotion.reveal, value: panelVisible)
    .animation(reduceMotion ? nil : SynapseMotion.reveal, value: filesVisible)
    .onChange(of: requestedFilesVisibility) { _, value in filesVisible = value }
    .onChange(of: requestedPanelVisibility) { _, value in panelVisible = value }
    .onChange(of: requestedPanel) { _, value in selectedPanel = value }
  }

  private var showsFiles: Bool {
    layout != .compact && filesVisible
  }

  private var showsPanel: Bool {
    layout == .desktop && panelVisible
  }

  private func projectSidebar(colors: SynapseColorRoles) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 2) {
        Spacer()
        toolbarButton("point.3.connected.trianglepath.dotted", label: "그래프") {}
        toolbarButton("calendar", label: "오늘의 노트") {}
        toolbarButton("plus", label: "추가") {}
      }
      .padding(.horizontal, 8)
      .frame(height: 38)

      TextField("Search", text: $searchText)
        .textFieldStyle(.roundedBorder)
        .controlSize(.small)
        .padding(.horizontal, 8)
        .padding(.bottom, 8)

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 2) {
          sidebarSectionHeader("Chat", trailingSymbol: "plus")

          if expandedGroups.contains("Chat") {
            ForEach(filteredChats) { chat in
              chatRow(chat, colors: colors)
            }
          }

          Divider()
            .padding(.vertical, 6)

          sidebarSectionHeader("Research", trailingSymbol: "line.3.horizontal.decrease")

          if expandedGroups.contains("Research") {
            ForEach(WorkspaceFixture.tree) { item in
              treeRow(item, colors: colors)
            }
          }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 10)
      }

      Divider()

      VStack(alignment: .leading, spacing: 3) {
        HStack {
          Text("Research")
            .font(.caption.weight(.medium))
          Spacer()
          Image(systemName: "chevron.up.chevron.down")
            .font(.caption2)
            .foregroundStyle(colors.contentSecondary)
        }
        Label("main", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
          .font(.caption2)
          .foregroundStyle(colors.contentSecondary)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
    }
    .background(.thinMaterial)
  }

  private func sidebarSectionHeader(_ title: String, trailingSymbol: String) -> some View {
    HStack(spacing: 6) {
      Button {
        if expandedGroups.contains(title) {
          expandedGroups.remove(title)
        } else {
          expandedGroups.insert(title)
        }
      } label: {
        HStack(spacing: 5) {
          Image(systemName: expandedGroups.contains(title) ? "chevron.down" : "chevron.right")
            .font(.caption2)
          Text(title)
            .font(.caption.weight(.medium))
        }
      }
      .buttonStyle(.plain)

      Spacer()

      toolbarButton(trailingSymbol, label: "\(title) 작업") {}
    }
    .padding(.horizontal, 5)
    .frame(height: 26)
  }

  private func chatRow(_ chat: WorkspaceChatSummary, colors: SynapseColorRoles) -> some View {
    Button {
      selectedChatID = chat.id
      selectedPanel = .chat
      panelVisible = true
    } label: {
      HStack(spacing: 6) {
        Image(systemName: chat.provider == "CODEX" ? "sparkle" : "sun.max.fill")
          .font(.caption2)
          .foregroundStyle(chat.provider == "CODEX" ? colors.accent : .orange)
          .frame(width: 14)

        Text(chat.title)
          .font(.caption)
          .foregroundStyle(colors.contentPrimary)
          .lineLimit(1)

        Spacer(minLength: 4)

        Text(chat.provider)
          .font(.system(.caption2, design: .rounded))
          .foregroundStyle(colors.contentSecondary)
      }
      .padding(.horizontal, 6)
      .frame(height: 24)
      .background(selectedChatID == chat.id ? colors.elevatedSurface : .clear)
      .clipShape(RoundedRectangle(cornerRadius: theme.selectionRadius, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func treeRow(_ item: WorkspaceTreeItem, colors: SynapseColorRoles) -> some View {
    Button {
      if item.isFolder {
        if expandedGroups.contains(item.title) {
          expandedGroups.remove(item.title)
        } else {
          expandedGroups.insert(item.title)
        }
      } else {
        selectedTreeItem = item.title
        documentTitle = item.title
        if !WorkspaceFixture.tabs.contains(item.title) {
          activeTab = item.title
        }
      }
    } label: {
      HStack(spacing: 4) {
        Color.clear.frame(width: CGFloat(item.depth) * 12)

        Image(systemName: item.isFolder
          ? (expandedGroups.contains(item.title) ? "chevron.down" : "chevron.right")
          : item.symbol)
          .font(.caption2)
          .foregroundStyle(item.isFolder ? colors.contentSecondary : fileColor(for: item))
          .frame(width: 12)

        Text(item.title)
          .font(.caption)
          .foregroundStyle(colors.contentPrimary)
          .lineLimit(1)

        Spacer(minLength: 2)

        if let fileType = item.fileType {
          Text(fileType)
            .font(.caption2)
            .foregroundStyle(colors.contentSecondary)
        }
      }
      .padding(.horizontal, 5)
      .frame(height: 22)
      .background(selectedTreeItem == item.title ? colors.accentSurface : .clear)
      .clipShape(RoundedRectangle(cornerRadius: theme.selectionRadius, style: .continuous))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func documentWorkspace(colors: SynapseColorRoles) -> some View {
    VStack(spacing: 0) {
      documentTabs(colors: colors)
      editingToolbar(colors: colors)
      Divider()

      ScrollView {
        article(colors: colors)
          .frame(maxWidth: theme.documentWidth, alignment: .leading)
          .padding(.horizontal, layout == .compact ? 22 : 30)
          .padding(.top, 26)
          .padding(.bottom, 72)
          .frame(maxWidth: .infinity)
      }
      .background(colors.canvas)

      Divider()

      HStack {
        Label("note / 지대모", systemImage: "folder")
        Spacer()
        SynapseStatusBadge(status: syncStatus)
        Text("1,998 words   9,170 chars   ~2,293 tokens")
          .monospacedDigit()
      }
      .font(.caption2)
      .foregroundStyle(colors.contentSecondary)
      .padding(.horizontal, 10)
      .frame(height: 26)
      .background(colors.elevatedSurface.opacity(0.42))
    }
  }

  private func documentTabs(colors: SynapseColorRoles) -> some View {
    HStack(spacing: 4) {
      toolbarButton("sidebar.left", label: showsFiles ? "파일 숨기기" : "파일 보기") {
        filesVisible.toggle()
      }
      toolbarButton("chevron.left", label: "뒤로") {}
        .disabled(true)
      toolbarButton("chevron.right", label: "앞으로") {}
        .disabled(true)

      ScrollView(.horizontal) {
        HStack(spacing: 2) {
          ForEach(WorkspaceFixture.tabs, id: \.self) { tab in
            Button {
              activeTab = tab
              documentTitle = tab
            } label: {
              Text(tab)
                .font(.caption)
                .lineLimit(1)
                .padding(.horizontal, 9)
                .frame(height: 28)
                .background(activeTab == tab ? colors.elevatedSurface : .clear)
                .clipShape(RoundedRectangle(cornerRadius: theme.controlRadius, style: .continuous))
            }
            .buttonStyle(.plain)
          }
        }
      }
      .scrollIndicators(.hidden)

      Spacer(minLength: 4)

      toolbarButton("square.and.arrow.up", label: "공유") {
        sharePresented.toggle()
      }
      .popover(isPresented: $sharePresented) {
        VStack(alignment: .leading, spacing: 8) {
          Text("문서 공유").font(.headline)
          Text("이 디자인 단계에서는 공유 대상과 권한 위계를 검토합니다.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding()
        .frame(width: 260)
      }

      toolbarButton("gearshape", label: "설정") {
        settingsPresented.toggle()
      }
      .popover(isPresented: $settingsPresented) {
        Form {
          LabeledContent("편집 모드", value: "Visual editor")
          Toggle("Properties", isOn: $propertiesExpanded)
        }
        .formStyle(.grouped)
        .frame(width: 280, height: 150)
      }

      toolbarButton("questionmark.circle", label: "도움말") {
        helpPresented.toggle()
      }
      .popover(isPresented: $helpPresented) {
        Text("SynapseNote keyboard shortcuts")
          .font(.callout)
          .padding()
      }

      if layout == .desktop {
        toolbarButton("sidebar.right", label: showsPanel ? "패널 숨기기" : "패널 보기") {
          panelVisible.toggle()
        }
      }
    }
    .padding(.horizontal, 8)
    .frame(height: 40)
    .background(colors.elevatedSurface.opacity(0.34))
  }

  private func editingToolbar(colors: SynapseColorRoles) -> some View {
    HStack(spacing: 5) {
      Text("note")
      Image(systemName: "chevron.right")
        .font(.caption2)
      Text("지대모")
      Image(systemName: "chevron.right")
        .font(.caption2)
      Text("\(documentTitle.prefix(22))")
        .foregroundStyle(colors.contentPrimary)

      Spacer(minLength: 8)

      ForEach(WorkspaceFixture.formatTools, id: \.id) { tool in
        formatButton(tool, colors: colors)
      }

      Divider().frame(height: 18)

      Text("Visual")
        .font(.caption2.weight(.medium))
        .foregroundStyle(colors.contentSecondary)
    }
    .font(.caption2)
    .foregroundStyle(colors.contentSecondary)
    .padding(.horizontal, 10)
    .frame(height: 34)
    .background(colors.canvas)
  }

  private func formatButton(_ tool: WorkspaceFormatTool, colors: SynapseColorRoles) -> some View {
    Button {
      if activeFormats.contains(tool.id) {
        activeFormats.remove(tool.id)
      } else {
        activeFormats.insert(tool.id)
      }
    } label: {
      Group {
        if let symbol = tool.symbol {
          Image(systemName: symbol)
        } else {
          Text(tool.label)
        }
      }
      .font(.caption2.weight(tool.id == "bold" ? .bold : .regular))
      .frame(minWidth: 20, minHeight: 20)
      .background(activeFormats.contains(tool.id) ? colors.elevatedSurface : .clear)
      .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(tool.accessibilityLabel)
  }

  private func article(colors: SynapseColorRoles) -> some View {
    VStack(alignment: .leading, spacing: 20) {
      TextField("제목 없음", text: $documentTitle)
        .textFieldStyle(.plain)
        .font(SynapseTypography.documentTitle)
        .foregroundStyle(colors.contentPrimary)

      DisclosureGroup(isExpanded: $propertiesExpanded) {
        properties(colors: colors)
          .padding(.top, 8)
      } label: {
        Text("Properties")
          .font(.callout.weight(.medium))
      }
      .tint(colors.contentSecondary)

      VStack(alignment: .leading, spacing: 9) {
        Text(documentTitle)
          .font(.title2.weight(.semibold))

        calloutLine("관측 기간", "2025년 6월 4일 정부 출범 이후부터 2026년 8월 24일 현재 확인 가능한 최신 공표치")
        calloutLine("분석 범위", "가계소득·소비, 물가·실질임금, 청년·산업별 고용, 주택가격, 대출금리와 가계신용")
        calloutLine("독해 원칙", "공식 통계는 관측된 변화를, 인터뷰는 정책적 해석과 처방을 제시한다.")
      }
      .padding(.leading, 12)
      .overlay(alignment: .leading) {
        Rectangle()
          .fill(colors.separator)
          .frame(width: 2)
      }

      articleHeading("요약")

      Text("이재명 정부 출범 이후의 불평등은 가계수지·주거 접근성·안정적 일자리·금융비용에서 나타나는 격차가 서로 겹치는 현상으로 볼 수 있다. 2026년 1분기 소득 1분위 가구는 소득이 전년동기보다 2.7% 늘었지만 소비지출은 7.3% 늘어 월 적자가 약 8만1천원 확대됐다.")
        .font(SynapseTypography.documentBody)
        .lineSpacing(5)

      Text(
        "\(Text("최배근 교수의 인터뷰·스크린샷 노트").foregroundStyle(colors.accent).underline())를 이 자료에 겹쳐 읽으면, 하나의 정책적 논리가 드러난다. 가계소득 확대와 내수 회복을 지속적 성장의 선행 조건으로 본다."
      )
        .font(SynapseTypography.documentBody)
        .lineSpacing(5)

      Text("공식 통계는 취약 집단이 실제로 어떤 부담을 겪는지 보여주며, 인터뷰는 그 부담을 어떤 경제구조와 정책철학으로 설명할지를 제안한다.")
        .font(SynapseTypography.documentBody)
        .lineSpacing(5)

      articleHeading("핵심 지표")
      metricTable(colors: colors)

      articleHeading("1. 통계가 보여주는 양극화의 현재 모습")
      articleSubheading("1.1 소득 양극화는 ‘가계수지 양극화’로 나타난다")
      Text("2026년 1분기 1분위 가구의 월평균 소득은 117만원, 처분가능소득은 93만8천원, 소비지출은 145만7천원이었다. 처분가능소득보다 51만9천원을 더 썼고 평균소비성향은 155.3%였다.")
        .font(SynapseTypography.documentBody)
        .lineSpacing(5)
    }
    .foregroundStyle(colors.contentPrimary)
  }

  private func properties(colors: SynapseColorRoles) -> some View {
    Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 9) {
      propertyRow(symbol: "textformat", name: "title") {
        Text(documentTitle).lineLimit(1)
      }
      propertyRow(symbol: "text.alignleft", name: "description") {
        Text("공식 통계와 인터뷰를 구분해 양극화의 관측과 정책 논리를 연결한 분석")
          .lineLimit(1)
      }
      propertyRow(symbol: "tag", name: "tags") {
        HStack(spacing: 4) {
          ForEach(["지대모", "불평등", "양극화", "민생경제"], id: \.self) { tag in
            Text(tag)
              .font(.caption2)
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .foregroundStyle(.orange)
              .background(.orange.opacity(0.10))
              .clipShape(Capsule())
          }
        }
      }
    }
    .font(.caption)
    .foregroundStyle(colors.contentSecondary)
  }

  private func propertyRow<Content: View>(
    symbol: String,
    name: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    GridRow {
      Image(systemName: symbol).frame(width: 14)
      Text(name).frame(width: 72, alignment: .leading)
      content().foregroundStyle(.primary)
    }
  }

  private func calloutLine(_ label: String, _ value: String) -> some View {
    Text("\(Text("\(label): ").bold())\(value)")
      .font(.callout)
      .fixedSize(horizontal: false, vertical: true)
  }

  private func articleHeading(_ title: String) -> some View {
    Text(title)
      .font(.title2.weight(.bold))
      .padding(.top, 4)
  }

  private func articleSubheading(_ title: String) -> some View {
    Text(title)
      .font(.title3.weight(.semibold))
  }

  private func metricTable(colors: SynapseColorRoles) -> some View {
    Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 0) {
      GridRow {
        tableCell("영역", header: true)
        tableCell("비교", header: true)
        tableCell("관측된 변화", header: true)
        tableCell("비고", header: true)
      }

      ForEach(WorkspaceFixture.metrics) { metric in
        Divider().gridCellColumns(4)
        GridRow {
          tableCell(metric.area)
          tableCell(metric.comparison)
          tableCell(metric.change, emphasized: true)
          tableCell(metric.note)
        }
      }
    }
    .padding(.horizontal, 10)
    .background(colors.elevatedSurface.opacity(0.32))
    .overlay {
      RoundedRectangle(cornerRadius: theme.selectionRadius, style: .continuous)
        .stroke(colors.separator, lineWidth: 1)
    }
  }

  private func tableCell(_ value: String, header: Bool = false, emphasized: Bool = false) -> some View {
    Text(value)
      .font(header ? .caption.weight(.semibold) : .caption)
      .fontWeight(emphasized ? .semibold : .regular)
      .foregroundStyle(header ? Color.secondary : Color.primary)
      .lineLimit(2)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func documentPanel(colors: SynapseColorRoles) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        ForEach(SynapseWorkspacePanel.allCases) { panel in
          Button {
            selectedPanel = panel
          } label: {
            VStack(spacing: 5) {
              Text(panel.title)
                .font(.caption.weight(selectedPanel == panel ? .semibold : .regular))
                .foregroundStyle(selectedPanel == panel ? colors.contentPrimary : colors.contentSecondary)

              Rectangle()
                .fill(selectedPanel == panel ? colors.contentPrimary : .clear)
                .frame(height: 1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      .padding(.horizontal, 10)
      .frame(height: 40)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Document panel")

      Divider()

      switch selectedPanel {
      case .chat:
        chatPanel(colors: colors)
      case .outline:
        outlinePanel(colors: colors)
      case .links:
        linksPanel(colors: colors)
      }
    }
    .background(.thinMaterial)
  }

  private func chatPanel(colors: SynapseColorRoles) -> some View {
    VStack(spacing: 0) {
      HStack {
        Text("GPT-5.6 Terra")
          .font(.caption.weight(.medium))
        Text("High")
          .font(.caption2)
          .foregroundStyle(colors.contentSecondary)
        Spacer()
        toolbarButton("arrow.clockwise", label: "새로고침") {}
        toolbarButton("ellipsis", label: "채팅 메뉴") {}
      }
      .padding(.horizontal, 10)
      .frame(height: 34)

      Divider()

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 14) {
          attachedContext(colors: colors)

          ForEach(chatMessages) { message in
            chatMessage(message, colors: colors)
          }
        }
        .padding(12)
      }

      Divider()

      HStack(alignment: .bottom, spacing: 7) {
        TextField("Message Codex", text: $draft, axis: .vertical)
          .textFieldStyle(.plain)
          .lineLimit(1...4)

        Button(action: sendMessage) {
          Image(systemName: "arrow.up")
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.circle)
        .controlSize(.small)
        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityLabel("메시지 보내기")
      }
      .padding(9)
      .background(colors.canvas)
    }
  }

  private func attachedContext(colors: SynapseColorRoles) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Image(systemName: "doc.text")
          .foregroundStyle(colors.accent)
        VStack(alignment: .leading, spacing: 1) {
          Text("이재명 정부, 불평등과 양극화의 진화")
            .font(.caption.weight(.medium))
            .lineLimit(1)
          Text("Selection · 1 line selected")
            .font(.caption2)
            .foregroundStyle(colors.contentSecondary)
        }
        Spacer()
        Image(systemName: "chevron.down")
          .font(.caption2)
          .foregroundStyle(colors.contentSecondary)
      }

      Text("가계소득 확대와 내수 회복을 지속적 성장의 선행 조건으로 본다.")
        .font(.caption)
        .foregroundStyle(colors.contentSecondary)
        .lineLimit(2)
    }
    .padding(9)
    .background(colors.elevatedSurface)
    .clipShape(RoundedRectangle(cornerRadius: theme.panelRadius, style: .continuous))
  }

  private func chatMessage(_ message: WorkspaceChatMessage, colors: SynapseColorRoles) -> some View {
    HStack {
      if message.isUser { Spacer(minLength: 34) }

      Text(message.text)
        .font(.callout)
        .foregroundStyle(message.isUser ? Color.white : colors.contentPrimary)
        .lineSpacing(3)
        .padding(message.isUser ? 9 : 0)
        .background(message.isUser ? colors.accent : .clear)
        .clipShape(RoundedRectangle(cornerRadius: theme.panelRadius, style: .continuous))

      if !message.isUser { Spacer(minLength: 12) }
    }
  }

  private func outlinePanel(colors: SynapseColorRoles) -> some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 2) {
        ForEach(Array(WorkspaceFixture.outline.enumerated()), id: \.offset) { index, heading in
          Button {
            activeFormats = ["outline-\(index)"]
          } label: {
            Text(heading.title)
              .font(heading.level == 1 ? .callout.weight(.semibold) : .caption)
              .foregroundStyle(colors.contentPrimary)
              .padding(.leading, CGFloat(heading.level - 1) * 12)
              .frame(maxWidth: .infinity, minHeight: 27, alignment: .leading)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
      .padding(10)
    }
  }

  private func linksPanel(colors: SynapseColorRoles) -> some View {
    List {
      Section("Backlinks") {
        Label("지대모 260821", systemImage: "arrow.turn.down.right")
        Label("메모리 투자가 가져오는 메모리 위기의 역설", systemImage: "arrow.turn.down.right")
      }
      Section("References") {
        Label("통계청 가계동향조사", systemImage: "link")
        Label("한국부동산원 월간동향", systemImage: "link")
      }
    }
    .listStyle(.sidebar)
    .font(.caption)
    .scrollContentBackground(.hidden)
    .foregroundStyle(colors.contentPrimary)
  }

  private func toolbarButton(
    _ symbol: String,
    label: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .frame(width: 17, height: 17)
    }
    .buttonStyle(.borderless)
    .controlSize(.small)
    .accessibilityLabel(label)
    .help(label)
  }

  private func fileColor(for item: WorkspaceTreeItem) -> Color {
    switch item.fileType {
    case "PNG": .pink
    case "MD": .blue
    default: .secondary
    }
  }

  private var filteredChats: [WorkspaceChatSummary] {
    guard !searchText.isEmpty else { return WorkspaceFixture.chats }
    return WorkspaceFixture.chats.filter {
      $0.title.localizedCaseInsensitiveContains(searchText)
    }
  }

  private func sendMessage() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    chatMessages.append(WorkspaceChatMessage(text: text, isUser: true))
    draft = ""
  }
}

private struct WorkspaceChatSummary: Identifiable {
  let id = UUID()
  let title: String
  let provider: String
}

private struct WorkspaceTreeItem: Identifiable {
  let id = UUID()
  let title: String
  let depth: Int
  let isFolder: Bool
  let symbol: String
  let fileType: String?

  init(
    _ title: String,
    depth: Int,
    isFolder: Bool = false,
    symbol: String = "doc.text",
    fileType: String? = nil
  ) {
    self.title = title
    self.depth = depth
    self.isFolder = isFolder
    self.symbol = symbol
    self.fileType = fileType
  }
}

private struct WorkspaceFormatTool {
  let id: String
  let label: String
  let symbol: String?
  let accessibilityLabel: String
}

private struct WorkspaceMetric: Identifiable {
  let id = UUID()
  let area: String
  let comparison: String
  let change: String
  let note: String
}

private struct WorkspaceChatMessage: Identifiable {
  let id = UUID()
  let text: String
  let isUser: Bool
}

private enum WorkspaceFixture {
  static let tabs = [
    "메모리 투자가 가져오는 메모리 위기의 역설",
    "지대모 260821",
    "이재명 정부, 불평등과 양극화의 진화",
  ]

  static let chats = [
    WorkspaceChatSummary(title: "이 지점에서 수요-공급의 균형점을…", provider: "CODEX"),
    WorkspaceChatSummary(title: "메모리 3사 증산 공급량", provider: "CLAUDE"),
    WorkspaceChatSummary(title: "아무 문장이나 10문장 이 문서에…", provider: "CODEX"),
    WorkspaceChatSummary(title: "데이터로 살펴보는 현재 반도체 시장…", provider: "CODEX"),
    WorkspaceChatSummary(title: "여기 바로 아래에 세계 공급망을…", provider: "CODEX"),
  ]

  static let tree = [
    WorkspaceTreeItem("brain", depth: 0, isFolder: true),
    WorkspaceTreeItem("daily", depth: 0, isFolder: true),
    WorkspaceTreeItem("external-sources", depth: 0, isFolder: true),
    WorkspaceTreeItem("note", depth: 0, isFolder: true),
    WorkspaceTreeItem("benchmark", depth: 1, isFolder: true),
    WorkspaceTreeItem("concept", depth: 1, isFolder: true),
    WorkspaceTreeItem("english", depth: 1, isFolder: true),
    WorkspaceTreeItem("entity", depth: 1, isFolder: true),
    WorkspaceTreeItem("projects", depth: 1, isFolder: true),
    WorkspaceTreeItem("reading", depth: 1, isFolder: true),
    WorkspaceTreeItem("지대모", depth: 1, isFolder: true),
    WorkspaceTreeItem("pasted-20260821-074515", depth: 2, symbol: "photo", fileType: "PNG"),
    WorkspaceTreeItem("pasted-20260821-074706", depth: 2, symbol: "photo", fileType: "PNG"),
    WorkspaceTreeItem("메모리 투자가 가져오는 메모리 위기의 역설", depth: 2, fileType: "MD"),
    WorkspaceTreeItem("이재명 정부, 불평등과 양극화의 진화", depth: 2, fileType: "MD"),
    WorkspaceTreeItem("지대모 260821", depth: 2, fileType: "MD"),
  ]

  static let formatTools = [
    WorkspaceFormatTool(id: "h1", label: "H1", symbol: nil, accessibilityLabel: "제목 1"),
    WorkspaceFormatTool(id: "h2", label: "H2", symbol: nil, accessibilityLabel: "제목 2"),
    WorkspaceFormatTool(id: "bold", label: "B", symbol: "bold", accessibilityLabel: "굵게"),
    WorkspaceFormatTool(id: "italic", label: "I", symbol: "italic", accessibilityLabel: "기울임"),
    WorkspaceFormatTool(id: "list", label: "List", symbol: "list.bullet", accessibilityLabel: "목록"),
    WorkspaceFormatTool(id: "quote", label: "Quote", symbol: "quote.opening", accessibilityLabel: "인용"),
    WorkspaceFormatTool(id: "link", label: "Link", symbol: "link", accessibilityLabel: "링크"),
    WorkspaceFormatTool(id: "table", label: "Table", symbol: "tablecells", accessibilityLabel: "표"),
  ]

  static let metrics = [
    WorkspaceMetric(area: "소득 1분위 소득", comparison: "2026년 1분기", change: "+2.7%", note: "명목소득 증가"),
    WorkspaceMetric(area: "소득 1분위 소비", comparison: "같은 기간", change: "+7.3%", note: "소득보다 빠른 증가"),
    WorkspaceMetric(area: "서울 아파트", comparison: "2025.6 → 2026.7", change: "+12.12%", note: "진입비용 압력"),
  ]

  static let outline = [
    (level: 1, title: "요약"),
    (level: 1, title: "핵심 지표"),
    (level: 1, title: "1. 통계가 보여주는 양극화의 현재 모습"),
    (level: 2, title: "1.1 소득 양극화는 가계수지 양극화로 나타난다"),
    (level: 2, title: "1.2 소비 증가는 곧 생활개선도, 물가충격도 아니다"),
    (level: 2, title: "1.3 주택가격·임차비용·금융비용이 동시에 올랐다"),
  ]

  static let messages = [
    WorkspaceChatMessage(text: "이건 Not A But B 구조야. 이거 절대 쓰지마.", isUser: true),
    WorkspaceChatMessage(
      text: "선택 문장을 직접적인 인과 서술로 바꾸고, 앞으로도 같은 대비형 문장 구조를 사용하지 않겠습니다.",
      isUser: false
    ),
    WorkspaceChatMessage(text: "Not A But B 구조. 수정", isUser: true),
    WorkspaceChatMessage(
      text: "수정했습니다. ‘가계소득 확대와 내수 회복을 지속적 성장의 선행 조건으로 본다’로 정리했습니다.",
      isUser: false
    ),
  ]
}

#Preview("macOS workspace") {
  SynapseWorkspaceSurface(layout: .desktop)
    .synapseTheme(SynapseTheme())
    .frame(width: 1280, height: 820)
}

#Preview("iPad workspace") {
  SynapseWorkspaceSurface(layout: .split)
    .synapseTheme(SynapseTheme())
    .frame(width: 1024, height: 860)
}

#Preview("iPhone workspace") {
  SynapseWorkspaceSurface(layout: .compact, syncStatus: .offline)
    .synapseTheme(SynapseTheme())
    .frame(width: 430, height: 860)
}
