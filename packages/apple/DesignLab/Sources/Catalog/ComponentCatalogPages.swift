import SwiftUI
import SynapseDesignSystem

@MainActor
struct ButtonsCatalogPage: View {
  let catalog: CatalogModel

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Interactive preview",
        description: "오른쪽 패널에서 role, enabled, loading 값을 조정합니다."
      ) {
        SynapseButton(
          "새 문서",
          role: catalog.buttonRole,
          isLoading: catalog.componentLoading
        ) {}
        .disabled(!catalog.componentEnabled)
      }

      CatalogSectionView(
        "State table",
        description: "각 역할의 기본, 비활성, 로딩 상태를 같은 조건에서 비교합니다."
      ) {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 14) {
          GridRow {
            Text("Role")
            StateColumnTitle("Default")
            StateColumnTitle("Disabled")
            StateColumnTitle("Loading")
          }

          ForEach(SynapseButtonRole.allCases) { role in
            GridRow {
              Text(role.title)
                .font(.caption.weight(.semibold))
              SynapseButton("Continue", role: role) {}
              SynapseButton("Continue", role: role) {}
                .disabled(true)
              SynapseButton("Continue", role: role, isLoading: true) {}
            }
          }
        }
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "Primary는 한 화면의 핵심 진행 동작 하나에 사용합니다.",
            "Secondary는 결과가 같은 수준의 보조 동작에 사용합니다.",
            "Quiet는 도구막대와 저강도 문맥 작업에 사용합니다.",
            "비동기 작업은 같은 버튼 안에서 로딩 상태를 유지합니다.",
          ],
          avoid: [
            "한 화면에 여러 Primary 버튼을 배치하지 않습니다.",
            "색상만 바꾼 별도 버튼 타입을 만들지 않습니다.",
            "로딩 중 버튼을 제거해 레이아웃을 흔들지 않습니다.",
          ]
        )
      }
    }
  }
}

@MainActor
struct IconButtonsCatalogPage: View {
  let catalog: CatalogModel

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Interactive preview",
        description: "아이콘 버튼은 항상 접근성 이름과 고정된 hit target을 가집니다."
      ) {
        HStack(spacing: 10) {
          SynapseIconButton(symbol: "square.and.pencil", accessibilityLabel: "새 문서") {}
          SynapseIconButton(symbol: "magnifyingglass", accessibilityLabel: "검색") {}
          SynapseIconButton(symbol: "ellipsis", accessibilityLabel: "추가 작업") {}
        }
        .disabled(!catalog.componentEnabled)
      }

      CatalogSectionView("State table") {
        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 12) {
          GridRow {
            Text("State")
            StateColumnTitle("New document")
            StateColumnTitle("Search")
            StateColumnTitle("More")
          }
          GridRow {
            Text("Default").font(.caption.weight(.semibold))
            SynapseIconButton(symbol: "square.and.pencil", accessibilityLabel: "새 문서") {}
            SynapseIconButton(symbol: "magnifyingglass", accessibilityLabel: "검색") {}
            SynapseIconButton(symbol: "ellipsis", accessibilityLabel: "추가 작업") {}
          }
          GridRow {
            Text("Disabled").font(.caption.weight(.semibold))
            SynapseIconButton(symbol: "square.and.pencil", accessibilityLabel: "새 문서") {}
              .disabled(true)
            SynapseIconButton(symbol: "magnifyingglass", accessibilityLabel: "검색") {}
              .disabled(true)
            SynapseIconButton(symbol: "ellipsis", accessibilityLabel: "추가 작업") {}
              .disabled(true)
          }
        }
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "익숙한 단일 동작을 압축해서 표현할 때 사용합니다.",
            "모든 아이콘 버튼에 동작을 설명하는 접근성 이름을 제공합니다.",
            "도구막대에서는 크기와 정렬선을 일정하게 유지합니다.",
          ],
          avoid: [
            "의미가 모호한 사용자 정의 기호를 설명 없이 사용하지 않습니다.",
            "아이콘 크기를 키우는 방식으로 중요도를 표현하지 않습니다.",
          ]
        )
      }
    }
  }
}

@MainActor
struct DocumentRowsCatalogPage: View {
  @Environment(SynapseTheme.self) private var theme
  let catalog: CatalogModel

