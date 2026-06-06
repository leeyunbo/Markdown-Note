import SwiftUI
import AppKit

/// MainWindow가 contentView 위에 깔아두는 SwiftUI hosting wrapper.
/// state.paletteOpen일 때만 palette를 보이고, 평소엔 hit-test 통과시켜
/// 아래 splitVC가 정상 동작.
struct PaletteOverlayWrapper: View {
    @ObservedObject var state: AppState

    var body: some View {
        Group {
            if state.paletteOpen {
                RefractPalette()
                    .environmentObject(state)
                    .transition(.opacity)
            } else {
                Color.clear.allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Refract ⌘K Command/File palette (Spec README §Screen C).
/// 540px wide centered overlay over a dimmed editor. 검색어 + 결과 행 + ↑↓↩ esc.
struct RefractPalette: View {
    @EnvironmentObject var state: AppState
    @State private var query: String = ""
    @State private var selectedIndex: Int = 0
    @FocusState private var fieldFocused: Bool

    private let spectrum: [Color] = [
        Color(red: 99/255, green: 102/255, blue: 241/255),
        Color(red: 14/255, green: 165/255, blue: 233/255),
        Color(red: 16/255, green: 185/255, blue: 129/255),
        Color(red: 245/255, green: 158/255, blue: 11/255),
        Color(red: 239/255, green: 68/255, blue: 68/255),
    ]

    var body: some View {
        ZStack {
            // dim backdrop
            Color.black.opacity(0.30)
                .ignoresSafeArea()
                .onTapGesture { close() }
            // card
            VStack(spacing: 0) {
                searchRow
                Divider().background(state.theme.lineColor)
                resultsList
                footer
            }
            .frame(width: 540)
            .background(state.theme.windowBgColor)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(state.theme.lineColor, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.35), radius: 32, x: 0, y: 12)
            .padding(.top, 80)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            fieldFocused = true
            query = ""
            selectedIndex = 0
        }
    }

    private var searchRow: some View {
        HStack(spacing: 10) {
            // 4-bar spectrum glyph
            HStack(spacing: 2.5) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule().fill(spectrum[i]).frame(width: 3.5, height: 15)
                }
            }
            // search field
            TextField("Find by name…", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 16))
                .foregroundColor(state.theme.inkColor)
                .focused($fieldFocused)
                .onChange(of: query) { _ in selectedIndex = 0 }
                .onSubmit { openSelected() }
            // result count
            Text("\(results.count) results")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(state.theme.subColor)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(KeyEventCatcher(
            onUp: { selectedIndex = max(0, selectedIndex - 1) },
            onDown: { selectedIndex = min(max(results.count - 1, 0), selectedIndex + 1) },
            onEsc: { close() },
            onEnter: { openSelected() }
        ))
    }

    private var resultsList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if results.isEmpty {
                    Text(query.isEmpty ? "Type to search" : "No matches")
                        .font(.system(size: 12))
                        .foregroundColor(state.theme.subColor)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 28)
                }
                ForEach(Array(results.enumerated()), id: \.offset) { idx, item in
                    resultRow(item: item, active: idx == selectedIndex)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedIndex = idx
                            openSelected()
                        }
                }
            }
        }
        .frame(maxHeight: 360)
    }

    private func resultRow(item: PaletteItem, active: Bool) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(typeColor(item.kind))
                .frame(width: 6, height: 6)
            Text(item.name)
                .font(.system(size: 13, weight: active ? .semibold : .regular))
                .foregroundColor(state.theme.inkColor)
                .lineLimit(1)
            Spacer()
            Text(item.parent)
                .font(.system(size: 11))
                .foregroundColor(state.theme.subColor)
                .lineLimit(1)
                .truncationMode(.head)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 8)
        .background(active ? state.theme.activeColor.opacity(8) : Color.clear)
        .overlay(alignment: .leading) {
            if active {
                Rectangle().fill(state.theme.accentColor).frame(width: 3)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 14) {
            Label("↑↓ 이동", systemImage: "")
            Label("↩ 열기", systemImage: "")
            Label("esc 닫기", systemImage: "")
            Spacer()
        }
        .font(.system(size: 11, design: .monospaced))
        .foregroundColor(state.theme.subColor.opacity(0.7))
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(state.theme.sidebarBgColor)
    }

    // MARK: - Data

    struct PaletteItem: Hashable {
        let url: URL
        let name: String
        let parent: String
        let kind: Kind
        enum Kind { case markdown, image, other, folder }
    }

    private var results: [PaletteItem] {
        let q = query.lowercased()
        var items: [PaletteItem] = []
        func walk(_ nodes: [FileNode]) {
            for n in nodes {
                let item = PaletteItem(
                    url: n.url,
                    name: n.name,
                    parent: parentLabel(n.url),
                    kind: itemKind(n)
                )
                if q.isEmpty || item.name.lowercased().contains(q) {
                    items.append(item)
                }
                if n.isDirectory, let c = n.children { walk(c) }
            }
        }
        walk(state.fileTree)
        return Array(items.prefix(50))
    }

    private func itemKind(_ n: FileNode) -> PaletteItem.Kind {
        if n.isDirectory { return .folder }
        switch n.kind {
        case .markdown: return .markdown
        case .image: return .image
        default: return .other
        }
    }

    private func parentLabel(_ url: URL) -> String {
        let parent = url.deletingLastPathComponent()
        return parent.lastPathComponent
    }

    private func typeColor(_ k: PaletteItem.Kind) -> Color {
        switch k {
        case .markdown: return spectrum[0]
        case .image:    return spectrum[2]
        case .folder:   return spectrum[3]
        case .other:    return state.theme.subColor
        }
    }

    // MARK: - Actions

    private func openSelected() {
        guard selectedIndex < results.count else { return }
        let item = results[selectedIndex]
        if item.kind == .markdown {
            state.selectFile(item.url)
        } else if item.kind == .image {
            state.previewImageURL = item.url
        } else if item.kind == .folder {
            return
        }
        close()
    }

    private func close() {
        state.paletteOpen = false
    }
}

/// 키보드 이벤트(↑↓↩esc)를 부모 NSView에서 가로채는 헬퍼.
private struct KeyEventCatcher: NSViewRepresentable {
    let onUp: () -> Void
    let onDown: () -> Void
    let onEsc: () -> Void
    let onEnter: () -> Void

    func makeNSView(context: Context) -> NSView {
        let v = KeyView()
        v.handler = { key in
            switch key {
            case 126: onUp()
            case 125: onDown()
            case 53:  onEsc()
            case 36, 76: onEnter()
            default: return false
            }
            return true
        }
        return v
    }
    func updateNSView(_ nsView: NSView, context: Context) {}

    final class KeyView: NSView {
        var handler: ((UInt16) -> Bool)?
        override var acceptsFirstResponder: Bool { true }
        override func keyDown(with event: NSEvent) {
            if let h = handler, h(event.keyCode) { return }
            super.keyDown(with: event)
        }
    }
}
