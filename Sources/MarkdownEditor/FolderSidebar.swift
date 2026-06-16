import SwiftUI
import AppKit

/// 사이드바 — Refract에 맞춰 평범한 파일 트리만. stamp/spine/swatch picker 모두 제거.
struct FolderSidebar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if state.rootFolder != nil {
                TreeView()
                FolderFooter()
            } else {
                EmptyFolderState()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(state.theme.sidebarBgColor)
    }
}

// MARK: - Footer

private struct FolderFooter: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack {
            Text("빈 곳을 우클릭해 새로 만들기")
            Spacer()
        }
        .font(.system(size: 11))
        .foregroundColor(state.theme.subColor)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .overlay(alignment: .top) {
            Rectangle().fill(state.theme.lineColor).frame(height: 1)
        }
    }
}

// MARK: - Tree

private struct TreeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(state.fileTree) { node in
                    NodeBranch(node: node, depth: 0)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // 빈 공간 우클릭 → 루트에 생성. 행 위 우클릭은 각 행의 contextMenu가 우선.
        .background(
            Color.clear
                .contentShape(Rectangle())
                .contextMenu {
                    Button("새 노트") { state.createNote(in: nil) }
                    Button("새 폴더") { state.createFolder(in: nil) }
                }
        )
    }
}

private struct NodeBranch: View {
    @EnvironmentObject var state: AppState
    let node: FileNode
    let depth: Int

    @State private var hovering = false
    @State private var renameText = ""
    @State private var showingDelete = false
    @State private var dropTargeted = false
    @FocusState private var renameFocused: Bool

