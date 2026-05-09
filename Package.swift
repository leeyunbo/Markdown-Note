// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MarkdownEditor",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "MarkdownEditor", targets: ["MarkdownEditor"])
    ],
    targets: [
        .executableTarget(
            name: "MarkdownEditor",
            resources: [
                .process("Resources/editor.html"),
                .process("Resources/editor.js")
            ]
        )
    ]
)
