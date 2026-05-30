import SwiftUI
import AppKit

struct FolderSidebar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if state.rootFolder != nil {
                StampBox()
                TreeView()
                FolderFooter()
            } else {
                EmptyFolderState()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.nbPaper)
    }
}

// MARK: - Composition Book 표지 라벨 (Name / Date / Subject)

private struct StampBox: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("Name:").font(.custom("Kalam", size: 13)).foregroundColor(.nbInkLight)
                Text("").font(.custom("Kalam", size: 13)).foregroundColor(.nbInk)
            }
            HStack(spacing: 6) {
                Text("Date:").font(.custom("Kalam", size: 13)).foregroundColor(.nbInkLight)
                Text(Self.todayString()).font(.custom("Kalam", size: 13)).foregroundColor(.nbInk)
            }
            HStack(spacing: 6) {
                Text("Subject:").font(.custom("Kalam", size: 13)).foregroundColor(.nbInkLight)
                Text(state.rootFolder?.lastPathComponent ?? "markdown-note")
                    .font(.custom("Caveat", size: 20))
                    .fontWeight(.bold)
                    .foregroundColor(.nbAccent)
                    .underline()
            }
        }
        .padding(12)
        .background(Color.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.nbInk.opacity(0.4), lineWidth: 1.5))
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
    private static func todayString() -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: Date())
    }
}

// 사이드바 하단 — N pages · p. 8 / 100 (Composition Book footer)
private struct FolderFooter: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack {
            Text("\(mdCount()) pages")
            Spacer()
            Text("p. 8 / 100")
        }
        .font(.custom("Caveat", size: 18))
        .foregroundColor(.nbInkLight)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
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

// MARK: - Theme swatch picker (toolbar 우상단)

struct ThemeSwatchPicker: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack(spacing: 1) {
            ForEach(Theme.allCases) { t in
                Button { state.setTheme(t) } label: {
                    Text(label(t))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color(nsColor: t.foregroundNS))
                        .frame(width: 22, height: 22)
                        .background(Color(nsColor: t.editorBackgroundNS))
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(state.theme == t
                                    ? Color(red: 0, green: 0.4, blue: 0.8)
                                    : Color.primary.opacity(0.10),
                                    lineWidth: state.theme == t ? 1.5 : 0.5)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
                .help("\(t.displayName) (⌘⇧\(Theme.allCases.firstIndex(of: t)! + 1))")
            }
        }
        .padding(1)
        .background(Color.primary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 5))
    }

    private func label(_ t: Theme) -> String {
        switch t {
        case .light: return "L"
        case .dark:  return "D"
        case .sepia: return "S"
        case .paper: return "P"
        }
    }
}

private struct Header: View {
    let rootURL: URL

    var body: some View {
        HStack(spacing: 6) {
            Text(pathLabel)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color(red: 0.63, green: 0.63, blue: 0.65))
                .lineLimit(1)
                .truncationMode(.middle)
                .tracking(0.5)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 4)
    }

    private var pathLabel: String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var path = rootURL.path
        if path.hasPrefix(home) { path = "~" + path.dropFirst(home.count) }
        return path.uppercased()
    }
}

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
            .padding(.top, 0)
            .padding(.bottom, 4)
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
                .padding(.leading, CGFloat(depth) * 12 + 6)
                .padding(.trailing, 8)
                .padding(.vertical, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .background(rowBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(alignment: .leading) {
                    // 현재 파일: 좌측 3px accent 보더 (Composition Book 강조)
                    if isCurrentFile { Rectangle().fill(Color.nbAccent).frame(width: 3) }
                }
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
        HStack(spacing: 6) {
            Group {
                if node.isDirectory {
                    Text(expanded ? "▾" : "▸")
                        .font(.system(size: 10))
                        .foregroundColor(.nbInkLight)
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
                    .font(.custom("Kalam", size: 15))
                    .fontWeight(isCurrentFile ? .bold : nameWeight)
                    .foregroundColor(.nbInk)
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
            return AnyView(Color.nbCurrent)
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
        node.name
    }

    private var nameWeight: Font.Weight {
        if state.selectedFiles.contains(node.url) { return .semibold }
        return node.isDirectory ? .semibold : .regular
    }

    private var nameColor: Color {
        node.isDirectory
            ? Color(red: 0.05, green: 0.05, blue: 0.07)
            : Color(red: 0.11, green: 0.11, blue: 0.12)
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
        if node.isDirectory {
            return Color(red: 0.42, green: 0.42, blue: 0.45)
        }
        switch node.kind {
        case .image: return Color(red: 0.42, green: 0.42, blue: 0.45).opacity(0.7)
        default: return Color(red: 0.55, green: 0.55, blue: 0.58)
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
