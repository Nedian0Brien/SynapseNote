import SwiftUI
import SynapseDesignSystem

@MainActor
struct WorkspaceCatalogPage: View {
  let catalog: CatalogModel

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      CatalogSectionView(
        "Applied pattern",
        description: "오른쪽 패널에서 Viewport, Zoom, Sync state, Document width를 조정합니다."
      ) {
        ScrollView([.horizontal, .vertical]) {
          SynapseWorkspaceSurface(
            layout: catalog.viewport.layout,
            syncStatus: catalog.syncStatus
          )
          .frame(width: catalog.viewport.size.width, height: catalog.viewport.size.height)
          .scaleEffect(catalog.zoom, anchor: .topLeading)
          .frame(
            width: catalog.viewport.size.width * catalog.zoom,
            height: catalog.viewport.size.height * catalog.zoom,
            alignment: .topLeading
          )
          .overlay(alignment: .topLeading) {
            Rectangle()
              .stroke(.primary.opacity(0.12), lineWidth: 1)
              .allowsHitTesting(false)
          }
        }
        .frame(minHeight: 560)
      }

      CatalogSectionView("Composition contract") {
        TokenDefinitionTable(tokens: [
          TokenDefinition(name: "compact", value: "390 × 844 pt", purpose: "단일 열 iPhone 작업공간"),
          TokenDefinition(name: "split", value: "834 × 1194 pt", purpose: "탐색 + 문서 iPad 작업공간"),
          TokenDefinition(name: "desktop", value: "1280 × 820 pt", purpose: "탐색 + 문서 + 관계 패널"),
        ])
      }

      CatalogSectionView("Usage rules") {
        UsageRulesView(
          use: [
            "같은 선택 상태를 화면 폭에 맞는 열 구조로 표현합니다.",
            "문서 캔버스가 항상 가장 넓고 높은 시각적 우선순위를 가집니다.",
            "관계 패널과 도구는 필요할 때 열고 닫을 수 있습니다.",
          ],
          avoid: [
            "iPhone과 iPad용 화면을 서로 다른 제품처럼 복제하지 않습니다.",
            "사이드바와 인스펙터가 문서 캔버스보다 강한 대비를 갖지 않게 합니다.",
            "뷰포트 프리셋을 실제 기기 감지 로직으로 사용하지 않습니다.",
          ]
        )
      }
    }
  }
}
