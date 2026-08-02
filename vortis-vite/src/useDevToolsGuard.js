import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {
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

        // Toggle incognito WITHOUT a full page reload — this preserves
        // any open overlay (like Vertex) instead of destroying its state.
        const params = new URLSearchParams(window.location.search);
        const wasIncognito = params.get('incognito') === 'true';
        const nowIncognito = !wasIncognito;

        if (nowIncognito) params.set('incognito', 'true');
        else params.delete('incognito');

        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);

        window.dispatchEvent(new CustomEvent('vortis-incognito-toggle', {
          detail: { incognito: nowIncognito }
        }));

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