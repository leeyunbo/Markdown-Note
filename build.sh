#!/bin/bash
# SwiftPM 빌드 → MarkdownEditor.app 번들 패키징
# Xcode 없이 Command Line Tools 만으로 동작

set -euo pipefail

cd "$(dirname "$0")"

CONFIG="${1:-release}"
APP_NAME="MarkdownEditor"
BUNDLE_ID="com.daou.markdowneditor"
VERSION="1.0.0"

echo "▸ swift build -c $CONFIG"
swift build -c "$CONFIG"

BIN_DIR=$(swift build -c "$CONFIG" --show-bin-path)
BIN="$BIN_DIR/$APP_NAME"

if [[ ! -x "$BIN" ]]; then
    echo "✗ 빌드된 실행 파일을 찾을 수 없습니다: $BIN"
    exit 1
fi

APP_ROOT="build/$APP_NAME.app"
echo "▸ 번들 생성: $APP_ROOT"

rm -rf "$APP_ROOT"
mkdir -p "$APP_ROOT/Contents/MacOS"
mkdir -p "$APP_ROOT/Contents/Resources"

cp "$BIN" "$APP_ROOT/Contents/MacOS/$APP_NAME"

# SwiftPM 리소스 번들 (.bundle 폴더) 복사
shopt -s nullglob
for bundle in "$BIN_DIR"/*.bundle; do
    cp -R "$bundle" "$APP_ROOT/Contents/Resources/"
done
shopt -u nullglob

cat > "$APP_ROOT/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>ko</string>
    <key>CFBundleExecutable</key><string>$APP_NAME</string>
    <key>CFBundleIconFile</key><string></string>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key><string>$APP_NAME</string>
    <key>CFBundleDisplayName</key><string>Markdown Editor</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>$VERSION</string>
    <key>CFBundleVersion</key><string>$VERSION</string>
    <key>LSMinimumSystemVersion</key><string>13.0</string>
    <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSPrincipalClass</key><string>NSApplication</string>
    <key>NSSupportsAutomaticTermination</key><true/>
    <key>NSSupportsSuddenTermination</key><false/>
    <key>CFBundleDocumentTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeName</key><string>Markdown Document</string>
            <key>CFBundleTypeRole</key><string>Editor</string>
            <key>LSHandlerRank</key><string>Alternate</string>
            <key>LSItemContentTypes</key>
            <array>
                <string>net.daringfireball.markdown</string>
                <string>public.plain-text</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
EOF

# ad-hoc 코드 사인 (Gatekeeper 처음 실행 경고 회피)
echo "▸ 코드 사인 (ad-hoc)"
codesign --force --deep --sign - "$APP_ROOT" 2>/dev/null || true

# 격리 속성 제거
xattr -cr "$APP_ROOT" 2>/dev/null || true

echo ""
echo "✓ 완료: $APP_ROOT"
echo ""
echo "실행:  open $APP_ROOT"
echo "설치:  cp -R $APP_ROOT /Applications/"
