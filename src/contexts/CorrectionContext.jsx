import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CorrectionContext = createContext(null);

/**
 * Holds the state of an in-flight correction session — the queue of sent-back
 * items and where in it the annotator is.
 *
 * The session is played *inside the annotation editor* (`CorrectionBar` drives the
 * canvas), and advancing from an item on one image to an item on another navigates
 * the editor's route. So this state has to outlive those navigations: it lives here,
 * above the router, rather than in any page's own state. It is memory-only and
 * dataset-agnostic — a refresh ends the session, which is honest since the backend
 * queue is a snapshot, not a reservation.
 *
 * Resolving an item (the network call) stays in the bar, which owns the toasts and
 * error surface; this context only tracks position in the queue.
 */
export const CorrectionProvider = ({ children }) => {
  const [session, setSession] = useState(null); // { datasetId, items, index } | null

  const start = useCallback((datasetId, items) => {
    if (!items?.length) return;
    setSession({ datasetId: String(datasetId), items, index: 0 });
  }, []);

  // Step to the next item. When the index passes the last item the session is
  // exhausted (`active` derives to false); the caller detects "was that the last
  // one?" from the index/total it already holds, not from this call.
  const advance = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      return { ...current, index: current.index + 1 };
    });
  }, []);

  const endSession = useCallback(() => setSession(null), []);

  const value = useMemo(() => {
    const active = Boolean(session) && session.index < session.items.length;
    return {
      active,
      datasetId: session?.datasetId ?? null,
      items: session?.items ?? [],
      index: session?.index ?? 0,
      total: session?.items.length ?? 0,
      currentItem: active ? session.items[session.index] : null,
      start,
      advance,
      endSession,
    };
  }, [session, start, advance, endSession]);

  return (
    <CorrectionContext.Provider value={value}>
      {children}
    </CorrectionContext.Provider>
  );
};

export const useCorrection = () => {
  const ctx = useContext(CorrectionContext);
  if (!ctx) throw new Error('useCorrection must be used within a CorrectionProvider');
  return ctx;
};
