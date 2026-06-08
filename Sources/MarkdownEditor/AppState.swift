import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class AppState: ObservableObject {
    @Published var rootFolder: URL?
    @Published var fileTree: [FileNode] = []
    @Published var selectedFile: URL?
    @Published var documentText: String = ""
    @Published var theme: Theme = .dalpil
    @Published var viewMode: String = "split"  // "note" | "split" | "book"
    @Published var editorFont: EditorFont = .gaegu          // 손글씨 폰트(Tweaks)
    @Published var paperTexture: String = "ruled"           // ruled | grid | dot | plain
    @Published var tokenVisibility: String = "show"         // show | faint | hide
    @Published var paletteOpen: Bool = false
    @Published var isDirty: Bool = false
    @Published var debugLog: String = "ready"
    @Published var outline: [Heading] = []
    @Published var selectedFileMtime: Date? = nil
    /// 현재 cursor가 속한 heading의 outline 내 인덱스. inline TOC가 active 행 강조에 사용.
    @Published var activeOutlineIndex: Int? = nil
    @Published var previewImageURL: URL?
    /// 새 파일 열기 시 emit. 에디터가 history/state 를 reset 하기 위한 신호.
    @Published var documentResetTick: Int = 0
    /// 사이드바 다중 선택. selectedFile은 anchor(마지막 단일 클릭).
    @Published var selectedFiles: Set<URL> = []

    struct Heading: Identifiable, Equatable {
        let id = UUID()
        let level: Int
        let text: String
        let lineIdx: Int
    }

    private var saveDebounceTask: Task<Void, Never>?
    private var lastSaveFailureKey: String?
    private var fileWatcher: DispatchSourceFileSystemObject?
    private var fileWatcherFD: Int32 = -1
    private var lastKnownMTime: Date?
    private var externalChangeAlertVisible = false

    init() {
        if let bookmark = UserDefaults.standard.data(forKey: "rootFolderBookmark") {
            var stale = false
            if let url = try? URL(resolvingBookmarkData: bookmark,
                                   options: [.withSecurityScope],
                                   relativeTo: nil,
                                   bookmarkDataIsStale: &stale),
               url.startAccessingSecurityScopedResource() {
                self.rootFolder = url
                refreshTree()
            }
        }
        if let mode = UserDefaults.standard.string(forKey: "viewMode") {
            // 구 Refract 값 마이그레이션: source→note, preview→book.
            let migrated = ["source": "note", "preview": "book"][mode] ?? mode
            if ["note", "split", "book"].contains(migrated) { self.viewMode = migrated }
        }
        if let raw = UserDefaults.standard.string(forKey: "editorFont"),
           let f = EditorFont(rawValue: raw) {
            self.editorFont = f
        }
        if let p = UserDefaults.standard.string(forKey: "paperTexture"),
           ["ruled", "grid", "dot", "plain"].contains(p) {
            self.paperTexture = p
        }
        if let t = UserDefaults.standard.string(forKey: "tokenVisibility"),
           ["show", "faint", "hide"].contains(t) {
            self.tokenVisibility = t
        }
    }

    // MARK: - Folder

    func pickFolder() {
        debugLog = "pickFolder enter"
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Open"
        panel.message = "마크다운 파일이 들어있는 폴더를 선택하세요"
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser
        let result = panel.runModal()
        debugLog = "panel result=\(result.rawValue) url=\(panel.url?.path ?? "nil")"
        if result == .OK, let url = panel.url {
            openFolder(url)
        }
    }

    func openFolder(_ url: URL) {
        debugLog = "openFolder \(url.lastPathComponent)"
        rootFolder?.stopAccessingSecurityScopedResource()
        let scoped = url.startAccessingSecurityScopedResource()
        rootFolder = url
        if let bm = try? url.bookmarkData(options: [.withSecurityScope]) {
            UserDefaults.standard.set(bm, forKey: "rootFolderBookmark")
        }
        refreshTree()
        debugLog = "openFolder done scoped=\(scoped) tree=\(fileTree.count) root=\(url.lastPathComponent)"
    }

    func refreshTree() {
        guard let root = rootFolder else { fileTree = []; return }
        // 큰 폴더 / iCloud Drive scan이 main thread block을 일으켜 drag/drop 후
        // 멈칫 보이는 케이스가 있어 background에서 스캔 후 main에서만 publish.
        Task.detached(priority: .userInitiated) {
            let result = FileNode.scan(root).children ?? []
            await MainActor.run { [weak self] in
                self?.fileTree = result
            }
        }
    }

    // MARK: - File ops

    func selectFile(_ url: URL) {
        flushPendingSave()
        stopFileWatcher()
        previewImageURL = nil  // .md 파일을 열면 이미지 미리보기는 닫힌다
        selectedFile = url
        selectedFiles = [url]
        documentText = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        isDirty = false
        lastKnownMTime = currentMTime(of: url)
        selectedFileMtime = fileModificationDate(url)
        recomputeOutline()
        startFileWatcher(for: url)
        documentResetTick &+= 1  // 에디터 history reset
    }

    private func fileModificationDate(_ url: URL) -> Date? {
        (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
    }

    /// 다중 선택 보조 — 파일 토글 (cmd+click).
    func toggleSelection(_ url: URL) {
        if selectedFiles.contains(url) { selectedFiles.remove(url) }
        else { selectedFiles.insert(url) }
    }

    /// anchor부터 url까지 트리 표시 순서로 range select (shift+click).
    func rangeSelect(to url: URL) {
        let flat = flattenedFileURLs()
        guard let anchor = selectedFile,
              let aIdx = flat.firstIndex(of: anchor),
              let tIdx = flat.firstIndex(of: url) else {
            selectedFiles = [url]
            return
        }
        let lo = min(aIdx, tIdx), hi = max(aIdx, tIdx)
        selectedFiles = Set(flat[lo...hi])
    }

    /// 화면 보이는 트리 순서로 펼친 URL 리스트.
    private func flattenedFileURLs() -> [URL] {
        var out: [URL] = []
        func walk(_ nodes: [FileNode]) {
            for n in nodes {
                if n.isDirectory {
                    if let children = n.children { walk(children) }
                } else {
                    out.append(n.url)
                }
            }
        }
        walk(fileTree)
        return out
    }

    /// 여러 파일을 folder로 이동. 자기 자신 또는 자기 안으로 이동은 무시.
    /// 열린 파일이 함께 이동하면 selectedFile / file watcher도 따라가게.
    func moveFiles(_ urls: [URL], into folder: URL) {
        let isDir = (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
        guard isDir else { return }
        let folderPath = folder.standardizedFileURL.path
        var failed: [String] = []
        var newSelectedFile: URL?
        var newSelectedFiles: Set<URL> = []

        for url in urls {
            let urlPath = url.standardizedFileURL.path
            // 자기 자신 또는 자기 안으로 이동은 skip
            if folderPath == urlPath || folderPath.hasPrefix(urlPath + "/") { continue }
            let dest = folder.appendingPathComponent(url.lastPathComponent)
            if dest.standardizedFileURL == url.standardizedFileURL { continue }
            if FileManager.default.fileExists(atPath: dest.path) {
                failed.append("\(url.lastPathComponent): 이미 같은 이름 존재")
                continue
            }
            do {
                let isOpen = (selectedFile == url)
                if isOpen { stopFileWatcher() }
                try FileManager.default.moveItem(at: url, to: dest)
                newSelectedFiles.insert(dest)
                if isOpen { newSelectedFile = dest }
            } catch {
                failed.append("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }

        if let moved = newSelectedFile {
            selectedFile = moved
            lastKnownMTime = currentMTime(of: moved)
            startFileWatcher(for: moved)
        }
        if !newSelectedFiles.isEmpty {
            selectedFiles = newSelectedFiles
        }
        refreshTree()
        if !failed.isEmpty {
            reportError("일부 이동 실패", detail: failed.joined(separator: "\n"))
        }
    }

    /// 다중 삭제. selectedFiles의 모든 항목을 휴지통으로.
    func deleteSelectedFiles() {
        let urls = Array(selectedFiles)
        guard !urls.isEmpty else { return }
        var failed: [String] = []
        for url in urls {
            do {
                if selectedFile == url {
                    stopFileWatcher()
                    selectedFile = nil
                    documentText = ""
                    isDirty = false
                    lastKnownMTime = nil
                }
                try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            } catch {
                failed.append("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }
        selectedFiles.removeAll()
        refreshTree()
        if !failed.isEmpty {
            reportError("일부 파일 삭제 실패", detail: failed.joined(separator: "\n"))
        }
    }

    func newFile() {
        guard let root = rootFolder else { pickFolder(); return }
        var idx = 1
        var url = root.appendingPathComponent("Untitled.md")
        while FileManager.default.fileExists(atPath: url.path) {
            idx += 1
            url = root.appendingPathComponent("Untitled \(idx).md")
        }
        try? "# Untitled\n\n".write(to: url, atomically: true, encoding: .utf8)
        refreshTree()
        selectFile(url)
    }

    /// parent 안에 "새 폴더" / "새 폴더 2" 형태로 빈 폴더 생성. parent nil이면 root.
    func createFolder(in parent: URL? = nil) {
        guard let p = parent ?? rootFolder else { pickFolder(); return }
        var idx = 1
        var name = "새 폴더"
        var url = p.appendingPathComponent(name)
        while FileManager.default.fileExists(atPath: url.path) {
            idx += 1
            name = "새 폴더 \(idx)"
            url = p.appendingPathComponent(name)
        }
        do {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
            refreshTree()
        } catch {
            reportError("폴더 생성 실패", detail: error.localizedDescription)
        }
    }

    func textChanged(_ newValue: String) {
        documentText = newValue
        isDirty = true
        recomputeOutline()
        scheduleAutosave()
    }

    private func recomputeOutline() {
        let lines = documentText.components(separatedBy: "\n")
        var result: [Heading] = []
        var inFence = false
        for (idx, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                inFence.toggle()
                continue
            }
            if inFence { continue }
            // ATX 헤딩: 1~6개의 # 다음 공백, 텍스트
            guard let match = line.range(of: #"^(#{1,6})\s+(.+?)\s*$"#, options: .regularExpression) else { continue }
            let matched = String(line[match])
            // 직접 파싱
            var level = 0
            var rest = ""
            for ch in matched {
                if ch == "#" && rest.isEmpty { level += 1 }
                else if ch == " " { rest = String(matched.dropFirst(level)).trimmingCharacters(in: .whitespaces); break }
            }
            if level >= 1 && level <= 6 && !rest.isEmpty {
                result.append(Heading(level: level, text: rest, lineIdx: idx))
            }
        }
        if outline != result { outline = result }
    }

    private func scheduleAutosave() {
        saveDebounceTask?.cancel()
        saveDebounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            if Task.isCancelled { return }
            await MainActor.run { self?.saveCurrent() }
        }
    }

    func flushPendingSave() {
        saveDebounceTask?.cancel()
        if isDirty { saveCurrent() }
    }

    func saveCurrent() {
        guard let url = selectedFile else { return }
        // atomically write는 rename(temp, original)이라 원본 inode가 unlink된다 →
        // 우리 watcher가 자기 저장을 .delete로 보고 reload prompt를 띄우는 걸 막기 위해
        // save 동안만 잠시 끈다.
        stopFileWatcher()
        defer {
            if selectedFile == url { startFileWatcher(for: url) }
        }
        do {
            try documentText.write(to: url, atomically: true, encoding: .utf8)
            isDirty = false
            lastSaveFailureKey = nil
            lastKnownMTime = currentMTime(of: url)
            selectedFileMtime = fileModificationDate(url)
        } catch {
            // isDirty는 유지 — 다음 autosave/수동 save가 다시 시도하도록
            // 같은 (파일, 에러코드) 조합엔 첫 1회만 alert (autosave 800ms 폭탄 방지)
            let key = "\(url.path)|\((error as NSError).code)"
            let firstTime = (key != lastSaveFailureKey)
            lastSaveFailureKey = key
            if firstTime {
                reportError("저장 실패",
                            detail: "\(url.lastPathComponent): \(error.localizedDescription)")
            } else {
                NSLog("[MarkdownEditor] save failed (suppressed) — %@: %@",
                      url.lastPathComponent, error.localizedDescription)
            }
        }
    }

    // MARK: - Tweaks & view mode

    func setEditorFont(_ f: EditorFont) {
        editorFont = f
        UserDefaults.standard.set(f.rawValue, forKey: "editorFont")
    }

    func setPaperTexture(_ p: String) {
        guard ["ruled", "grid", "dot", "plain"].contains(p) else { return }
        paperTexture = p
        UserDefaults.standard.set(p, forKey: "paperTexture")
    }

    func setTokenVisibility(_ t: String) {
        guard ["show", "faint", "hide"].contains(t) else { return }
        tokenVisibility = t
        UserDefaults.standard.set(t, forKey: "tokenVisibility")
    }

    func setViewMode(_ mode: String) {
        guard ["note", "split", "book"].contains(mode) else { return }
        viewMode = mode
        UserDefaults.standard.set(mode, forKey: "viewMode")
    }

    // MARK: - File ops (rename / delete / reveal)

    func renameFile(_ url: URL, to newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let parent = url.deletingLastPathComponent()
        let ext = url.pathExtension
        let newURL: URL
        if (trimmed as NSString).pathExtension.isEmpty, !ext.isEmpty {
            newURL = parent.appendingPathComponent(trimmed).appendingPathExtension(ext)
        } else {
            newURL = parent.appendingPathComponent(trimmed)
        }
        guard newURL != url else { return }
        let wasSelected = (selectedFile == url)
        if wasSelected { stopFileWatcher() }
        do {
            flushPendingSave()
            try FileManager.default.moveItem(at: url, to: newURL)
            if wasSelected {
                selectedFile = newURL
                lastKnownMTime = currentMTime(of: newURL)
                startFileWatcher(for: newURL)
            }
            refreshTree()
        } catch {
            if wasSelected, let cur = selectedFile { startFileWatcher(for: cur) }
            reportError("이름 변경 실패",
                        detail: "\(url.lastPathComponent) → \(newURL.lastPathComponent): \(error.localizedDescription)")
        }
    }

    func deleteFile(_ url: URL) {
        let wasSelected = (selectedFile == url)
        if wasSelected { stopFileWatcher() }
        do {
            try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            if wasSelected {
                selectedFile = nil
                documentText = ""
                isDirty = false
                lastKnownMTime = nil
            }
            refreshTree()
        } catch {
            if wasSelected, let cur = selectedFile { startFileWatcher(for: cur) }
            reportError("삭제 실패",
                        detail: "\(url.lastPathComponent): \(error.localizedDescription)")
        }
    }

    // MARK: - Error reporting

    private func reportError(_ title: String, detail: String) {
        NSLog("[MarkdownEditor] %@ — %@", title, detail)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = detail
        alert.alertStyle = .warning
        alert.addButton(withTitle: "확인")
        alert.runModal()
    }

    func revealInFinder(_ url: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    // MARK: - Image attach

    /// 드래그/붙여넣기로 들어온 이미지 데이터를 attachments/에 저장하고
    /// 현재 마크다운 파일에서 본 상대 경로(예: "attachments/foo.png")를 반환.
    /// 실패 시 nil.
    func saveDroppedImage(data: Data, suggestedName: String) -> String? {
        guard let root = rootFolder else {
            reportError("이미지 저장 실패", detail: "먼저 폴더를 열어주세요.")
            return nil
        }
        let attachmentsDir = root.appendingPathComponent("attachments", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: attachmentsDir,
                                                    withIntermediateDirectories: true)
        } catch {
            reportError("이미지 저장 실패",
                        detail: "attachments 폴더 생성 실패: \(error.localizedDescription)")
            return nil
        }

        // 충돌 회피: 원본 이름, 그 다음 -2, -3 ...
        let cleaned = sanitizeImageFilename(suggestedName)
        let base = (cleaned as NSString).deletingPathExtension
        let ext = (cleaned as NSString).pathExtension
        var attempt = 0
        var targetURL = attachmentsDir.appendingPathComponent(cleaned)
        while FileManager.default.fileExists(atPath: targetURL.path) {
            attempt += 1
            let name = ext.isEmpty ? "\(base)-\(attempt + 1)" : "\(base)-\(attempt + 1).\(ext)"
            targetURL = attachmentsDir.appendingPathComponent(name)
            if attempt > 9999 { break }
        }

        do {
            try data.write(to: targetURL)
        } catch {
            reportError("이미지 저장 실패",
                        detail: "\(targetURL.lastPathComponent): \(error.localizedDescription)")
            return nil
        }

        refreshTree()  // 사이드바에 attachments/ + 새 이미지 보이게

        // 현재 .md 파일 기준 상대 경로 계산. 같은 폴더 또는 하위면 그대로,
        // 다른 곳이면 root 기준 절대 경로 폴백.
        if let docURL = selectedFile {
            return relativePath(from: docURL, to: targetURL)
        }
        return "attachments/\(targetURL.lastPathComponent)".precomposedStringWithCanonicalMapping
    }

    private func sanitizeImageFilename(_ raw: String) -> String {
        var name = raw.isEmpty ? "image.png" : raw
        // 경로 구분자 제거
        name = name.replacingOccurrences(of: "/", with: "_")
                   .replacingOccurrences(of: "\\", with: "_")
        // macOS 파일 시스템은 한글을 NFD(자모 분리)로 돌려주므로 NFC(글자 단위)로 정규화한다.
        // 그래야 percent-encode 시 길이가 절반 이하로 줄어든다.
        name = name.precomposedStringWithCanonicalMapping
        // 확장자 없으면 png 추가
        if (name as NSString).pathExtension.isEmpty {
            name += ".png"
        }
        return name
    }

    /// 현재 .md 파일 기준 상대 경로 (없으면 attachments/<name>). NFC 정규화.
    func markdownLinkPath(for url: URL) -> String {
        if let docURL = selectedFile {
            return relativePath(from: docURL, to: url)
        }
        return "attachments/\(url.lastPathComponent)".precomposedStringWithCanonicalMapping
    }

    /// url이 현재 폴더의 attachments/ 안에 있는지.
    func isInsideAttachments(_ url: URL) -> Bool {
        guard let root = rootFolder else { return false }
        let attDir = root.appendingPathComponent("attachments", isDirectory: true)
            .standardizedFileURL.path
        return url.standardizedFileURL.path.hasPrefix(attDir + "/")
    }

    private func relativePath(from source: URL, to target: URL) -> String {
        let srcComp = source.deletingLastPathComponent().standardizedFileURL.pathComponents
        let tgtComp = target.standardizedFileURL.pathComponents
        var i = 0
        while i < srcComp.count && i < tgtComp.count && srcComp[i] == tgtComp[i] { i += 1 }
        let upCount = srcComp.count - i
        let downComps = tgtComp[i..<tgtComp.count]
        let parts = Array(repeating: "..", count: upCount) + downComps
        // standardizedFileURL이 path를 NFD(자모 분리)로 정규화하므로 결과 문자열을
        // 다시 NFC로 합쳐서 percent-encode 시 짧게 나오게 한다.
        return parts.joined(separator: "/").precomposedStringWithCanonicalMapping
    }


    // MARK: - File watcher (외부 변경 감지)

    private func currentMTime(of url: URL) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date
    }

    private func startFileWatcher(for url: URL) {
        stopFileWatcher()
        let fd = open(url.path, O_EVTONLY)
        guard fd >= 0 else { return }
        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .extend, .delete, .rename, .attrib],
            queue: .main)
        src.setEventHandler { [weak self] in
            // DispatchQueue.main에서 발동 — MainActor와 동일 thread.
            // 캡처한 src에서 events를 직접 읽어 race-free하게 사용.
            let events = src.data
            Task { @MainActor in
                self?.handleFileSystemEvent(for: url, events: events)
            }
        }
        src.setCancelHandler {
            close(fd)
        }
        src.resume()
        fileWatcher = src
        fileWatcherFD = fd
    }

    private func stopFileWatcher() {
        fileWatcher?.cancel()
        fileWatcher = nil
        fileWatcherFD = -1
    }

    private func handleFileSystemEvent(for url: URL,
                                       events: DispatchSource.FileSystemEvent) {
        // 다른 파일로 이미 옮겨갔다면 무시
        guard selectedFile == url else { return }

        if events.contains(.delete) || events.contains(.rename) {
            // 외부에서 파일이 사라지거나 옮겨짐. 우리 자체 저장은 saveCurrent에서 watcher를 끄므로
            // 여기 도달했다는 건 외부 액션이라는 뜻.
            stopFileWatcher()
            refreshTree()
            return
        }

        let diskMTime = currentMTime(of: url)
        // 우리가 마지막으로 본 mtime과 같으면 attrib 정도의 잡음 — skip
        if diskMTime == lastKnownMTime { return }

        if isDirty {
            promptExternalChange(for: url, diskMTime: diskMTime)
        } else {
            reloadFromDisk(url: url, diskMTime: diskMTime)
        }
    }

    private func reloadFromDisk(url: URL, diskMTime: Date?) {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        documentText = text
        isDirty = false
        lastKnownMTime = diskMTime
        recomputeOutline()
    }

    private func promptExternalChange(for url: URL, diskMTime: Date?) {
        // 같은 alert이 연달아 뜨는 걸 막는다 (외부에서 빠르게 여러 번 저장하는 케이스)
        if externalChangeAlertVisible { return }
        externalChangeAlertVisible = true
        defer { externalChangeAlertVisible = false }

        let alert = NSAlert()
        alert.messageText = "외부에서 파일이 변경되었습니다"
        alert.informativeText = "\(url.lastPathComponent)이(가) 다른 곳에서 수정되었지만 현재 편집 중인 변경사항이 저장되지 않았습니다."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "내 변경 유지")     // 디스크 무시, 다음 저장 시 덮어씀
        alert.addButton(withTitle: "디스크에서 불러오기")  // 내 변경 폐기

        let response = alert.runModal()
        if response == .alertSecondButtonReturn {
            reloadFromDisk(url: url, diskMTime: diskMTime)
        } else {
            // 디스크 mtime을 알아둬야 다음 외부 변경 시 다시 prompt 가능
            lastKnownMTime = diskMTime
        }
    }

    // MARK: - Lifecycle

    func releaseRootFolderAccess() {
        stopFileWatcher()
        rootFolder?.stopAccessingSecurityScopedResource()
    }
}
