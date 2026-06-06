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
            Text("\(mdCount()) files")
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

    private func mdCount() -> Int {
        var count = 0
        func walk(_ ns: [FileNode]) {
            for n in ns {
                if n.isDirectory { if let c = n.children { walk(c) } }
                else if n.kind == .markdown { count += 1 }
            }
        }
        walk(state.fileTree)
        return count
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
        VStack(alignment: .leading, spacing: 0) {
            row
                .padding(.leading, CGFloat(depth) * 14 + 8)
                .padding(.trailing, 8)
                .padding(.vertical, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .background(rowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(alignment: .leading) {
                    if isCurrentFile {
                        Rectangle().fill(state.theme.accentColor).frame(width: 2)
                    }
                }
                .overlay(
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
                    if !node.isDirectory {
                        if node.kind == .markdown {
                            Button("열기") { state.selectFile(node.url) }
                            Button("새 창에서 열기") {
                                AppDelegate.shared?.openNewWindow(with: node.url)
                            }
                        }
                        Divider()
                    } else {
                        Button("새 폴더") { state.createFolder(in: node.url) }
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
                ? Color.accentColor.opacity(0.08)
                : Color.clear
        )
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    @ViewBuilder
    private var row: some View {
        HStack(spacing: 6) {
            Group {
                if node.isDirectory {
                    Text(expanded ? "▾" : "▸")
                        .font(.system(size: 10))
                        .foregroundColor(state.theme.subColor)
                } else {
                    Color.clear
                }
            }
            .frame(width: 12)

            iconView
                .foregroundStyle(iconColor)
                .frame(width: 16, height: 13)

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
                    .font(.system(size: 13))
                    .fontWeight(isCurrentFile ? .semibold : nameWeight)
                    .foregroundColor(state.theme.inkColor)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 0)
        }
    }

    private var isCurrentFile: Bool {
        !node.isDirectory && node.url == state.selectedFile
    }

    private var rowBackground: some View {
        if dropTargeted {
            return AnyView(Color.accentColor.opacity(0.30))
        } else if isCurrentFile {
            return AnyView(state.theme.activeColor)
        } else if state.selectedFiles.contains(node.url) {
            return AnyView(state.theme.activeColor.opacity(2.5))
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
        return node.isDirectory ? .semibold : .regular
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
