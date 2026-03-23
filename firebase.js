// Firebase RTDB (web) — lazy loader + config persistence

const LS_KEY = "MIIDT_FIREBASE_CFG_v1";

export function loadFirebaseCfg(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

export function saveFirebaseCfg(cfg){
  localStorage.setItem(LS_KEY, JSON.stringify(cfg || {}));
}

function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar: ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureFirebaseCompat(){
  // Si ya existe, no recargar
  if (window.firebase && window.firebase.apps) return;

  // Compat (más simple para RTDB en un proyecto estático)
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
}

export async function createFbClient(cfg){
  await ensureFirebaseCompat();

  const firebase = window.firebase;

  // Reutilizar app si ya existe
  let app = firebase.apps?.[0] || null;
  if (!app) {
    app = firebase.initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      databaseURL: cfg.databaseURL,
    });
  }
  const db = firebase.database(app);

  return { firebase, app, db };
}
