import SwiftUI
import AppKit

struct FolderSidebar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let root = state.rootFolder {
                Header(name: root.lastPathComponent)
                Divider().opacity(0.4)
                TreeView()
            } else {
                EmptyFolderState()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Outline popover (toolbar + ⌘⇧O)

struct OutlinePopover: View {
    @EnvironmentObject var state: AppState
    let onSelect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "list.bullet.indent")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Text("Outline")
                    .font(.system(.caption, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(state.outline.count)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.primary.opacity(0.06))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 8)

            Divider().opacity(0.4)

            if state.outline.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "number")
                        .font(.system(size: 18, weight: .light))
                        .foregroundStyle(.tertiary)
                    Text("No headings")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(state.outline) { h in
                            OutlineRow(heading: h, onSelect: onSelect)
                        }
                    }
                    .padding(6)
                }
                .frame(maxHeight: 380)
            }
        }
        .frame(width: 280)
    }
}

private struct OutlineRow: View {
    @EnvironmentObject var state: AppState
    let heading: AppState.Heading
    let onSelect: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 6) {
            Text("H\(heading.level)")
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 18, alignment: .leading)
                .opacity(0.7)
            Text(heading.text)
                .font(.system(size: fontSize(for: heading.level), weight: weight(for: heading.level)))
                .foregroundStyle(heading.level <= 2 ? Color.primary : .secondary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.leading, CGFloat(heading.level - 1) * 10 + 6)
        .padding(.trailing, 8)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .background(hovering ? Color.accentColor.opacity(0.18) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .onHover { hovering = $0 }
        .onTapGesture {
            NotificationCenter.default.post(name: .outlineNavigateRequested,
                                            object: heading.lineIdx)
            onSelect()
        }
    }

    private func fontSize(for level: Int) -> CGFloat {
        switch level {
        case 1: return 13
        case 2: return 12.5
        default: return 12
        }
    }
    private func weight(for level: Int) -> Font.Weight {
        switch level {
        case 1: return .semibold
        case 2: return .medium
        default: return .regular
        }
    }
}

