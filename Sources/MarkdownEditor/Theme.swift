import SwiftUI
import AppKit

/// 달필 (Dalpil) 단일 팔레트 — 따뜻한 종이/잉크.
/// 멀티테마(Night/Day/Sepia/Forest)는 제거됐다. 변수축은 테마가 아니라
/// 손글씨 폰트·종이 결·토큰 노출(Tweaks)이다. 이 타입은 네이티브 chrome
/// (사이드바/윈도우/팔레트/환경설정)이 쓰는 색 한 벌만 제공한다.
/// 웹(editor.html)의 토큰은 :root에 직접 박혀 있어 브릿지로 보낼 필요가 없다.
enum Theme: String, CaseIterable, Identifiable {
    case dalpil

    var id: String { rawValue }
    var displayName: String { "달필" }

    var tokens: ThemeTokens { Theme.dalpilTokens }

    // MARK: - Chrome colors

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

    // MARK: - Tokens (달필 핸드오프 RGB 그대로)

    private static let dalpilTokens = ThemeTokens(
        bg:     rgb(0xf6, 0xf0, 0xe2),   // --paper
        rawBg:  rgb(0xef, 0xe7, 0xd4),   // --paper-edge (사이드바/상태바)
        renBg:  rgb(0xfb, 0xfa, 0xf6),   // --page
        ink:    rgb(0x34, 0x30, 0x2a),   // --ink
        sub:    rgb(0x6f, 0x68, 0x5c),   // --ink-soft
        accent: rgb(0xb5, 0x6a, 0x4f),   // --accent (테라코타)
        line:   rgba(52, 48, 42, 0.12),
        active: rgba(181, 106, 79, 0.08)
    )

    private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> NSColor {
        NSColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: 1)
    }
    private static func rgba(_ r: Int, _ g: Int, _ b: Int, _ a: CGFloat) -> NSColor {
        NSColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: a)
    }
}

/// 달필 chrome 색 한 벌.
struct ThemeTokens {
    let bg: NSColor
    let rawBg: NSColor
    let renBg: NSColor
    let ink: NSColor
    let sub: NSColor
    let accent: NSColor
    let line: NSColor
    let active: NSColor
}
