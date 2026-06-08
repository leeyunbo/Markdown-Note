import SwiftUI

/// 달필 환경설정 (SwiftUI Settings scene) — 헤더 Tweaks popover와 같은 3가지를
/// 네이티브에서도 조절. 단일 소스는 AppState(영속화), popover와 자동 동기화된다.
struct RefractPrefs: View {
    @EnvironmentObject var state: AppState

    private let papers: [(String, String)] = [
        ("ruled", "줄"), ("grid", "모눈"), ("dot", "도트"), ("plain", "무지"),
    ]
    private let toks: [(String, String)] = [
        ("show", "보임"), ("faint", "옅게"), ("hide", "숨김"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().opacity(0.4)
            VStack(alignment: .leading, spacing: 22) {
                handSection
                paperSection
                tokenSection
            }
            .padding(24)
            Spacer()
        }
        .frame(width: 520, height: 360)
        .background(state.theme.windowBgColor)
    }

    private var header: some View {
        HStack(spacing: 12) {
            // 펜촉 글리프
            Image(systemName: "pencil.tip")
                .foregroundColor(state.theme.accentColor)
                .font(.system(size: 18))
            Text("달필 — Tweaks")
                .font(.custom("Nanum Myeongjo", size: 17).weight(.heavy))
                .foregroundColor(state.theme.inkColor)
            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
    }

    private func label(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .tracking(1.2)
            .foregroundColor(state.theme.subColor.opacity(0.8))
    }

    private var handSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("손글씨")
            Picker("", selection: Binding(
                get: { state.editorFont },
                set: { state.setEditorFont($0) })) {
                ForEach(EditorFont.allCases) { f in
                    Text(f.displayName).tag(f)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }

    private var paperSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("종이 결")
            Picker("", selection: Binding(
                get: { state.paperTexture },
                set: { state.setPaperTexture($0) })) {
                ForEach(papers, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }

    private var tokenSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("마크다운 토큰")
            Picker("", selection: Binding(
                get: { state.tokenVisibility },
                set: { state.setTokenVisibility($0) })) {
                ForEach(toks, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }
}
