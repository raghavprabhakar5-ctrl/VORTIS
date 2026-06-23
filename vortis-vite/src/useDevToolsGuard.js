import { useEffect } from 'react';

export default function useDevToolsGuard() {
  useEffect(() => {
    // Guard disabled — devtools and right-click allowed for debugging
    return () => {};
  }, []);
}