/** SOURCE(CodeMirror scroller) ↔ PREVIEW host 비율 스크롤 동기화.
 *
 *  한 쪽을 스크롤하면 같은 비율로 반대편 scrollTop을 맞춘다. 핵심은 에코 차단:
 *  프로그램적으로 dst.scrollTop을 바꾸면 dst의 'scroll' 이벤트가 한 번 더 발생하는데,
 *  이를 그대로 두면 dst→src로 되먹임되며 높이/반올림 차이로 양쪽이 위로 표류한다
 *  ("휠이 자동으로 올라감"). 그래서 "다음 dst scroll 1회는 무시" 하도록 single-shot
 *  suppress 토큰을 둔다(rAF 타이밍에 의존하지 않음). */
export function installScrollSync(source: HTMLElement, preview: HTMLElement): void {
  // 다음 한 번 무시할 대상(프로그램적 스크롤로 곧 발생할 echo).
  let suppress: HTMLElement | null = null;

  function sync(src: HTMLElement, dst: HTMLElement) {
    // 이 이벤트가 우리가 유발한 echo면 한 번만 흘려보낸다.
    if (suppress === src) {
      suppress = null;
      return;
    }
    const srcMax = src.scrollHeight - src.clientHeight;
    const dstMax = dst.scrollHeight - dst.clientHeight;
    if (srcMax <= 0 || dstMax <= 0) return;
    const ratio = src.scrollTop / srcMax;
    const target = ratio * dstMax;
    // 값이 사실상 동일하면 set하지 않는다(불필요한 echo / suppress 누수 방지).
    if (Math.abs(dst.scrollTop - target) < 0.5) return;
    suppress = dst; // 곧 발생할 dst 'scroll'(우리가 유발) 1회 무시.
    dst.scrollTop = target;
  }

  source.addEventListener('scroll', () => sync(source, preview), { passive: true });
  preview.addEventListener('scroll', () => sync(preview, source), { passive: true });
}
