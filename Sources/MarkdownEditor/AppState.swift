import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class AppState: ObservableObject {
    @Published var rootFolder: URL?
    @Published var fileTree: [FileNode] = []
    @Published var selectedFile: URL?
    @Published var documentText: String = ""
    @Published var theme: Theme = .light
    @Published var isDirty: Bool = false
    @Published var debugLog: String = "ready"

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
        if let raw = UserDefaults.standard.string(forKey: "theme"),
           let t = Theme(rawValue: raw) {
            self.theme = t
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
        fileTree = FileNode.scan(root).children ?? []
    }

    // MARK: - File ops

    func selectFile(_ url: URL) {
        flushPendingSave()
        stopFileWatcher()
        selectedFile = url
        documentText = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        isDirty = false
        lastKnownMTime = currentMTime(of: url)
        startFileWatcher(for: url)
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

    func textChanged(_ newValue: String) {
        documentText = newValue
        isDirty = true
        scheduleAutosave()
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

    // MARK: - Theme & Sidebar

    func setTheme(_ t: Theme) {
        theme = t
        UserDefaults.standard.set(t.rawValue, forKey: "theme")
    }

    func cycleTheme() {
        let all = Theme.allCases
        let next = (all.firstIndex(of: theme).map { ($0 + 1) % all.count } ?? 0)
        setTheme(all[next])
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
