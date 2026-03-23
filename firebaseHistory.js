// Firebase RTDB history loader

function tsToMs(v){
  if (v == null) return null;
  const n = Number(v);
  if (Number.isFinite(n)) {
    // Heurística: si parece segundos (10 dígitos) -> ms
    if (n > 1e12) return n;      // ya ms
    if (n > 1e9) return n * 1000; // segundos
  }
  // Si es string ISO
  const d = new Date(v);
  if (!isNaN(d)) return d.getTime();
  return null;
}

export function normalizeFirebaseRow(val, tsField){
  const rawTs = val?.[tsField] ?? val?.ts ?? val?.timestamp;
  const ms = tsToMs(rawTs);
  const ts = ms ? new Date(ms).toISOString() : (val?.ts || val?.timestamp || null);

  return {
    ...val,
    ts,
  };
}

export async function fetchFirebaseHistory({ fb, path, tsField = 'timestamp', limitLast = 2000, sessionId = '' }){
  const { db, firebase } = fb;
  let ref = db.ref(path);

  // Ordenar por timestamp y traer los últimos N
  // Si no existe ese campo en todos, Firebase no ordena como se espera.
  ref = ref.orderByChild(tsField).limitToLast(limitLast);

  const snap = await ref.once('value');
  const out = [];
  snap.forEach(child => {
    const val = child.val();
    if (!val) return;
    if (sessionId && String(val.session_id || '').trim() !== String(sessionId).trim()) return;
    out.push(normalizeFirebaseRow(val, tsField));
  });

  // Asegurar orden cronológico ascendente por ts
  out.sort((a,b) => {
    const da = new Date(a.ts).getTime();
    const dbb = new Date(b.ts).getTime();
    return (da||0) - (dbb||0);
  });

  return out;
}