  private let document = SynapseDocumentSummary(
    id: UUID(uuidString: "C6A00BBD-BD69-49A6-95A6-A41088383C54")!,
    title: "제품 설계 노트",
    location: "Research/Design",
    modifiedLabel: "방금 전"
  )

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Interactive preview",
        description: "오른쪽 패널에서 선택 상태를 바꾸고 Density 변경을 함께 확인합니다."
      ) {
        SynapseDocumentRow(document: document, isSelected: catalog.documentRowSelected)
          .frame(maxWidth: 320)
      }

      CatalogSectionView("State table") {
        Grid(alignment: .leading, horizontalSpacing: 22, verticalSpacing: 10) {
          GridRow {
            Text("State")
            StateColumnTitle("Rendered row")
            StateColumnTitle("Contract")
          }
          GridRow {
            Text("Default").font(.caption.weight(.semibold))
            SynapseDocumentRow(document: document, isSelected: false)
              .frame(width: 300)
            Text("contentPrimary · transparent surface")
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
          }
          GridRow {
            Text("Selected").font(.caption.weight(.semibold))
            SynapseDocumentRow(document: document, isSelected: true)
              .frame(width: 300)
            Text("accent · accentSurface · isSelected")
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
          }
        }
      }

      CatalogSectionView("Token dependencies") {
        TokenDefinitionTable(tokens: [
          TokenDefinition(
            name: "rowHeight", value: point(theme.spacing.rowHeight), purpose: "최소 선택 높이"),
          TokenDefinition(name: "small", value: point(theme.spacing.small), purpose: "아이콘과 텍스트 간격"),
          TokenDefinition(
            name: "controlRadius", value: point(theme.controlRadius), purpose: "선택 표면 형태"),
        ])
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "문서 정체성은 제목을 우선하고 위치와 수정 시각을 보조 정보로 둡니다.",
            "선택 상태는 표면, 아이콘, 접근성 trait를 함께 변경합니다.",
          ],
          avoid: [
            "각 문서 행을 독립적인 카드로 만들지 않습니다.",
            "선택 전후에 행 높이와 텍스트 위치가 움직이지 않게 합니다.",
          ]
        )
      }
    }
  }

  private func point(_ value: CGFloat) -> String {
    "\(Double(value).formatted(.number.precision(.fractionLength(0...1)))) pt"
  }
}

@MainActor
struct StatusBadgesCatalogPage: View {
  let catalog: CatalogModel

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Interactive preview",
        description: "오른쪽 패널에서 상태를 변경해 의미와 대비를 확인합니다."
      ) {
        SynapseStatusBadge(status: catalog.syncStatus)
      }

      CatalogSectionView("State table") {
        Grid(alignment: .leading, horizontalSpacing: 22, verticalSpacing: 14) {
          GridRow {
            Text("Status")
            StateColumnTitle("Rendered badge")
            StateColumnTitle("Meaning")
          }
          ForEach(SynapseSyncStatus.allCases) { status in
            GridRow {
              Text(status.title).font(.caption.weight(.semibold))
              SynapseStatusBadge(status: status)
              Text(meaning(for: status))
                .font(.callout)
                .foregroundStyle(.secondary)
            }
          }
        }
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "상태 이름, 아이콘, 색상을 항상 함께 표시합니다.",
            "사용자가 조치할 수 있는 Offline과 Conflict를 지속적으로 노출합니다.",
          ],
          avoid: [
            "정상 상태를 과도한 성공 색상이나 애니메이션으로 강조하지 않습니다.",
            "Syncing을 완료 상태처럼 고정해서 보여주지 않습니다.",
          ]
        )
      }
    }
  }

  private func meaning(for status: SynapseSyncStatus) -> String {
    switch status {
    case .synced: "서버와 로컬 상태가 일치함"
    case .syncing: "로컬 또는 원격 변경을 교환 중"
    case .offline: "로컬 편집은 가능하지만 서버에 연결되지 않음"
    case .conflict: "사용자 판단이 필요한 상태 불일치"
    }
  }
}

private struct StateColumnTitle: View {
  let title: String

  init(_ title: String) {
    self.title = title
  }

  var body: some View {
    Text(title)
      .font(.caption.weight(.semibold))
      .foregroundStyle(.secondary)
  }
}
