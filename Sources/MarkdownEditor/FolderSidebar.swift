import SwiftUI

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

    @State private var expanded: Bool = true
    @State private var hovering = false
    @State private var isRenaming = false
    @State private var renameText = ""
    @State private var showingDelete = false
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
                .onHover { hovering = $0 }
                .onTapGesture {
                    if isRenaming { return }
                    if node.isDirectory {
                        withAnimation(.easeInOut(duration: 0.15)) { expanded.toggle() }
                    } else {
                        state.selectFile(node.url)
                    }
                }
                .contextMenu {
                    if !node.isDirectory {
                        Button("열기") { state.selectFile(node.url) }
                        Divider()
                    }
                    Button("이름 변경") { startRename() }
                    Button("Finder에서 보기") { state.revealInFinder(node.url) }
                    Divider()
                    Button("삭제", role: .destructive) { showingDelete = true }
                }
                .alert("삭제 확인", isPresented: $showingDelete) {
                    Button("삭제", role: .destructive) { state.deleteFile(node.url) }
                    Button("취소", role: .cancel) {}
                } message: {
                    Text("\(node.name)을(를) 휴지통으로 이동합니다.")
                }

            if node.isDirectory, expanded, let children = node.children {
                ForEach(children) { child in
                    NodeBranch(node: child, depth: depth + 1)
                }
            }
        }
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

            Image(systemName: node.isDirectory ? "folder.fill" : "doc.text")
                .font(.system(size: 11))
                .foregroundStyle(node.isDirectory ? Color.accentColor.opacity(0.85) : .secondary)
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
                    .font(.system(.callout, weight: state.selectedFile == node.url ? .semibold : .regular))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 0)
        }
    }

    private var rowBackground: some View {
        if state.selectedFile == node.url {
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

    private var displayName: String {
        if !node.isDirectory, node.name.lowercased().hasSuffix(".md") {
            return String(node.name.dropLast(3))
        }
        return node.name
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
