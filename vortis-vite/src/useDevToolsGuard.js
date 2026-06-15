import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {
    const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';

    const handleShortcut = () => {
      if (isIncognito) {
        // Already in incognito → go back to normal page
        window.location.href = window.location.origin + '/';
      } else {
        // Normal → open incognito (only one tab, replace current or open new)
        const incognitoUrl = `${window.location.origin}/?incognito=true`;
        window.open(incognitoUrl, 'vortis_incognito');
      }
    };

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
        handleShortcut();
        return false;
      }
    };

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