    // 펼침/이름변경은 AppState가 소유 — 프로그램적 펼침 + 생성 직후 rename 진입을 위해.
    private var expanded: Bool { state.expandedFolders.contains(node.url) }
    private var isRenaming: Bool { state.renamingURL == node.url }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            row
                .padding(.leading, CGFloat(depth) * 14 + 6)
                .padding(.trailing, 6)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .background(rowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .overlay(alignment: .leading) {
                    if isCurrentFile {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(state.theme.accentColor)
                            .frame(width: 2.5)
                            .padding(.vertical, 5)
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(borderColor, lineWidth: 1)
                )
                .onHover { hovering = $0 }
                .onTapGesture {
                    if isRenaming { return }
                    if node.isDirectory {
                        withAnimation(.easeInOut(duration: 0.15)) { state.toggleExpanded(node.url) }
                        return
                    }
                    let mods = NSEvent.modifierFlags
                    if mods.contains(.shift) {
                        state.rangeSelect(to: node.url)
                    } else if mods.contains(.command) {
                        state.toggleSelection(node.url)
                    } else {
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
                    if node.isDirectory {
                        Button("새 노트") { state.createNote(in: node.url) }
                        Button("새 폴더") { state.createFolder(in: node.url) }
                        Divider()
                    } else if node.kind == .markdown {
                        Button("열기") { state.selectFile(node.url) }
                        Button("새 창에서 열기") {
                            AppDelegate.shared?.openNewWindow(with: node.url)
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
        .background(
            (node.isDirectory && dropTargeted)
                ? state.theme.accentColor.opacity(0.08)
                : Color.clear
        )
        .clipShape(RoundedRectangle(cornerRadius: 7))
    }

    @ViewBuilder
    private var row: some View {
        HStack(spacing: 5) {
            Group {
                if node.isDirectory {
                    Text("▶")
                        .font(.system(size: 8))
                        .foregroundColor(state.theme.accentColor)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                } else {
                    Color.clear
                }
            }
            .frame(width: 11)

            iconView
                .foregroundStyle(iconColor)
                .frame(width: 16, height: 13)

            if isRenaming {
                TextField("", text: $renameText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .focused($renameFocused)
                    .onSubmit { commitRename() }
                    .onExitCommand { cancelRename() }
                    .onChange(of: renameFocused) { focused in
                        if !focused && isRenaming { commitRename() }
                    }
                    .task {
                        // rename 진입(컨텍스트 메뉴 또는 생성 직후) 시 현재 이름으로 seed + focus.
                        renameText = node.isDirectory
                            ? node.name
                            : node.url.deletingPathExtension().lastPathComponent
                        try? await Task.sleep(nanoseconds: 30_000_000)
                        renameFocused = true
                    }
            } else {
                Text(displayName)
                    .font(.system(size: 13))
                    .fontWeight(nameWeight)
                    .foregroundColor(nameColor)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 0)

            if node.isDirectory {
                Text("\(fileCount)")
                    .font(.system(size: 12))
                    .foregroundColor(state.theme.subColor.opacity(0.7))
            }
        }
    }

    private var isCurrentFile: Bool {
        !node.isDirectory && node.url == state.selectedFile
    }

    /// active 행 hairline 보더(테라코타 40%) / 드롭 타겟 보더(테라코타).
    private var borderColor: Color {
        if isCurrentFile { return state.theme.accentColor.opacity(0.4) }
        if dropTargeted { return state.theme.accentColor }
        return .clear
    }

    /// 이름 색 — active=ink, 폴더 #3b362e, 파일 #4a443b (달필 프로토타입 값).
    private var nameColor: Color {
        if isCurrentFile { return state.theme.inkColor }
        return node.isDirectory
            ? Color(.sRGB, red: 59 / 255, green: 54 / 255, blue: 46 / 255, opacity: 1)
            : Color(.sRGB, red: 74 / 255, green: 68 / 255, blue: 59 / 255, opacity: 1)
    }

    /// 폴더 행 우측 자식 수 — 하위 markdown 파일 재귀 카운트.
    private var fileCount: Int {
        func walk(_ ns: [FileNode]) -> Int {
            ns.reduce(0) { acc, n in
                acc + (n.isDirectory ? walk(n.children ?? []) : (n.kind == .markdown ? 1 : 0))
            }
        }
        return walk(node.children ?? [])
    }

    private var rowBackground: some View {
        if isCurrentFile {
            return AnyView(Color.white)
        } else if dropTargeted {
            return AnyView(state.theme.accentColor.opacity(0.12))
        } else if state.selectedFiles.contains(node.url) {
            return AnyView(state.theme.activeColor.opacity(2.5))
        } else if hovering && !isRenaming {
            return AnyView(Color.white.opacity(0.5))
        } else {
            return AnyView(Color.clear)
        }
    }

    private func startRename() {
        state.beginRename(node.url)
    }

    private func commitRename() {
        guard isRenaming else { return }
        let target = renameText
        state.endRename()
        let current = node.isDirectory
            ? node.name
            : node.url.deletingPathExtension().lastPathComponent
        if target != current {
            state.renameFile(node.url, to: target)
        }
    }

    private func cancelRename() {
        state.endRename()
    }

    private var nodeIsDirectory: Bool { node.isDirectory }

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
            var toMove = Set(dropped)
            if let first = dropped.first,
               state.selectedFiles.contains(first),
               state.selectedFiles.count > 1 {
                toMove = state.selectedFiles
            }
            state.moveFiles(Array(toMove), into: target)
        }
    }

    private var multiSelected: Set<URL> {
        if state.selectedFiles.contains(node.url), state.selectedFiles.count > 1 {
            return state.selectedFiles
        }
        return [node.url]
    }

    private var displayName: String { node.name }

    private var nameWeight: Font.Weight {
        if state.selectedFiles.contains(node.url) { return .semibold }
        return node.isDirectory ? .bold : .regular
    }

    @ViewBuilder
    private var iconView: some View {
        if node.isDirectory {
            DesignIconView(image: expanded ? DesignIcon.folderOpen : DesignIcon.folder, size: 13)
        } else {
            DesignIconView(image: DesignIcon.file, size: 12)
        }
    }

    private var iconColor: Color {
        state.theme.subColor.opacity(node.isDirectory ? 1.0 : 0.8)
    }
}

// MARK: - Image preview overlay (변경 없음, 색 토큰만 갱신)

struct ImagePreviewOverlay: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        if let url = state.previewImageURL {
            ZStack {
                state.theme.windowBgColor
                    .ignoresSafeArea()

                VStack(spacing: 0) {
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

// MARK: - Empty state

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
