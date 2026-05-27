import { postConsoleLog } from './outgoing';

export function installDiagnostics(): void {
  window.addEventListener('error', (e) => {
    try {
      postConsoleLog(
        `[error] ${e.message || '?'} @ ${e.filename || '?'}:${e.lineno || '?'}`,
      );
    } catch {
      /* noop */
    }
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try {
      const reason: unknown = e.reason;
      const msg =
        reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message: unknown }).message)
          : String(reason);
      postConsoleLog(`[unhandled] ${msg}`);
    } catch {
      /* noop */
    }
  });
}
