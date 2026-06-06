import SwiftUI

/// Refract Preferences window (SwiftUI Settings scene).
/// 테마 갤러리(MiniEditor 카드 5개) + 동작 토글 + 본문 크기 슬라이더.
struct RefractPrefs: View {
    @EnvironmentObject var state: AppState
    @State private var selectedTab: Tab = .theme
    @AppStorage("refract.typingEffects") private var typingEffects: Bool = true
    @AppStorage("refract.respectReducedMotion") private var respectReducedMotion: Bool = true
    @AppStorage("refract.bodyFontSize") private var bodyFontSize: Double = 15.0

    enum Tab: String, CaseIterable, Identifiable {
        case theme = "테마"
        case typography = "타이포그래피"
        case behavior = "동작"
        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.4)
            ScrollView { content.padding(20) }
        }
        .frame(width: 772, height: 540)
        .background(state.theme.windowBgColor)
    }

    private var header: some View {
        HStack(spacing: 14) {
            // Spectrum glyph
            HStack(spacing: 3) {
                ForEach([Color(red: 99/255, green: 102/255, blue: 241/255),
                         Color(red: 14/255, green: 165/255, blue: 233/255),
                         Color(red: 16/255, green: 185/255, blue: 129/255),
                         Color(red: 245/255, green: 158/255, blue: 11/255)], id: \.self) { c in
                    Capsule().fill(c).frame(width: 3.5, height: 15)
                }
            }
            Text("환경설정")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(state.theme.inkColor)
            Spacer()
            // segmented tabs
            HStack(spacing: 2) {
                ForEach(Tab.allCases) { tab in
                    Button {
                        selectedTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.system(size: 12))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(selectedTab == tab ? state.theme.windowBgColor : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .foregroundColor(selectedTab == tab ? state.theme.inkColor : state.theme.subColor)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .background(state.theme.sidebarBgColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private var content: some View {
        switch selectedTab {
        case .theme: themeTab
        case .typography: typographyTab
        case .behavior: behaviorTab
        }
    }

    // MARK: - Theme tab

    private var themeTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("테마")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .tracking(1.5)
                .foregroundColor(state.theme.subColor.opacity(0.7))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                ForEach(Theme.allCases) { t in
                    ThemeCard(theme: t, isSelected: state.theme == t) {
                        state.setTheme(t)
                    }
                }
            }
            Divider().padding(.vertical, 8)
            VStack(alignment: .leading, spacing: 10) {
                Toggle("타이핑 효과 — 잉크 링 · 프리즘 굴절", isOn: $typingEffects)
                Toggle("시스템 \"줄임 모션\" 존중", isOn: $respectReducedMotion)
                HStack(spacing: 12) {
                    Text("본문 크기").foregroundColor(state.theme.inkColor)
                    Slider(value: $bodyFontSize, in: 12...20, step: 0.5)
                        .frame(maxWidth: 280)
                    Text(String(format: "%.1f", bodyFontSize)).foregroundColor(state.theme.subColor)
                        .frame(width: 40, alignment: .leading)
                }
            }
            .font(.system(size: 13))
            .foregroundColor(state.theme.inkColor)
        }
    }

    // MARK: - Typography tab

    private var typographyTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("타이포그래피")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .tracking(1.5)
                .foregroundColor(state.theme.subColor.opacity(0.7))
            HStack {
                Text("본문 크기").foregroundColor(state.theme.inkColor)
                Slider(value: $bodyFontSize, in: 12...20, step: 0.5)
                    .frame(maxWidth: 280)
                Text(String(format: "%.1f px", bodyFontSize)).foregroundColor(state.theme.subColor)
            }
            .font(.system(size: 13))
        }
    }

    // MARK: - Behavior tab

    private var behaviorTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("동작")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .tracking(1.5)
                .foregroundColor(state.theme.subColor.opacity(0.7))
            VStack(alignment: .leading, spacing: 10) {
                Toggle("타이핑 효과 — 잉크 링 · 프리즘 굴절", isOn: $typingEffects)
                Toggle("시스템 \"줄임 모션\" 존중", isOn: $respectReducedMotion)
            }
            .font(.system(size: 13))
            .foregroundColor(state.theme.inkColor)
        }
    }
}

/// 미니 split editor preview — 카드 안에 작은 source+seam+preview 미리보기.
private struct ThemeCard: View {
    let theme: Theme
    let isSelected: Bool
    let onSelect: () -> Void
    @EnvironmentObject var state: AppState

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 8) {
                MiniEditor(theme: theme)
                    .frame(height: 90)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isSelected ? theme.accentColor : theme.lineColor.opacity(2),
                                    lineWidth: isSelected ? 2 : 1)
                    )
                HStack(spacing: 6) {
                    Circle()
                        .fill(isSelected ? theme.accentColor : Color.clear)
                        .overlay(Circle().stroke(theme.subColor, lineWidth: 1))
                        .frame(width: 14, height: 14)
                    Text(theme.displayName)
                        .font(theme == .paper ? .custom("Caveat", size: 18) : .system(size: 13))
                        .foregroundColor(state.theme.inkColor)
                }
            }
            .padding(8)
            .background(state.theme.sidebarBgColor.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

/// 카드 안에 그리는 미니 Refract preview — source bar + seam + preview bar.
private struct MiniEditor: View {
    let theme: Theme

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let halfW = w / 2 - 2
            ZStack {
                theme.windowBgColor
                // Source column
                ZStack(alignment: .topLeading) {
                    Color(nsColor: theme.tokens.rawBg)
                    VStack(alignment: .leading, spacing: 4) {
                        miniRow(width: halfW * 0.7, color: theme.accentColor)
                        miniRow(width: halfW * 0.5, color: theme.subColor.opacity(0.5))
                        miniRow(width: halfW * 0.6, color: theme.subColor.opacity(0.5))
                        miniRow(width: halfW * 0.4, color: theme.accentColor.opacity(0.6))
                    }
                    .padding(8)
                }
                .frame(width: halfW, height: h)
                .offset(x: -halfW / 2 - 1.5)
                // Seam
                LinearGradient(colors: [
                    Color(red: 99/255, green: 102/255, blue: 241/255),
                    Color(red: 16/255, green: 185/255, blue: 129/255),
                    Color(red: 245/255, green: 158/255, blue: 11/255),
                    Color(red: 236/255, green: 72/255, blue: 153/255),
                ], startPoint: .top, endPoint: .bottom)
                .frame(width: 2, height: h - 10)
                // Preview column
                ZStack(alignment: .topLeading) {
                    Color(nsColor: theme.tokens.renBg)
                    VStack(alignment: .leading, spacing: 5) {
                        if theme == .paper {
                            Text("Aa")
                                .font(.custom("Caveat", size: 18))
                                .foregroundColor(theme.inkColor)
                        } else {
                            Rectangle().fill(theme.inkColor).frame(width: halfW * 0.6, height: 6).cornerRadius(1)
                        }
                        miniRow(width: halfW * 0.7, color: theme.subColor.opacity(0.5))
                        miniRow(width: halfW * 0.5, color: theme.subColor.opacity(0.5))
                        miniRow(width: halfW * 0.6, color: theme.subColor.opacity(0.5))
                    }
                    .padding(8)
                }
                .frame(width: halfW, height: h)
                .offset(x: halfW / 2 + 1.5)
            }
        }
    }

    private func miniRow(width: CGFloat, color: Color) -> some View {
        Rectangle()
            .fill(color)
            .frame(width: width, height: 3)
            .cornerRadius(1)
    }
}
