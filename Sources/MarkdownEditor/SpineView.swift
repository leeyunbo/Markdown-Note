import AppKit

/// 52px marbled book-spine — fixed leading column of the notebook shell.
final class SpineView: NSView {
    override var isFlipped: Bool { true }

    private let label: NSTextField = {
        let t = NSTextField(labelWithString: "Composition · 100 sheets")
        t.font = NSFont(name: "NanumPenScript-Regular", size: 16) ?? NSFont.systemFont(ofSize: 16, weight: .bold)
        t.textColor = NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1)
        t.alignment = .center
        t.drawsBackground = true
        t.backgroundColor = .white
        t.isBordered = false
        t.lineBreakMode = .byClipping
        return t
    }()

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1).cgColor
        label.wantsLayer = true
        label.layer?.borderWidth = 2
        label.layer?.borderColor = NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1).cgColor
        // 라벨을 90° 회전하여 세로로 (writing-mode: vertical-rl 등가)
        label.frameRotation = 90
        addSubview(label)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ dirtyRect: NSRect) {
        let w = bounds.width
        let h = bounds.height
        // 검정 베이스 (layer.backgroundColor가 깔리지만 가시성 보장 차원에서)
        NSColor(srgbRed: 0x1a/255, green: 0x1a/255, blue: 0x1a/255, alpha: 1).setFill()
        bounds.fill()

        // 115° 사선 마블 스트라이프 — 회전된 좌표계에서 가로 띠로 그린다.
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.translateBy(x: w / 2, y: h / 2)
        ctx.rotate(by: 115 * .pi / 180)

        let diag: CGFloat = (w + h) * 1.5
        let bands: [(CGFloat, CGFloat, NSColor)] = [
            (0, 6, c(0x1a1a1a)), (6, 12, c(0x2a2a2a)), (12, 14, c(0xf5f5f5)),
            (14, 20, c(0x2a2a2a)), (20, 28, c(0x1a1a1a)), (28, 30, c(0xf5f5f5)),
            (30, 38, c(0x2a2a2a)), (38, 50, c(0x1a1a1a)),
        ]
        var y: CGFloat = -diag
        while y < diag {
            for (s, e, col) in bands {
                col.setFill()
                NSRect(x: -diag, y: y + s, width: diag * 2, height: e - s).fill()
            }
            y += 50
        }
        ctx.restoreGState()

        // 상/하 미세 음영 (composition-full.jsx의 linear-gradient 등가)
        NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.08).setFill()
        NSRect(x: 0, y: 0, width: w, height: h * 0.04).fill()
        NSRect(x: 0, y: h * 0.96, width: w, height: h * 0.04).fill()

        // 우측 1px 경계선 (border-right)
        NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.30).setFill()
        NSRect(x: w - 1, y: 0, width: 1, height: h).fill()
    }

    override func layout() {
        super.layout()
        label.sizeToFit()
        // 회전된 NSTextField는 자체 bounds의 회전 결과에 따라 frame이 swap된다.
        // 가운데 정렬: 회전 후 frame의 절반을 보정.
        let lf = label.frame
        label.frame.origin = NSPoint(x: (bounds.width - lf.width) / 2,
                                     y: (bounds.height - lf.height) / 2)
    }

    private func c(_ hex: Int) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
                green: CGFloat((hex >> 8) & 0xff) / 255,
                blue: CGFloat(hex & 0xff) / 255, alpha: 1)
    }
}
