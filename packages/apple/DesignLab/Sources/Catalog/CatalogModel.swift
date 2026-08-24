import Observation
import SwiftUI
import SynapseDesignSystem

enum CatalogGroup: String, CaseIterable, Identifiable {
  case foundations = "Foundations"
  case components = "Components"
  case patterns = "Patterns"

  var id: String { rawValue }
}

enum CatalogItem: String, CaseIterable, Identifiable {
  case colors
  case typography
  case spacing
  case shape
  case motion
  case buttons
  case iconButtons
  case documentRows
  case statusBadges
  case workspace

  var id: String { rawValue }

  var group: CatalogGroup {
    switch self {
    case .colors, .typography, .spacing, .shape, .motion: .foundations
    case .buttons, .iconButtons, .documentRows, .statusBadges: .components
    case .workspace: .patterns
    }
  }

  var title: String {
    switch self {
    case .colors: "Color roles"
    case .typography: "Typography"
    case .spacing: "Spacing"
    case .shape: "Shape"
    case .motion: "Motion"
    case .buttons: "Buttons"
    case .iconButtons: "Icon buttons"
    case .documentRows: "Document rows"
    case .statusBadges: "Status badges"
    case .workspace: "Workspace"
    }
  }

  var symbol: String {
    switch self {
    case .colors: "swatchpalette"
    case .typography: "textformat"
    case .spacing: "arrow.left.and.right"
    case .shape: "square.on.circle"
    case .motion: "move.3d"
    case .buttons: "button.horizontal"
    case .iconButtons: "ellipsis.circle"
    case .documentRows: "list.bullet.rectangle"
    case .statusBadges: "checkmark.circle"
    case .workspace: "sidebar.left"
    }
  }

  var summary: String {
    switch self {
    case .colors: "표면, 콘텐츠, 상태에 사용하는 의미 기반 색상 역할"
    case .typography: "제품 크롬과 문서 편집기에 공통으로 적용하는 글자 역할"
    case .spacing: "밀도와 배율에 따라 함께 변하는 공간 단위"
    case .shape: "컨트롤, 패널, 선택 상태를 구분하는 모서리 계약"
    case .motion: "상태 변화의 목적과 Reduce Motion 대응을 포함하는 전환 계약"
    case .buttons: "중요도와 진행 상태를 표현하는 의미형 버튼"
    case .iconButtons: "도구막대와 문맥 작업에 사용하는 압축 컨트롤"
    case .documentRows: "문서 탐색에서 선택과 메타데이터를 표현하는 행"
    case .statusBadges: "동기화 상태를 색상, 아이콘, 텍스트로 함께 표현하는 배지"
    case .workspace: "토큰과 컴포넌트를 실제 작업공간에 적용한 기준 패턴"
    }
  }
}

extension CatalogGroup {
  var items: [CatalogItem] {
    CatalogItem.allCases.filter { $0.group == self }
  }
}

enum LabAppearance: String, CaseIterable, Identifiable {
  case light
  case dark

  var id: String { rawValue }
  var title: String { rawValue.capitalized }
  var colorScheme: ColorScheme { self == .light ? .light : .dark }
}

enum CatalogTypeScale: String, CaseIterable, Identifiable {
  case small
  case standard
  case large
  case accessibility

  var id: String { rawValue }

  var title: String {
    switch self {
    case .small: "Small"
    case .standard: "Standard"
    case .large: "Large"
    case .accessibility: "Accessibility"
    }
  }

  var dynamicTypeSize: DynamicTypeSize {
    switch self {
    case .small: .small
    case .standard: .large
    case .large: .xxxLarge
    case .accessibility: .accessibility3
    }
  }
}

enum ViewportPreset: String, CaseIterable, Identifiable {
  case phone
  case tablet
  case desktop

  var id: String { rawValue }

  var title: String {
    switch self {
    case .phone: "iPhone Compact"
    case .tablet: "iPad Regular"
    case .desktop: "macOS Resizable"
    }
  }

  var size: CGSize {
    switch self {
    case .phone: CGSize(width: 390, height: 844)
    case .tablet: CGSize(width: 834, height: 1194)
    case .desktop: CGSize(width: 1280, height: 820)
    }
  }

  var layout: SynapseWorkspaceLayout {
    switch self {
    case .phone: .compact
    case .tablet: .split
    case .desktop: .desktop
    }
  }
}

@MainActor
@Observable
final class CatalogModel {
  var selection: CatalogItem = .colors
  var appearance: LabAppearance = .light
  var typeScale: CatalogTypeScale = .standard
  var viewport: ViewportPreset = .tablet
  var zoom: CGFloat = 0.75
  var syncStatus: SynapseSyncStatus = .synced
  var buttonRole: SynapseButtonRole = .primary
  var componentEnabled = true
  var componentLoading = false
  var documentRowSelected = true

  func reset(theme: SynapseTheme) {
    theme.accent = .iris
    theme.density = .comfortable
    theme.documentWidth = 680
    theme.spacingScale = 1
    theme.cornerScale = 1
    theme.increasedContrastOverride = false
    appearance = .light
    typeScale = .standard
    viewport = .tablet
    zoom = 0.75
    syncStatus = .synced
    buttonRole = .primary
    componentEnabled = true
    componentLoading = false
    documentRowSelected = true
  }
}
