import Foundation

/// 달필 왼쪽(노트) 손글씨 폰트 — Tweaks "손글씨" 3종.
/// rawValue는 JS `appBridge.setHandFont(key)`의 key와 일치한다.
/// 코드/표 카드는 항상 모노(SF Mono)로 고정.
enum EditorFont: String, CaseIterable, Identifiable {
    case gaegu       // 개구 — 기본, 읽기 쉬움
    case nanumpen    // 펜 — 흘림
    case gowun       // 정자 — 또렷

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .gaegu:    return "개구 (Gaegu)"
        case .nanumpen: return "펜 (Nanum Pen)"
        case .gowun:    return "정자 (Gowun Batang)"
        }
    }

    /// 사이드바(파일트리/푸터)가 에디터와 같은 손글씨를 쓰도록 SwiftUI Font.custom 이름.
    var swiftUIFontName: String? {
        switch self {
        case .gaegu:    return "Gaegu"
        case .nanumpen: return "Nanum Pen Script"
        case .gowun:    return "Gowun Batang"
        }
    }
}
