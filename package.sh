#!/bin/bash
# build + 패키징
# 사용법:
#   ./package.sh                # .app zip + 소스 zip (기본)
#   ./package.sh app            # .app zip 만
#   ./package.sh dmg            # .app dmg + 소스 zip
#   ./package.sh source         # 소스 zip 만
#   ./package.sh all            # zip + dmg + 소스
#   ./package.sh all ~/iCloud   # 출력 경로 지정

set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PROJECT_NAME="markdown-editor"

MODE="${1:-default}"
OUT_DIR="${2:-$HOME/Desktop}"
mkdir -p "$OUT_DIR"

# build.sh의 APP_NAME / VERSION과 일치시킴 (불일치 시 ditto/hdiutil이 빈 소스로 실패).
APP_NAME="Markdown Note"
VERSION="$(sed -n 's/^VERSION="\(.*\)"/\1/p' build.sh | head -1)"

zip_app() {
    ./build.sh release
    local APP="build/$APP_NAME.app"
    local ZIP="$OUT_DIR/Markdown-Note-v$VERSION.zip"
    echo "▸ app zip → $ZIP"
    rm -f "$ZIP"
    ditto -c -k --keepParent "$APP" "$ZIP"
}

dmg_app() {
    ./build.sh release
    local APP="build/$APP_NAME.app"
    local DMG="$OUT_DIR/Markdown-Note-v$VERSION.dmg"
    echo "▸ dmg → $DMG"
    rm -f "$DMG"
    hdiutil create -volname "Markdown Note" \
                   -srcfolder "$APP" \
                   -ov -format UDZO \
                   "$DMG" >/dev/null
}

zip_source() {
    local SRC_ZIP="$OUT_DIR/MarkdownEditor-source.zip"
    echo "▸ source zip → $SRC_ZIP"
    local TMP
    TMP="$(mktemp -d)"
    rsync -a \
        --exclude='.build/' \
        --exclude='build/' \
        --exclude='.DS_Store' \
        --exclude='*.swp' \
        --exclude='Package.resolved' \
        "$PROJECT_DIR/" "$TMP/$PROJECT_NAME/"
    rm -f "$SRC_ZIP"
    ditto -c -k --keepParent "$TMP/$PROJECT_NAME" "$SRC_ZIP"
    rm -rf "$TMP"
}

case "$MODE" in
    app) zip_app ;;
    dmg) dmg_app; zip_source ;;
    source) zip_source ;;
    all) zip_app; dmg_app; zip_source ;;
    default) zip_app; zip_source ;;
    *) echo "Unknown mode: $MODE"; exit 1 ;;
esac

echo ""
echo "✓ 완료"
ls -lh "$OUT_DIR"/Markdown-Note-v* 2>/dev/null

cat <<'EOF'

── 집 PC에서 ──────────────────────────────
[앱만 사용]
1. MarkdownEditor.zip(또는 dmg) 풀어서 /Applications/ 로 이동
2. 첫 실행 시 Gatekeeper가 막으면:
   xattr -cr /Applications/MarkdownEditor.app
3. open /Applications/MarkdownEditor.app

[소스 코드로 빌드/수정]
1. MarkdownEditor-source.zip 풀기
2. cd markdown-editor
3. ./build.sh release        # 빌드
4. open build/MarkdownEditor.app

요구사항: macOS 13.0+, Command Line Tools (`xcode-select --install`)
─────────────────────────────────────────────
EOF
