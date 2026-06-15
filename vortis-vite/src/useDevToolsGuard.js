import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {

    const openIncognitoStyle = () => {
      // Open a blank white page in a new tab (mimics incognito feel)
      const blank = window.open('about:blank', '_blank');
      if (blank) {
        blank.document.open();
        blank.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>New Tab</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #202124;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e8eaed;
      gap: 12px;
      user-select: none;
    }
    svg { opacity: 0.15; margin-bottom: 8px; }
    h1 { font-size: 22px; font-weight: 400; color: #e8eaed; }
    p  { font-size: 13px; color: #9aa0a6; }
  </style>
</head>
<body>
  <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
  </svg>
  <h1>New Tab</h1>
  <p>Nothing to see here.</p>
</body>
</html>`);
        blank.document.close();
      }
    };

    // ── ONLY block actual DevTools keyboard shortcuts ──
    const blockKeys = (e) => {
      const key = e.key?.toUpperCase();
      const ctrl = e.ctrlKey || e.metaKey;

      const isDevToolsShortcut =
        key === 'F12' ||
        (ctrl && e.shiftKey && key === 'I') ||
        (ctrl && e.shiftKey && key === 'J') ||
        (ctrl && e.shiftKey && key === 'C') ||
        (ctrl && key === 'U');

      if (isDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
        openIncognitoStyle();
        return false;
      }
    };

    // ── Block right-click inspect ──
    const blockContext = (e) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('contextmenu', blockContext, true);

    return () => {
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('contextmenu', blockContext, true);
    };
  }, []);
}