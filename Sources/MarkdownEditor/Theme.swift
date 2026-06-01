import SwiftUI
import AppKit

enum Theme: String, CaseIterable, Identifiable {
    case light, dark, sepia, paper

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .light: return "Light"
        case .dark:  return "Dark"
        case .sepia: return "Sepia"
        case .paper: return "Paper"
        }
    }

    var shortcut: KeyEquivalent {
        switch self {
        case .light: return "1"
        case .dark:  return "2"
        case .sepia: return "3"
        case .paper: return "4"
        }
    }

    // MARK: - NSColor (에디터/룰러용)

    // PAL_LIGHT: #fdfbf5 paper, #1a2a4a ink, #c8442a accent (README §Design tokens).
    // PAL_NIGHT: #1b2233 paper, #f0e8d3 ink, #e8826b accent.
    var editorBackgroundNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 253.0/255, green: 251.0/255, blue: 245.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed:  27.0/255, green:  34.0/255, blue:  51.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.97, green: 0.94, blue: 0.89, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.98, green: 0.98, blue: 0.97, alpha: 1)
        }
    }

    var foregroundNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed:  26.0/255, green:  42.0/255, blue:  74.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 240.0/255, green: 232.0/255, blue: 211.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.23, green: 0.18, blue: 0.14, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.14, green: 0.16, blue: 0.18, alpha: 1)
        }
    }

    /// 마크다운 마커(`#`, `**`, `[]()` 등) — 강하게 흐리게. inkFaint 톤.
    var markerNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 160.0/255, green: 174.0/255, blue: 189.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 107.0/255, green:  94.0/255, blue:  68.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.62, green: 0.55, blue: 0.45, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.70, green: 0.71, blue: 0.74, alpha: 1)
        }
    }

    /// 보조 텍스트 (인용문 본문 등). inkLight 톤.
    var secondaryNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed:  90.0/255, green: 106.0/255, blue: 133.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 168.0/255, green: 152.0/255, blue: 120.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.45, green: 0.38, blue: 0.30, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.42, green: 0.44, blue: 0.46, alpha: 1)
        }
    }

    var codeBackgroundNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 255.0/255, green: 250.0/255, blue: 239.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.04)
        case .sepia: return NSColor(srgbRed: 0.93, green: 0.89, blue: 0.81, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.94, green: 0.94, blue: 0.93, alpha: 1)
        }
    }

    var codeForegroundNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 200.0/255, green:  68.0/255, blue:  42.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 232.0/255, green: 130.0/255, blue: 107.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.55, green: 0.20, blue: 0.10, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.62, green: 0.18, blue: 0.36, alpha: 1)
        }
    }

    var linkNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 200.0/255, green:  68.0/255, blue:  42.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 232.0/255, green: 130.0/255, blue: 107.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.55, green: 0.29, blue: 0.10, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.04, green: 0.41, blue: 0.85, alpha: 1)
        }
    }

    var listMarkerNS: NSColor {
        switch self {
        case .light: return NSColor(srgbRed: 200.0/255, green:  68.0/255, blue:  42.0/255, alpha: 1)
        case .dark:  return NSColor(srgbRed: 232.0/255, green: 130.0/255, blue: 107.0/255, alpha: 1)
        case .sepia: return NSColor(srgbRed: 0.45, green: 0.55, blue: 0.30, alpha: 1)
        case .paper: return NSColor(srgbRed: 0.30, green: 0.60, blue: 0.55, alpha: 1)
        }
    }

    var rulerBackgroundNS: NSColor {
        editorBackgroundNS.blended(withFraction: 0.04, of: foregroundNS) ?? editorBackgroundNS
    }

    var rulerLabelNS: NSColor {
        markerNS.withAlphaComponent(0.85)
    }

    var separatorNS: NSColor {
        switch self {
        case .light: return NSColor(white: 0, alpha: 0.08)
        case .dark:  return NSColor(white: 1, alpha: 0.08)
        case .sepia: return NSColor(srgbRed: 0.65, green: 0.55, blue: 0.40, alpha: 0.18)
        case .paper: return NSColor(white: 0, alpha: 0.07)
        }
    }

    // MARK: - SwiftUI Color (사이드바 등)

    var editorBackground: Color { Color(nsColor: editorBackgroundNS) }
    var sidebarBackground: Color { Color(nsColor: editorBackgroundNS.blended(withFraction: 0.025, of: foregroundNS) ?? editorBackgroundNS) }
    /// 흰배경에서도 시각적으로 뚜렷한 사이드바 배경
    var sidebarBackgroundStrong: Color {
        switch self {
        case .light: return Color(red: 0.95, green: 0.95, blue: 0.97)
        // README §Dark — sidebarBg #161c2b (paper보다 약간 더 어둡게).
        case .dark:  return Color(red: 22/255, green: 28/255, blue: 43/255)
        case .sepia: return Color(red: 0.93, green: 0.89, blue: 0.81)
        case .paper: return Color(red: 0.95, green: 0.95, blue: 0.94)
        }
    }
    var sidebarForeground: Color { Color(nsColor: foregroundNS) }
    var sidebarSecondary: Color { Color(nsColor: secondaryNS) }
    var accent: Color { Color(nsColor: linkNS) }

    /// SwiftUI ColorScheme 힌트 (사이드바 컨트롤이 자연스럽게 보이도록)
    var colorScheme: ColorScheme { self == .dark ? .dark : .light }
}

// MARK: - Notebook Light palette tokens (chrome reskin)

extension Color {
    static let nbPaper = Color(red: 253/255, green: 251/255, blue: 245/255)
    static let nbInk = Color(red: 26/255, green: 42/255, blue: 74/255)
    static let nbInkLight = Color(red: 90/255, green: 106/255, blue: 133/255)
    static let nbAccent = Color(red: 200/255, green: 68/255, blue: 42/255)
    static let nbCurrent = Color(red: 200/255, green: 68/255, blue: 42/255, opacity: 0.10)
}
