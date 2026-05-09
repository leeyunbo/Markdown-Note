import Foundation

struct FileNode: Identifiable, Hashable {
    let id: URL
    let url: URL
    let name: String
    let isDirectory: Bool
    var children: [FileNode]?

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
                if !(node.children?.isEmpty ?? true) {
                    dirs.append(node)
                }
            } else if child.pathExtension.lowercased() == "md" || child.pathExtension.lowercased() == "markdown" {
                files.append(FileNode(id: child, url: child,
                                      name: child.lastPathComponent,
                                      isDirectory: false, children: nil))
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
