import AppKit
import SwiftUI

/// 디자인 시스템 (chrome.jsx) 의 inline SVG → NSImage. macOS 14+에서 SVG 직접 디코딩.
enum DesignIcon {
    static let sidebar  = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.1"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5"/><line x1="5.5" y1="3" x2="5.5" y2="12"/></svg>"#)
    static let search   = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="5.5" cy="5.5" r="4"/><path d="M8.5 8.5l3 3" stroke-linecap="round"/></svg>"#)
    static let plus     = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M6.5 2v9M2 6.5h9"/></svg>"#)
    static let folder   = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 4l1.2-1.5h3l1 1.5h5V11H1.5z"/></svg>"#)
    static let folderOpen = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 3.5l1.2-1.5h3l1 1.5h5v2H1.5z"/><path d="M1.5 5.5h11l-1.2 5.5h-9.6z"/></svg>"#)
    static let file     = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M1.5 1.5h6l3 3v7h-9z"/><path d="M7.5 1.5v3h3"/></svg>"#)
    static let chevron  = svg(#"<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 1.5l3 3-3 3"/></svg>"#)

    private static func svg(_ markup: String) -> NSImage? {
        guard let data = markup.data(using: .utf8) else { return nil }
        let img = NSImage(data: data)
        img?.isTemplate = true
        return img
    }
}

struct DesignIconView: View {
    let image: NSImage?
    var size: CGFloat? = nil

    var body: some View {
        if let img = image {
            Image(nsImage: img)
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .frame(width: size, height: size)
        } else {
            Color.clear.frame(width: size ?? 0, height: size ?? 0)
        }
    }
}
