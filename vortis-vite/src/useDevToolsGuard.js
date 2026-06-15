import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {
    const openIncognitoMode = () => {
      const incognitoUrl = `${window.location.origin}/?incognito=true`;
      window.open(incognitoUrl, '_blank');
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
        openIncognitoMode();
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