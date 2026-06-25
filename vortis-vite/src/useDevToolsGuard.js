import { useEffect } from 'react';

export default function useDevToolsGuard() {
  // CRITICAL BYPASS: This completely disables the guard entirely
  return; 

  // The rest of the code is ignored below and won't execute
  useEffect(() => {
    const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true';
    const blockKeys = (e) => {};
    document.addEventListener('keydown', blockKeys, true);
  }, []);
}