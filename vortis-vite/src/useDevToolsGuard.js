import { useEffect } from 'react';

const BLOCKED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Access Denied</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      background:#0a0a0f;
      display:flex;align-items:center;justify-content:center;
      height:100vh;font-family:monospace;color:#fff;
      flex-direction:column;gap:16px;user-select:none;
    }
    .icon{font-size:48px}
    h1{font-size:20px;color:#ef4444;letter-spacing:.08em}
    p{font-size:13px;color:#555;letter-spacing:.04em}
  </style>
</head>
<body>
  <div class="icon">🔒</div>
  <h1>ACCESS DENIED</h1>
  <p>Developer tools are not allowed on this page.</p>
</body>
</html>`;

const lockPage = () => {
  // Wipe the current document completely
  try {
    document.open();
    document.write(BLOCKED_HTML);
    document.close();
  } catch (_) {}

  // Also replace history so back button doesn't restore it
  try { window.history.replaceState(null, '', '/blocked'); } catch (_) {}

  // Kill all timers and intervals
  const highId = setTimeout(() => {}, 0);
  for (let i = 0; i <= highId; i++) {
    clearTimeout(i);
    clearInterval(i);
  }
};

export default function useDevToolsGuard() {
  useEffect(() => {
    let triggered = false;

    const trigger = () => {
      if (triggered) return;
      triggered = true;
      lockPage();
    };

    // ── METHOD 1: window size difference (most reliable) ──
    // DevTools docked to the side/bottom changes innerWidth or innerHeight
    const THRESHOLD = 160;
    const checkSize = () => {
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > THRESHOLD || heightDiff > THRESHOLD) trigger();
    };
    const sizeInterval = setInterval(checkSize, 800);
    checkSize(); // run immediately

    // ── METHOD 2: debugger timing trick ──
    // When DevTools is open, the debugger statement takes measurably longer
    const debuggerCheck = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const elapsed = performance.now() - start;
      if (elapsed > 100) trigger();
    };
    const debugInterval = setInterval(debuggerCheck, 2000);

    // ── METHOD 3: console.log object trick ──
    // DevTools expands the object lazily — getter fires only when open
    const devObj = Object.defineProperty({}, '_dtcheck_', {
      get() {
        trigger();
        return true;
      }
    });
    const consoleInterval = setInterval(() => {
      // This only "runs" the getter when DevTools console is open
      console.log('%c', devObj);
      console.clear(); // hide the spam
    }, 1500);

    // ── METHOD 4: keyboard shortcut blocking ──
    const blockKeys = (e) => {
      const key = e.key?.toUpperCase();
      const ctrl = e.ctrlKey || e.metaKey;

      const blocked =
        // F12
        key === 'F12' ||
        // Ctrl+Shift+I / Cmd+Opt+I
        (ctrl && e.shiftKey && key === 'I') ||
        // Ctrl+Shift+J (Chrome console)
        (ctrl && e.shiftKey && key === 'J') ||
        // Ctrl+Shift+C (inspect element)
        (ctrl && e.shiftKey && key === 'C') ||
        // Ctrl+U (view source)
        (ctrl && key === 'U') ||
        // F11 (fullscreen — optional, remove if you want to allow)
        // key === 'F11' ||
        // Ctrl+S (save page source)
        (ctrl && key === 'S');

      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        trigger();
        return false;
      }
    };

    // ── METHOD 5: right-click context menu block ──
    const blockContext = (e) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('contextmenu', blockContext, true);

    return () => {
      clearInterval(sizeInterval);
      clearInterval(debugInterval);
      clearInterval(consoleInterval);
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('contextmenu', blockContext, true);
    };
  }, []);
}