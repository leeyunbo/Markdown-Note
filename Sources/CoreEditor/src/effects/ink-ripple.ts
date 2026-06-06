import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Ink ripple + seam flash effect.
 *
 *  사용자 input(user.input.* userEvent transaction)마다:
 *  1. 캐럿 좌표에 13px ring(`1.5px solid accent`) 스폰 → scale .3→1.8, opacity
 *     .6→0 over 0.5s
 *  2. `#prism-seam`에 `.flash` 클래스 토글 → CSS keyframe(opacity .95→0 0.5s)
 *
 *  prefers-reduced-motion이면 둘 다 비활성. */

function isReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch (_) {
    return false;
  }
}

let lastFlashAt = 0;

export const inkRipple = ViewPlugin.fromClass(
  class {
    constructor(_view: EditorView) { /* empty */ }
    update(update: ViewUpdate) {
      if (isReducedMotion()) return;
      // 사용자 입력 transaction만(외부 setText 제외).
      const isUserInput = update.transactions.some((tr) =>
        tr.isUserEvent('input') || tr.isUserEvent('delete'),
      );
      if (!isUserInput) return;
      this.spawnRipple(update.view);
      this.flashSeam();
    }
    spawnRipple(view: EditorView) {
      const head = view.state.selection.main.head;
      const coords = view.coordsAtPos(head);
      if (!coords) return;
      const ripple = document.createElement('div');
      ripple.className = 'ink-ripple';
      // 중심을 캐럿에 두기 위해 13/2 = 6.5px offset
      ripple.style.left = `${coords.left - 6.5}px`;
      ripple.style.top = `${(coords.top + coords.bottom) / 2 - 6.5}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      // safety remove 700ms 후
      setTimeout(() => ripple.remove(), 700);
    }
    flashSeam() {
      const now = performance.now();
      if (now - lastFlashAt < 80) return; // throttle to avoid stacking
      lastFlashAt = now;
      const seam = document.getElementById('prism-seam');
      if (!seam) return;
      seam.classList.remove('flash');
      // 강제 reflow로 animation 재시작.
      void seam.offsetWidth;
      seam.classList.add('flash');
    }
  },
);
