import SwiftUI
import AppKit

/// Refract 5 테마 — Night(기본 다크) / Day(밝음) / Sepia(따뜻한 종이) /
/// Forest(녹색 다크) / Paper(손글씨, light).
/// spec: design_handoff_refract README §Design tokens.
enum Theme: String, CaseIterable, Identifiable {
    case night, day, sepia, forest, paper

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .night:  return "Night"
        case .day:    return "Day"
        case .sepia:  return "Sepia"
        case .forest: return "Forest"
        case .paper:  return "손글씨"
        }
    }

    var isDark: Bool {
        switch self {
        case .night, .forest: return true
        case .day, .sepia, .paper: return false
        }
    }

    /// SwiftUI ColorScheme — 사이드바 컨트롤이 자연스럽게 그려지도록.
    var colorScheme: ColorScheme { isDark ? .dark : .light }

    /// ⌘⇧1–5 (cycle order).
    var shortcut: KeyEquivalent {
        switch self {
        case .night:  return "1"
        case .day:    return "2"
        case .sepia:  return "3"
        case .forest: return "4"
        case .paper:  return "5"
        }
    }

    // MARK: - Tokens (single source of truth)

    var tokens: ThemeTokens {
        switch self {
        case .night:  return Theme.nightTokens
        case .day:    return Theme.dayTokens
        case .sepia:  return Theme.sepiaTokens
        case .forest: return Theme.forestTokens
        case .paper:  return Theme.paperTokens
        }
    }

    /// JS 브릿지로 보낼 CSS var dict — NSColor를 hex/rgba 문자열로 직렬화.
    var cssVars: [String: String] {
        let t = tokens
        var v: [String: String] = [
            "bg":         t.bg.cssString,
            "rawBg":      t.rawBg.cssString,
            "renBg":      t.renBg.cssString,
            "ink":        t.ink.cssString,
            "sub":        t.sub.cssString,
            "faint":      t.faint.cssString,
            "line":       t.line.cssString,
            "accent":     t.accent.cssString,
            "accentDim":  t.accentDim.cssString,
            "active":     t.active.cssString,
            "chipBg":     t.chipBg.cssString,
            "chipFg":     t.chipFg.cssString,
            "link":       t.link.cssString,
            "codeCard":   t.codeCard.cssString,
            "syn-keyword":     t.synKeyword.cssString,
            "syn-type":        t.synType.cssString,
            "syn-function":    t.synFunction.cssString,
            "syn-string":      t.synString.cssString,
            "syn-number":      t.synNumber.cssString,
            "syn-comment":     t.synComment.cssString,
            "syn-default":     t.synDefault.cssString,
            "syn-punctuation": t.synPunctuation.cssString,
            "fs":         "\(t.fs)",
        ]
        if let f = t.bodyFont { v["body-font"] = f } else { v["body-font"] = "system-ui" }
        if let f = t.headFont { v["head-font"] = f } else { v["head-font"] = "system-ui" }
        if let r = t.rule { v["rule"] = r.cssString } else { v["rule"] = "transparent" }
        return v
    }

    // MARK: - Chrome colors (사이드바/윈도우 — 자주 쓰이는 것만 직접 노출)

    var windowBg: NSColor   { tokens.bg }
    var sidebarBg: NSColor  { tokens.rawBg }
    var ink: NSColor        { tokens.ink }
    var sub: NSColor        { tokens.sub }
    var accent: NSColor     { tokens.accent }
    var line: NSColor       { tokens.line }
    var active: NSColor     { tokens.active }

    var windowBgColor: Color  { Color(nsColor: windowBg) }
    var sidebarBgColor: Color { Color(nsColor: sidebarBg) }
    var inkColor: Color       { Color(nsColor: ink) }
    var subColor: Color       { Color(nsColor: sub) }
    var accentColor: Color    { Color(nsColor: accent) }
    var lineColor: Color      { Color(nsColor: line) }
    var activeColor: Color    { Color(nsColor: active) }

    // MARK: - Static token tables

    // 모든 hex 값은 spec README L130–184 그대로.

    private static let nightTokens = ThemeTokens(
        bg:           rgb(0x0d, 0x0e, 0x16),
        rawBg:        rgb(0x0c, 0x0d, 0x14),
        renBg:        rgb(0x10, 0x12, 0x1e),
        ink:          rgb(0xe7, 0xe9, 0xf6),
        sub:          rgb(0x9a, 0xa0, 0xbd),
        faint:        rgb(0x56, 0x5d, 0x7e),
        line:         rgba(255, 255, 255, 0.06),
        accent:       rgb(0x8b, 0x94, 0xff),
        accentDim:    rgba(139, 148, 255, 0.55),
        active:       rgba(139, 148, 255, 0.07),
        chipBg:       rgba(158, 206, 106, 0.12),
        chipFg:       rgb(0x9e, 0xce, 0x6a),
        link:         rgb(0x82, 0xaa, 0xff),
        codeCard:     rgba(0x15, 0x17, 0x24, 0.50),
        synKeyword:     rgb(0xbb, 0x9a, 0xf7),
        synType:        rgb(0x2a, 0xc3, 0xde),
        synFunction:    rgb(0x82, 0xaa, 0xff),
        synString:      rgb(0x9e, 0xce, 0x6a),
        synNumber:      rgb(0xff, 0x9e, 0x64),
        synComment:     rgb(0x56, 0x5f, 0x89),
        synDefault:     rgb(0xc7, 0xcd, 0xf0),
        synPunctuation: rgb(0x7f, 0x86, 0xa8),
        bodyFont: nil, headFont: nil, fs: 1.0, rule: nil
    )

    private static let dayTokens = ThemeTokens(
        bg:           rgb(0xff, 0xff, 0xff),
        rawBg:        rgb(0xfb, 0xfb, 0xfe),
        renBg:        rgb(0xff, 0xff, 0xff),
        ink:          rgb(0x1b, 0x1d, 0x2a),
        sub:          rgb(0x56, 0x5b, 0x73),
        faint:        rgb(0xa4, 0xa9, 0xbd),
        line:         rgba(20, 22, 40, 0.09),
        accent:       rgb(0x5b, 0x5c, 0xf0),
        accentDim:    rgba(91, 92, 240, 0.50),
        active:       rgba(91, 92, 240, 0.05),
        chipBg:       rgb(0xee, 0xf6, 0xee),
        chipFg:       rgb(0x2f, 0x9e, 0x44),
        link:         rgb(0x5b, 0x5c, 0xf0),
        codeCard:     rgb(0xf7, 0xf7, 0xfc),
        synKeyword:     rgb(0xd6, 0x33, 0x6c),
        synType:        rgb(0x0c, 0x85, 0x99),
        synFunction:    rgb(0x67, 0x41, 0xd9),
        synString:      rgb(0x2f, 0x9e, 0x44),
        synNumber:      rgb(0xe8, 0x59, 0x0c),
        synComment:     rgb(0xa4, 0xa9, 0xbd),
        synDefault:     rgb(0x3a, 0x3f, 0x55),
        synPunctuation: rgb(0x7a, 0x80, 0x96),
        bodyFont: nil, headFont: nil, fs: 1.0, rule: nil
    )

    private static let sepiaTokens = ThemeTokens(
        bg:           rgb(0xf4, 0xec, 0xd8),
        rawBg:        rgb(0xef, 0xe6, 0xcf),
        renBg:        rgb(0xf7, 0xef, 0xdc),
        ink:          rgb(0x3b, 0x2f, 0x1e),
        sub:          rgb(0x6b, 0x5a, 0x40),
        faint:        rgb(0xa8, 0x99, 0x7c),
        line:         rgba(80, 60, 30, 0.14),
        accent:       rgb(0xb5, 0x65, 0x1d),
        accentDim:    rgba(181, 101, 29, 0.50),
        active:       rgba(181, 101, 29, 0.06),
        chipBg:       rgb(0xe8, 0xda, 0xbb),
        chipFg:       rgb(0x8a, 0x5a, 0x2b),
        link:         rgb(0x9a, 0x5b, 0x2a),
        codeCard:     rgb(0xef, 0xe4, 0xca),
        synKeyword:     rgb(0xa8, 0x32, 0x32),
        synType:        rgb(0x3f, 0x7a, 0x5f),
        synFunction:    rgb(0x8a, 0x5a, 0x2b),
        synString:      rgb(0x5b, 0x8a, 0x3a),
        synNumber:      rgb(0xc2, 0x70, 0x1c),
        synComment:     rgb(0xb0, 0xa1, 0x84),
        synDefault:     rgb(0x4a, 0x3c, 0x28),
        synPunctuation: rgb(0x8a, 0x7a, 0x5c),
        bodyFont: nil, headFont: nil, fs: 1.0, rule: nil
    )

    private static let forestTokens = ThemeTokens(
        bg:           rgb(0x0e, 0x17, 0x14),
        rawBg:        rgb(0x0c, 0x15, 0x12),
        renBg:        rgb(0x10, 0x1e, 0x19),
        ink:          rgb(0xd8, 0xe9, 0xdf),
        sub:          rgb(0x8f, 0xae, 0x9f),
        faint:        rgb(0x54, 0x70, 0x5f),
        line:         rgba(255, 255, 255, 0.06),
        accent:       rgb(0x58, 0xc8, 0x96),
        accentDim:    rgba(88, 200, 150, 0.50),
        active:       rgba(88, 200, 150, 0.07),
        chipBg:       rgba(229, 192, 123, 0.12),
        chipFg:       rgb(0xe5, 0xc0, 0x7b),
        link:         rgb(0x6f, 0xd0, 0xa0),
        codeCard:     rgb(0x0f, 0x1c, 0x17),
        synKeyword:     rgb(0xe3, 0x94, 0xdd),
        synType:        rgb(0x5c, 0xcf, 0xe6),
        synFunction:    rgb(0x7e, 0xe0, 0xb8),
        synString:      rgb(0xc3, 0xe8, 0x8d),
        synNumber:      rgb(0xff, 0xcb, 0x6b),
        synComment:     rgb(0x4a, 0x6a, 0x59),
        synDefault:     rgb(0xcf, 0xe6, 0xda),
        synPunctuation: rgb(0x6f, 0x8a, 0x7c),
        bodyFont: nil, headFont: nil, fs: 1.0, rule: nil
    )

    /// 손글씨 — PREVIEW만 Kalam(body)/Caveat(heading)으로 바뀌고 paper ruling 추가.
    /// SOURCE는 어떤 테마든 mono 유지.
    private static let paperTokens = ThemeTokens(
        bg:           rgb(0xfb, 0xf7, 0xec),
        rawBg:        rgb(0xf2, 0xea, 0xd7),
        renBg:        rgb(0xfd, 0xfa, 0xf0),
        ink:          rgb(0x2b, 0x3a, 0x55),
        sub:          rgb(0x56, 0x65, 0x83),
        faint:        rgb(0xa6, 0xab, 0xbc),
        line:         rgba(43, 58, 85, 0.13),
        accent:       rgb(0xd2, 0x54, 0x3e),
        accentDim:    rgba(210, 84, 62, 0.50),
        active:       rgba(210, 84, 62, 0.06),
        chipBg:       rgb(0xef, 0xe6, 0xd2),
        chipFg:       rgb(0xb5, 0x70, 0x1a),
        link:         rgb(0x2f, 0x6f, 0xb0),
        codeCard:     rgb(0xf2, 0xea, 0xd7),
        synKeyword:     rgb(0xc0, 0x39, 0x2b),
        synType:        rgb(0x2f, 0x7a, 0x4f),
        synFunction:    rgb(0x2f, 0x6f, 0xb0),
        synString:      rgb(0xb5, 0x70, 0x1a),
        synNumber:      rgb(0x2a, 0x6a, 0x8a),
        synComment:     rgb(0x9a, 0x8c, 0x6a),
        synDefault:     rgb(0x3a, 0x3f, 0x55),
        synPunctuation: rgb(0x7a, 0x80, 0x96),
        bodyFont: "\"Kalam\", \"Comic Sans MS\", sans-serif",
        headFont: "\"Caveat\", \"Kalam\", cursive",
        fs:   1.22,
        rule: rgba(43, 58, 85, 0.10)
    )

    // MARK: - Color helpers

    private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> NSColor {
        NSColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: 1)
    }
    private static func rgba(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat) -> NSColor {
        NSColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a)
    }
}

