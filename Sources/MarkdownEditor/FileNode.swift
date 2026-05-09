import Foundation

struct FileNode: Identifiable, Hashable {
    let id: URL
    let url: URL
    let name: String
    let isDirectory: Bool
    var children: [FileNode]?

    enum Kind { case markdown, image, other }
    var kind: Kind {
        if isDirectory { return .other }
        let ext = url.pathExtension.lowercased()
        if ext == "md" || ext == "markdown" { return .markdown }
        if ["png","jpg","jpeg","gif","webp","heic","bmp","svg"].contains(ext) { return .image }
        return .other
    }

    static func scan(_ url: URL) -> FileNode {
        let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
        guard isDir else {
            return FileNode(id: url, url: url, name: url.lastPathComponent, isDirectory: false, children: nil)
        }

        let fm = FileManager.default
        let contents = (try? fm.contentsOfDirectory(at: url,
                                                    includingPropertiesForKeys: [.isDirectoryKey],
                                                    options: [.skipsHiddenFiles])) ?? []

        var dirs: [FileNode] = []
        var files: [FileNode] = []

        for child in contents {
            let childIsDir = (try? child.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory ?? false
            if childIsDir {
                let node = scan(child)
                // attachments/ 는 이미지로 차있어 children이 비어있는 형태 — 빈 디렉토리도 보여준다.
                if child.lastPathComponent == "attachments"
                    || !(node.children?.isEmpty ?? true) {
                    dirs.append(node)
                }
            } else {
                let ext = child.pathExtension.lowercased()
                let isMd = (ext == "md" || ext == "markdown")
                let isImg = ["png","jpg","jpeg","gif","webp","heic","bmp","svg"].contains(ext)
                if isMd || isImg {
                    files.append(FileNode(id: child, url: child,
                                          name: child.lastPathComponent,
                                          isDirectory: false, children: nil))
                }
            }
        }

        dirs.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        files.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

        return FileNode(id: url, url: url,
                        name: url.lastPathComponent,
                        isDirectory: true,
                        children: dirs + files)
    }
}
