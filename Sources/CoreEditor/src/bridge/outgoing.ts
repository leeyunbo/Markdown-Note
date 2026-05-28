declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        textChanged?: { postMessage(text: string): void };
        cursorLine?: { postMessage(line: number): void };
        consoleLog?: { postMessage(msg: string): void };
        imageDropped?: { postMessage(payload: { dataURL: string; name: string }): void };
      };
    };
  }
}

const handlers = () => window.webkit?.messageHandlers;

let textChangedTimer: ReturnType<typeof setTimeout> | null = null;
const TEXT_DEBOUNCE_MS = 150;

/** Send textChanged to Swift (debounced 150ms). */
export function postTextChanged(text: string): void {
  if (textChangedTimer) clearTimeout(textChangedTimer);
  textChangedTimer = setTimeout(() => {
    handlers()?.textChanged?.postMessage(text);
  }, TEXT_DEBOUNCE_MS);
}

let lastCursorLine = -1;
/** Send cursorLine (0-based) to Swift, only if changed since last send. */
export function postCursorLine(line: number): void {
  if (line === lastCursorLine) return;
  lastCursorLine = line;
  handlers()?.cursorLine?.postMessage(line);
}

/** Forward an arbitrary diagnostic line to Swift. */
export function postConsoleLog(msg: string): void {
  handlers()?.consoleLog?.postMessage(msg);
}

/** Forward a clipboard image (as data URL) to Swift. */
export function postImageDropped(dataURL: string, name: string): void {
  handlers()?.imageDropped?.postMessage({ dataURL, name });
}
