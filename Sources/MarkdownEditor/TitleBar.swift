import SwiftUI

/// toolbar 가운데에 표시되는 `파일명 — Edited 2분 전` 형태.
/// mock A safe variant 토큰: 파일명 13/600, 시간 11/#a0a0a5.
struct TitleBar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack(spacing: 8) {
            Text(state.selectedFile?.lastPathComponent ?? "Untitled")
                .font(.custom("Caveat", size: 26))
                .fontWeight(.semibold)
                .foregroundColor(.nbInk)
                .lineLimit(1)
                .truncationMode(.middle)
            if state.isDirty {
                Circle().fill(Color.nbAccent).frame(width: 7, height: 7)
            }
            Spacer()
            Text("✎ auto-saved")
                .font(.custom("Caveat", size: 20))
                .foregroundColor(.nbInkLight)
                .padding(.trailing, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
