import SwiftUI

/// Inline gutter card — 에디터 우측 200px sticky pane.
/// design_handoff_toc_inline의 VariantTOC_Inline 토큰을 따른다.
struct TocPanel: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {
                Text("On this page")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.5)
                    .foregroundStyle(Color(red: 0.63, green: 0.63, blue: 0.65))
                    .textCase(.uppercase)
                    .padding(.leading, 8)
                    .padding(.bottom, 10)

                ForEach(Array(state.outline.enumerated()), id: \.element.id) { idx, h in
                    TocRow(heading: h, isCurrent: state.activeOutlineIndex == idx)
                }
            }
            .padding(.top, 20)
            .padding(.trailing, 24)
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(Color.white)
    }
}

private struct TocRow: View {
    @EnvironmentObject var state: AppState
    let heading: AppState.Heading
    let isCurrent: Bool

    var body: some View {
        Button(action: jump) {
            HStack(alignment: .center, spacing: 8) {
                // 2×12 active rail (non-active도 같은 폭 reserve)
                RoundedRectangle(cornerRadius: 1)
                    .fill(isCurrent ? Color(red: 0, green: 0.4, blue: 0.8) : Color.clear)
                    .frame(width: 2, height: 12)

                Text(heading.text)
                    .font(.system(size: rowFontSize, weight: rowFontWeight))
                    .foregroundStyle(rowColor)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .padding(.leading, indent)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(isCurrent ? Color(red: 0, green: 0.4, blue: 0.8).opacity(0.08) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(heading.text)
    }

    private var indent: CGFloat {
        // H1 indent 0; H2/H3 indent 10
        heading.level == 1 ? 0 : 10
    }

    private var rowFontSize: CGFloat {
        heading.level == 1 ? 12.5 : 12
    }

    private var rowFontWeight: Font.Weight {
        if isCurrent { return .semibold }
        return heading.level == 1 ? .semibold : .regular
    }

    private var rowColor: Color {
        if isCurrent { return Color(red: 0, green: 0.4, blue: 0.8) }
        return heading.level == 1
            ? Color(red: 0.11, green: 0.11, blue: 0.12)
            : Color(red: 0.235, green: 0.235, blue: 0.247)
    }

    private func jump() {
        NotificationCenter.default.post(name: .outlineNavigateRequested, object: heading.lineIdx)
    }
}
