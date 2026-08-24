// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "SynapseApple",
  platforms: [
    .iOS(.v26),
    .macOS(.v26),
  ],
  products: [
    .library(
      name: "SynapseDesignSystem",
      targets: ["SynapseDesignSystem"]
    ),
  ],
  targets: [
    .target(name: "SynapseDesignSystem"),
    .testTarget(
      name: "SynapseDesignSystemTests",
      dependencies: ["SynapseDesignSystem"]
    ),
  ]
)
