import SwiftUI

/// Toolbar (JSX Toolbar L233-248):
///   title — Caveat 26/600 italic
///   dirty dot — accent 7×7 circle
///   flex
///   ✎ auto-saved — Caveat 20 inkLight
struct TitleBar: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        HStack(spacing: 8) {
            Text(state.selectedFile?.lastPathComponent ?? "Untitled")
                .font(.custom("NanumPenScript-Regular", size: 22))
                .foregroundColor(.nbInk)
                .lineLimit(1)
                .truncationMode(.middle)
                .fixedSize(horizontal: false, vertical: true)
            if state.isDirty {
                Circle().fill(Color.nbAccent).frame(width: 7, height: 7)
            }
            Spacer(minLength: 16)
            Text("✎ auto-saved")
                .font(.custom("NanumPenScript-Regular", size: 18))
                .foregroundColor(.nbInkLight)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.trailing, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
