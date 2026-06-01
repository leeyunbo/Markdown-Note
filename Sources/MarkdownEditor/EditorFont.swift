import Foundation

/// 에디터 본문 폰트 옵션. 코드 블록은 항상 JetBrains Mono로 고정.
enum EditorFont: String, CaseIterable, Identifiable {
    case kalam
    case system
    case pretendard
    case jetbrainsMono
    case sfMono
    case iaWriterQuattro

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .kalam: return "Handwriting (Excalidraw + 나눔펜)"
        case .system: return "System Default"
        case .pretendard: return "Pretendard"
        case .jetbrainsMono: return "JetBrains Mono"
        case .sfMono: return "SF Mono"
        case .iaWriterQuattro: return "iA Writer Quattro"
        }
    }

    /// SwiftUI `Font.custom` 이름. nil이면 system 기본.
    /// 사이드바(StampBox / 파일트리 / 푸터)가 editor와 동일 font를 쓰도록 사용.
    var swiftUIFontName: String? {
        switch self {
        case .kalam: return "Kalam"  // 한글은 시스템 fallback
        case .system: return nil
        case .pretendard: return "Pretendard"
        case .jetbrainsMono: return "JetBrains Mono"
        case .sfMono: return nil  // Font.system(.monospaced)로 대체
        case .iaWriterQuattro: return "iA Writer Quattro"
        }
    }

    /// JS body/.cm-content fontFamily에 그대로 박는 CSS 값.
    /// 시스템에 없는 폰트는 fallback chain으로 안전.
    var cssFontFamily: String {
        switch self {
        case .kalam:
            // "Handwriting" 패밀리는 editor.html의 @font-face가 unicode-range로
            // Excalifont(라틴+기호) / NanumPenScript(한글)을 자동 선택한다.
            return "\"Handwriting\", -apple-system, \"Apple SD Gothic Neo\", sans-serif"
        case .system:
            return "-apple-system, \"Helvetica Neue\", \"Apple SD Gothic Neo\", sans-serif"
        case .pretendard:
            return "Pretendard, \"Pretendard Variable\", \"Apple SD Gothic Neo\", -apple-system, sans-serif"
        case .jetbrainsMono:
            return "\"JetBrains Mono\", ui-monospace, \"SF Mono\", Menlo, monospace"
        case .sfMono:
            return "\"SF Mono\", ui-monospace, Menlo, monospace"
        case .iaWriterQuattro:
            return "\"iA Writer Quattro\", \"iA Writer Quattro S\", \"Apple SD Gothic Neo\", -apple-system, sans-serif"
        }
    }
}
