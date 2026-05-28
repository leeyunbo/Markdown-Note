#!/bin/bash
# 1. esbuild로 CodeMirror 번들 생성
# 2. swiftc로 직접 컴파일 (SwiftPM 매니페스트가 일부 toolchain에서 ABI 충돌하는 이슈 회피)
# 3. .app 번들 + ad-hoc codesign

set -euo pipefail

cd "$(dirname "$0")"

CONFIG="${1:-release}"
APP_NAME="Markdown Note"
BUNDLE_ID="com.daou.markdowneditor"
VERSION="1.4.0"

# CodeMirror 번들이 없거나 entry보다 오래되면 다시 만들기
if [[ ! -f Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ Sources/CoreEditor/src/index.ts -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]] \
   || [[ package.json -nt Sources/MarkdownEditor/Resources/cm.bundle.js ]]; then
    echo "▸ npm install (필요 시)"
    if [[ ! -d node_modules ]]; then
        npm install
    fi
    echo "▸ esbuild Sources/CoreEditor/src/index.ts → Resources/cm.bundle.js"
    npm run build
fi

# Swift 컴파일 옵션 — release면 -O, debug면 -Onone
if [[ "$CONFIG" == "release" ]]; then
    OPT_FLAG="-O"
else
    OPT_FLAG="-Onone"
fi

APP_ROOT="build/$APP_NAME.app"
echo "▸ 번들 생성: $APP_ROOT"
rm -rf "$APP_ROOT"
mkdir -p "$APP_ROOT/Contents/MacOS"
mkdir -p "$APP_ROOT/Contents/Resources"

# Sources에서 .swift 자동 수집 (새 파일 추가해도 그대로 동작)
SWIFT_FILES=(Sources/MarkdownEditor/*.swift)

echo "▸ swiftc $OPT_FLAG → $APP_ROOT/Contents/MacOS/$APP_NAME"
swiftc "$OPT_FLAG" \
    -target arm64-apple-macosx13.0 \
    -sdk "$(xcrun --show-sdk-path 2>/dev/null || echo /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk)" \
    -emit-executable \
    -o "$APP_ROOT/Contents/MacOS/$APP_NAME" \
    "${SWIFT_FILES[@]}"

# 리소스 복사 (vendor/ subdir도 포함되도록 recursive)
cp -R Sources/MarkdownEditor/Resources/* "$APP_ROOT/Contents/Resources/"

cat > "$APP_ROOT/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>ko</string>
    <key>CFBundleExecutable</key><string>$APP_NAME</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key><string>$APP_NAME</string>
    <key>CFBundleDisplayName</key><string>Markdown Note</string>
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
            <key>LSHandlerRank</key><string>Default</string>
            <key>CFBundleTypeExtensions</key>
            <array>
                <string>md</string>
                <string>markdown</string>
                <string>mdown</string>
                <string>mkd</string>
            </array>
            <key>LSItemContentTypes</key>
            <array>
                <string>net.daringfireball.markdown</string>
            </array>
        </dict>
    </array>
    <key>UTImportedTypeDeclarations</key>
    <array>
        <dict>
            <key>UTTypeIdentifier</key><string>net.daringfireball.markdown</string>
            <key>UTTypeConformsTo</key>
            <array>
                <string>public.plain-text</string>
            </array>
            <key>UTTypeDescription</key><string>Markdown Document</string>
            <key>UTTypeTagSpecification</key>
            <dict>
                <key>public.filename-extension</key>
                <array>
                    <string>md</string>
                    <string>markdown</string>
                    <string>mdown</string>
                    <string>mkd</string>
                </array>
                <key>public.mime-type</key>
                <array>
                    <string>text/markdown</string>
                </array>
            </dict>
        </dict>
    </array>
</dict>
</plist>
EOF

echo "▸ 코드 사인 (ad-hoc)"
codesign --force --deep --sign - "$APP_ROOT" 2>/dev/null || true

xattr -cr "$APP_ROOT" 2>/dev/null || true

echo ""
echo "✓ 완료: $APP_ROOT"
echo ""
echo "실행:  open $APP_ROOT"
echo "설치:  cp -R $APP_ROOT /Applications/"