/// 한 테마의 모든 토큰을 들고 있는 값타입.
/// Web/Native 양쪽에서 단일 source of truth.
struct ThemeTokens {
    let bg: NSColor
    let rawBg: NSColor
    let renBg: NSColor
    let ink: NSColor
    let sub: NSColor
    let faint: NSColor
    let line: NSColor
    let accent: NSColor
    let accentDim: NSColor
    let active: NSColor
    let chipBg: NSColor
    let chipFg: NSColor
    let link: NSColor
    let codeCard: NSColor
    let synKeyword: NSColor
    let synType: NSColor
    let synFunction: NSColor
    let synString: NSColor
    let synNumber: NSColor
    let synComment: NSColor
    let synDefault: NSColor
    let synPunctuation: NSColor
    /// PREVIEW body font(손글씨 테마만 비 nil). nil이면 system-ui.
    let bodyFont: String?
    /// PREVIEW heading font.
    let headFont: String?
    /// PREVIEW size multiplier(spec: 손글씨 1.22, 그 외 1.0).
    let fs: Double
    /// Paper ruling color(손글씨만 non-nil).
    let rule: NSColor?
}

/// NSColor → CSS 직렬화. Alpha < 1이면 rgba(), 아니면 #rrggbb.
extension NSColor {
    var cssString: String {
        guard let c = usingColorSpace(.sRGB) else { return "#000" }
        let r = Int((c.redComponent * 255).rounded())
        let g = Int((c.greenComponent * 255).rounded())
        let b = Int((c.blueComponent * 255).rounded())
        if c.alphaComponent < 0.999 {
            return String(format: "rgba(%d,%d,%d,%.3f)", r, g, b, c.alphaComponent)
        }
        return String(format: "#%02x%02x%02x", r, g, b)
    }
}