private struct Header: View {
    @EnvironmentObject var state: AppState
    let name: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "folder.fill")
                .foregroundStyle(.secondary)
                .font(.system(size: 11))
            Text(name)
                .font(.system(.callout, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button {
                state.refreshTree()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("새로고침")

            Button {
                state.newFile()
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("새 파일 (⌘N)")
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }
}

private struct TreeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 1) {
                ForEach(state.fileTree) { node in
                    NodeBranch(node: node, depth: 0)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct NodeBranch: View {
    @EnvironmentObject var state: AppState
    let node: FileNode
    let depth: Int

    @State private var expanded: Bool = false
    @State private var hovering = false
    @State private var isRenaming = false
    @State private var renameText = ""
    @State private var showingDelete = false
    @State private var dropTargeted = false
    @FocusState private var renameFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            row
                .padding(.leading, CGFloat(depth) * 12 + 6)
                .padding(.trailing, 8)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .background(rowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    // 폴더 자체에 drop 시 row 테두리 강조 (자식 영역과 구분)
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(dropTargeted ? Color.accentColor : Color.clear, lineWidth: 1)
                )
                .onHover { hovering = $0 }
                .onTapGesture {
                    if isRenaming { return }
                    if node.isDirectory {
                        withAnimation(.easeInOut(duration: 0.15)) { expanded.toggle() }
                        return
                    }
                    let mods = NSEvent.modifierFlags
                    if mods.contains(.shift) {
                        // range select (anchor=selectedFile부터 현재까지)
                        state.rangeSelect(to: node.url)
                    } else if mods.contains(.command) {
                        // toggle add/remove
                        state.toggleSelection(node.url)
                    } else {
                        // 일반 click — 단일 선택 + 파일 열기
                        if node.kind == .markdown {
                            state.selectFile(node.url)
                        } else if node.kind == .image {
                            state.previewImageURL = node.url
                            state.selectedFiles = [node.url]
                        } else {
                            state.selectedFiles = [node.url]
                        }
                    }
                }
                .onDrag {
                    // 모든 파일/폴더가 drag source가 될 수 있다.
                    // 에디터 drop은 image만 처리, 폴더 drop은 모든 file을 이동.
                    if !node.isDirectory {
                        return NSItemProvider(object: node.url as NSURL)
                    }
                    return NSItemProvider()
                }
                .onDrop(of: [.fileURL], isTargeted: nodeIsDirectory ? $dropTargeted : .constant(false)) { providers in
                    if !node.isDirectory { return false }
                    handleFolderDrop(providers: providers, target: node.url)
                    return true
                }
                .contextMenu {
                    if !node.isDirectory {
                        if node.kind == .markdown {
                            Button("열기") { state.selectFile(node.url) }
                            Button("새 탭에서 열기") {
                                AppDelegate.shared?.openNewTab(with: node.url)
                            }
                        }
                        Divider()
                    }
                    Button("이름 변경") { startRename() }
                    Button("Finder에서 보기") { state.revealInFinder(node.url) }
                    Divider()
                    if multiSelected.count > 1 {
                        Button("\(multiSelected.count)개 삭제", role: .destructive) { showingDelete = true }
                    } else {
                        Button("삭제", role: .destructive) { showingDelete = true }
                    }
                }
                .alert("삭제 확인", isPresented: $showingDelete) {
                    Button(multiSelected.count > 1 ? "\(multiSelected.count)개 삭제" : "삭제",
                           role: .destructive) {
                        if multiSelected.count > 1 {
                            state.deleteSelectedFiles()
                        } else {
                            state.deleteFile(node.url)
                        }
                    }
                    Button("취소", role: .cancel) {}
                } message: {
                    if multiSelected.count > 1 {
                        Text("선택한 \(multiSelected.count)개 파일을 휴지통으로 이동합니다.")
                    } else {
                        Text("\(node.name)을(를) 휴지통으로 이동합니다.")
                    }
                }

            if node.isDirectory, expanded, let children = node.children {
                ForEach(children) { child in
                    NodeBranch(node: child, depth: depth + 1)
                }
            }
        }
        // drop hover 시 폴더 + 자식 묶음 영역 전체에 옅은 highlight
        .background(
            (node.isDirectory && dropTargeted)
                ? Color.accentColor.opacity(0.08)
                : Color.clear
        )
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    @ViewBuilder
    private var row: some View {
        HStack(spacing: 4) {
            Group {
                if node.isDirectory {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(state.selectedFile == node.url ? .primary : .secondary)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                } else {
                    Color.clear
                }
            }
            .frame(width: 10)

            Image(systemName: iconName)
                .font(.system(size: 11))
                .foregroundStyle(iconColor)
                .frame(width: 14)

            if isRenaming {
                TextField("", text: $renameText)
                    .textFieldStyle(.plain)
                    .font(.system(.callout))
                    .focused($renameFocused)
                    .onSubmit { commitRename() }
                    .onExitCommand { cancelRename() }
                    .onChange(of: renameFocused) { focused in
                        if !focused && isRenaming { commitRename() }
                    }
                    .task {
                        try? await Task.sleep(nanoseconds: 30_000_000)
                        renameFocused = true
                    }
            } else {
                Text(displayName)
                    .font(.system(.callout, weight: state.selectedFiles.contains(node.url) ? .semibold : .regular))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 0)
        }
    }

    private var rowBackground: some View {
        if dropTargeted {
            return AnyView(Color.accentColor.opacity(0.30))
        } else if state.selectedFiles.contains(node.url) {
            return AnyView(Color.accentColor.opacity(0.18))
        } else if hovering && !isRenaming {
            return AnyView(Color.primary.opacity(0.06))
        } else {
            return AnyView(Color.clear)
        }
    }

    private func startRename() {
        renameText = node.url.deletingPathExtension().lastPathComponent
        isRenaming = true
    }

    private func commitRename() {
        let target = renameText
        isRenaming = false
        if target != node.url.deletingPathExtension().lastPathComponent {
            state.renameFile(node.url, to: target)
        }
    }

    private func cancelRename() {
        isRenaming = false
    }

    private var nodeIsDirectory: Bool { node.isDirectory }

    /// drop된 file URL들을 비동기로 모은 뒤 selectedFiles 동반 이동까지 결정.
    private func handleFolderDrop(providers: [NSItemProvider], target: URL) {
        var dropped: [URL] = []
        let group = DispatchGroup()
        for p in providers {
            group.enter()
            _ = p.loadObject(ofClass: URL.self) { url, _ in
                if let url = url { dropped.append(url) }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            // drop된 항목 중 첫 url이 사용자의 multi-selection 안에 있으면
            // selectedFiles 전체를 같이 이동 (SwiftUI .onDrag가 한 번에 1개만 보내는 한계 우회).
            var toMove = Set(dropped)
            if let first = dropped.first,
               state.selectedFiles.contains(first),
               state.selectedFiles.count > 1 {
                toMove = state.selectedFiles
            }
            state.moveFiles(Array(toMove), into: target)
        }
    }

    /// 현재 노드가 다중 선택의 일부면 그 전체 set, 아니면 [node.url] 단일.
    /// contextMenu / alert 분기에 사용.
    private var multiSelected: Set<URL> {
        if state.selectedFiles.contains(node.url), state.selectedFiles.count > 1 {
            return state.selectedFiles
        }
        return [node.url]
    }

    private var displayName: String {
        if !node.isDirectory, node.name.lowercased().hasSuffix(".md") {
            return String(node.name.dropLast(3))
        }
        return node.name
    }

    private var iconName: String {
        if node.isDirectory { return "folder.fill" }
        switch node.kind {
        case .image: return "photo"
        case .markdown: return "doc.text"
        case .other: return "doc"
        }
    }

    private var iconColor: Color {
        if node.isDirectory { return Color.accentColor.opacity(0.85) }
        switch node.kind {
        case .image: return Color.accentColor.opacity(0.6)
        default: return .secondary
        }
    }
}

// MARK: - In-app image preview (에디터 영역에 inline 표시)

struct ImagePreviewOverlay: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        if let url = state.previewImageURL {
            ZStack {
                // 에디터와 비슷한 톤의 단색 배경. 클릭으로 닫지 않음 (정적 미리보기).
                Color(nsColor: state.theme.editorBackgroundNS)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    // 헤더: 파일명 + 닫기 버튼
                    HStack(spacing: 10) {
                        Image(systemName: "photo")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                        Text(url.lastPathComponent)
                            .font(.system(.callout, weight: .medium))
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        Button {
                            state.revealInFinder(url)
                        } label: {
                            Image(systemName: "folder")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .help("Finder에서 보기")
                        Button {
                            state.previewImageURL = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .keyboardShortcut(.escape, modifiers: [])
                        .help("닫기 (Esc)")
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    Divider().opacity(0.4)

                    // 이미지: 영역에 비례해 fit, 가운데 정렬
                    GeometryReader { geo in
                        Group {
                            if let img = NSImage(contentsOf: url) {
                                Image(nsImage: img)
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                Text("이미지를 불러올 수 없습니다")
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                        .frame(width: geo.size.width, height: geo.size.height)
                    }
                    .padding(20)
                }
            }
            .transition(.opacity)
        }
    }
}

private struct EmptyFolderState: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(.secondary)
            VStack(spacing: 4) {
                Text("폴더를 선택하세요")
                    .font(.callout)
                    .foregroundStyle(.primary)
                Text(".md 파일이 들어있는\n로컬 폴더 또는 iCloud Drive")
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            Button("Open Folder…") { state.pickFolder() }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(20)
    }
}
