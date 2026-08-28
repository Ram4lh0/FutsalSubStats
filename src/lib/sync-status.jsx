'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth.jsx';

const SyncStatusContext = createContext(null);

export function SyncStatusProvider({ children }) {
  const { ready, remote, userId } = useAuth();
  const [state, setState] = useState({ userId: null, initialReady: !remote });

  useEffect(() => {
    if (!ready || (remote && userId)) {
      setState({ userId: userId || null, initialReady: !remote });
      return;
    }
    setState({ userId: userId || null, initialReady: true });
  }, [ready, remote, userId]);

  const markInitialSyncReady = useCallback((id) => {
    setState((current) => {
      if ((id || null) !== current.userId) return current;
      return { ...current, initialReady: true };
    });
  }, []);

  const value = useMemo(
    () => ({ initialSyncReady: state.initialReady, markInitialSyncReady }),
    [markInitialSyncReady, state.initialReady]
  );

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus() {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) throw new Error('useSyncStatus fora do SyncStatusProvider');
  return ctx;
}
