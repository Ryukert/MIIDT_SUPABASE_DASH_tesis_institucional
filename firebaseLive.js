// Firebase RTDB realtime (child_added)

import { normalizeFirebaseRow } from './firebaseHistory.js';

function tsMs(row){
  const d = new Date(row?.ts);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

export function subscribeFirebaseRealtime({ fb, path, tsField = 'timestamp', sessionId = '', onStatus, onInsert }){
  const { db } = fb;
  const ref = db.ref(path).orderByChild(tsField).limitToLast(50);

  let last = 0;
  let active = true;

  const handler = (snap) => {
    if (!active) return;
    const val = snap.val();
    if (!val) return;
    if (sessionId && String(val.session_id || '').trim() !== String(sessionId).trim()) return;

    const row = normalizeFirebaseRow(val, tsField);
    const t = tsMs(row);
    if (t <= last) return;
    last = t;

    onInsert?.(row);
  };

  ref.on('child_added', handler);
  onStatus?.('SUBSCRIBED');

  return {
    async stop(){
      active = false;
      try { ref.off('child_added', handler); } catch {}
      onStatus?.('OFF');
    }
  };
}
