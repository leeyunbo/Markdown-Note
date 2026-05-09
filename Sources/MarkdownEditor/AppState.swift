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
        selectedFile = url
        documentText = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        isDirty = false
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
        do {
            try documentText.write(to: url, atomically: true, encoding: .utf8)
            isDirty = false
        } catch {
            NSSound.beep()
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
        do {
            flushPendingSave()
            try FileManager.default.moveItem(at: url, to: newURL)
            if selectedFile == url { selectedFile = newURL }
            refreshTree()
        } catch {
            NSSound.beep()
        }
    }

    func deleteFile(_ url: URL) {
        do {
            try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            if selectedFile == url {
                selectedFile = nil
                documentText = ""
                isDirty = false
            }
            refreshTree()
        } catch {
            NSSound.beep()
        }
    }

    func revealInFinder(_ url: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
}
