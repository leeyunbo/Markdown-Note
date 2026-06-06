/** Ratio-based scroll sync between SOURCE (CodeMirror scroller) and PREVIEW host.
 *
 *  한 쪽에서 scroll → 같은 비율로 반대편 scrollTop 설정. 무한 루프 방지 위해
 *  syncing flag로 자기 트리거를 무시. */
export function installScrollSync(source: HTMLElement, preview: HTMLElement): void {
  let syncing = false;

  function syncFrom(src: HTMLElement, dst: HTMLElement) {
    if (syncing) return;
    syncing = true;
    try {
      const srcMax = src.scrollHeight - src.clientHeight;
      const dstMax = dst.scrollHeight - dst.clientHeight;
      if (srcMax <= 0 || dstMax <= 0) return;
      const ratio = src.scrollTop / srcMax;
      dst.scrollTop = ratio * dstMax;
    } finally {
      // requestAnimationFrame으로 다음 프레임에 풀어 cascade 방지.
      requestAnimationFrame(() => {
        syncing = false;
      });
    }
  }

  source.addEventListener('scroll', () => syncFrom(source, preview), { passive: true });
  preview.addEventListener('scroll', () => syncFrom(preview, source), { passive: true });
}
