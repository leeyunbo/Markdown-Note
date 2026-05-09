import SwiftUI

/// toolbar 가운데에 표시되는 `파일명 — Edited 2분 전` 형태.
/// mock A safe variant 토큰: 파일명 13/600, 시간 11/#a0a0a5.
struct TitleBar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            HStack(spacing: 6) {
                Text(displayName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(red: 0.11, green: 0.11, blue: 0.12))
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let mtime = state.selectedFileMtime {
                    Text("— Edited \(relativeText(from: mtime, now: context.date))")
                        .font(.system(size: 11))
                        .foregroundStyle(Color(red: 0.63, green: 0.63, blue: 0.65))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private var displayName: String {
        state.selectedFile?.lastPathComponent ?? "Markdown Note"
    }

    private func relativeText(from date: Date, now: Date) -> String {
        let secs = max(0, Int(now.timeIntervalSince(date)))
        if secs < 60 { return "방금 전" }
        let mins = secs / 60
        if mins < 60 { return "\(mins)분 전" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)시간 전" }
        let days = hours / 24
        if days < 7 { return "\(days)일 전" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "M월 d일"
        return f.string(from: date)
    }
}
