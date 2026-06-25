import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {
    // TEMPORARY BYPASS: If URL has ?debug=true OR you are on localhost, skip the guard entirely
    const isDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDebugMode || isLocalhost) {
      console.log('🛡️ DevTools Guard: Bypassed for debugging');
      return; // Exits the hook early, disabling all blocking logic
    }

    const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';

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

        if (isIncognito) {
          window.location.href = window.location.origin + '/';
        } else {
          window.location.href = window.location.origin + '/?incognito=true';
        }

        return false;
      }
    };

    const blockContext = (e) => { e.preventDefault(); return false; };

    document.addEventListener('keydown', blockKeys, true);
    document.addEventListener('contextmenu', blockContext, true);

    return () => {
      document.removeEventListener('keydown', blockKeys, true);
      document.removeEventListener('contextmenu', blockContext, true);
    };
  }, []);
}