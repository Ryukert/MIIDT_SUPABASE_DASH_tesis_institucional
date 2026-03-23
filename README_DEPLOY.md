# MIIDT Dashboard SHM — Firebase / Supabase (Vercel)

Este proyecto es **100% estático** (HTML + CSS + JS). No requiere Node, build, ni servidor.

## 1) Estructura de carpetas (la que debes subir a Git)

```text
MIIDT_SUPABASE_DASH-main/
  index.html
  main.css
  main.js
  vercel.json
  assets/
    miidt.png
    uagro.png
    (otros assets…)
  (módulos JS)
    charts.js
    controls.js
    dom.js
    export.js
    history.js
    logTable.js
    rms.js
    sensors.js
    simulator.js
    supabase.js
    supabaseLive.js
    firebase.js
    firebaseHistory.js
    firebaseLive.js
```

> **Importante:** `miidt_barra.png` ya NO se usa en el diseño (puede quedarse en `assets/` o puedes borrarlo).

## 2) Orden de creación (si lo vas a recrear desde cero)

1. `index.html`  → estructura UI + incluye Chart.js y Tailwind por CDN.
2. `main.css`    → estilos del dashboard.
3. `dom.js`      → helpers DOM.
4. `controls.js` → botones (pausar, exportar, etc.).
5. `charts.js`   → Chart.js (creación y actualización).
6. `logTable.js` → tabla del log.
7. `rms.js`      → cálculo RMS.
8. `sensors.js`  → mapeo sensor_type → A/B/C.
9. `export.js`   → exportación CSV del log.
10. `history.js` + `supabaseLive.js` + `supabase.js` → Supabase.
11. `firebase.js` + `firebaseHistory.js` + `firebaseLive.js` → Firebase RTDB.
12. `main.js`    → orquesta todo (elige fuente y conecta).

## 3) Subir a GitHub

Desde la carpeta `MIIDT_SUPABASE_DASH-main`:

```bash
git init
git add .
git commit -m "MIIDT dashboard (firebase/supabase)"
git branch -M main
git remote add origin <TU_REPO_URL>
git push -u origin main
```

## 4) Desplegar en Vercel

### Opción A: Importar repo (recomendada)

1. En Vercel → **Add New → Project**
2. Importa tu repo
3. En **Build & Output Settings**:
   - Framework Preset: **Other**
   - Build Command: *(vacío)*
   - Output Directory: *(vacío)*
4. Deploy

### Opción B: Deploy por CLI

```bash
npm i -g vercel
vercel
```

## 5) Configuración en el dashboard

Al abrir el sitio:

- Selecciona **Supabase** o **Firebase RTDB**.
- Pega tus credenciales.
- Click **Conectar**.

Las credenciales se guardan en `localStorage` del navegador (solo en tu PC, no en el servidor).

## 6) Notas importantes

- **Seguridad:** Si publicas esto, considera **RLS en Supabase** o reglas de lectura en Firebase.
- **Límites:** Si tu base es enorme, usa `Histórico a cargar` (500–5000) para no saturar el navegador.
