import { $id, setDot } from "./dom.js";
import { wireBasicControls } from "./controls.js";
import { createLogTable } from "./logTable.js";

import { createSbClient, loadSupabaseCfg, saveSupabaseCfg } from "./supabase.js";
import { pickSensorKey } from "./sensors.js";

import { createChartsByDevice, pushPoint, redraw } from "./charts.js";
import { rmsMag, fmt } from "./rms.js";

import { fetchHistory } from "./history.js";
import { exportLogToCSV } from "./export.js";
import { startSimulator, stopSimulator } from "./simulator.js";
import { subscribeRealtime } from "./supabaseLive.js";

import { loadFirebaseCfg, saveFirebaseCfg, createFbClient } from "./firebase.js";
import { fetchFirebaseHistory } from "./firebaseHistory.js";
import { subscribeFirebaseRealtime } from "./firebaseLive.js";

// ---------------- UI
const ui = {
  dbSource: $id("dbSource"),
  supabaseCfg: $id("supabaseCfg"),
  firebaseCfg: $id("firebaseCfg"),

  sbUrl: $id("sbUrl"),
  sbAnon: $id("sbAnon"),
  sbTable: $id("sbTable"),

  fbApiKey: $id("fbApiKey"),
  fbAuthDomain: $id("fbAuthDomain"),
  fbDbUrl: $id("fbDbUrl"),
  fbPath: $id("fbPath"),
  fbTsField: $id("fbTsField"),
  limitLast: $id("limitLast"),
  sessionId: $id("sessionId"),
  btnConnect: $id("btnConnect"),
  btnDisconnect: $id("btnDisconnect"),

  dotDb: $id("dotDb"),
  dotRt: $id("dotRt"),
  dbStatus: $id("dbStatus"),
  rtStatus: $id("rtStatus"),

  pauseBtn: $id("pauseBtn"),
  clearBtn: $id("clearBtn"),
  exportBtn: $id("exportBtn"),
  simBtn: $id("simBtn"),

  winSel: $id("winSel"),
  decSel: $id("decSel"),
  winLabel: $id("winLabel"),
  decLabel: $id("decLabel"),

  autoScroll: $id("autoScroll"),
  logScroll: $id("logScroll"),
  logBody: $id("logBody"),

  btnSetBaseline: $id("btnSetBaseline"),
  btnClearBaseline: $id("btnClearBaseline"),
  rmsNow: $id("rmsNow"),
  rmsBase: $id("rmsBase"),
  rmsRatio: $id("rmsRatio"),

  // ===== KPI IDs =====
  pc_first_A_t: $id("pc_first_A_t"), pc_first_A_x: $id("pc_first_A_x"), pc_first_A_y: $id("pc_first_A_y"),
  pc_first_B_t: $id("pc_first_B_t"), pc_first_B_x: $id("pc_first_B_x"), pc_first_B_y: $id("pc_first_B_y"),
  pc_first_C_t: $id("pc_first_C_t"), pc_first_C_x: $id("pc_first_C_x"), pc_first_C_y: $id("pc_first_C_y"),

  pc_last_A_t: $id("pc_last_A_t"), pc_last_A_x: $id("pc_last_A_x"), pc_last_A_y: $id("pc_last_A_y"),
  pc_last_B_t: $id("pc_last_B_t"), pc_last_B_x: $id("pc_last_B_x"), pc_last_B_y: $id("pc_last_B_y"),
  pc_last_C_t: $id("pc_last_C_t"), pc_last_C_x: $id("pc_last_C_x"), pc_last_C_y: $id("pc_last_C_y"),

  rpi_first_A_t: $id("rpi_first_A_t"), rpi_first_A_x: $id("rpi_first_A_x"), rpi_first_A_y: $id("rpi_first_A_y"),
  rpi_first_B_t: $id("rpi_first_B_t"), rpi_first_B_x: $id("rpi_first_B_x"), rpi_first_B_y: $id("rpi_first_B_y"),
  rpi_first_C_t: $id("rpi_first_C_t"), rpi_first_C_x: $id("rpi_first_C_x"), rpi_first_C_y: $id("rpi_first_C_y"),

  rpi_last_A_t: $id("rpi_last_A_t"), rpi_last_A_x: $id("rpi_last_A_x"), rpi_last_A_y: $id("rpi_last_A_y"),
  rpi_last_B_t: $id("rpi_last_B_t"), rpi_last_B_x: $id("rpi_last_B_x"), rpi_last_B_y: $id("rpi_last_B_y"),
  rpi_last_C_t: $id("rpi_last_C_t"), rpi_last_C_x: $id("rpi_last_C_x"), rpi_last_C_y: $id("rpi_last_C_y"),
};

// ---------------- state
let sb = null;
let sub = null;
let fb = null;

let paused = false;
let simOn = false;

let maxPoints = Number(ui.winSel.value || 400);
let decimation = Number(ui.decSel.value || 1);

ui.winLabel.textContent = String(maxPoints);
ui.decLabel.textContent = String(decimation);

const chartsByDevice = createChartsByDevice();

const log = createLogTable({
  tbodyEl: ui.logBody,
  scrollEl: ui.logScroll,
  autoScrollEl: ui.autoScroll,
  maxRows: 250
});

const buffersByDevice = {
  PC:  { A: [], B: [], C: [] },
  RPI: { A: [], B: [], C: [] },
};

let baselineRms = null;
let decCounter = 0;

// KPI: “primera lectura” solo 1 vez por device/sensor
const kpiFirstSet = { PC: { A:false, B:false, C:false }, RPI: { A:false, B:false, C:false } };

// Mapeo real de device_id -> PC/RPI (auto)
const deviceIdMap = new Map(); // device_id exacto -> "PC" | "RPI"

// ---------------- helpers
function setDb(on) {
  ui.dbStatus.textContent = on ? "ON" : "OFF";
  setDot(ui.dotDb, on ? "ok" : "bad");
}

function setRt(status) {
  const ok = status === "SUBSCRIBED";
  ui.rtStatus.textContent = ok ? "ON" : (status || "OFF");
  setDot(ui.dotRt, ok ? "ok" : (status ? "warn" : "bad"));
}

function fmt6(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(6);
}

// ✅ Hora LOCAL (America/Mexico_City) HH:MM:SS
function fmtLocalHHMMSS(ts){
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return "-";
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '00';
  return `${get('hour')}:${get('minute')}:${get('second')}`;
}

function fmtLocalLabel(ts){
  return fmtLocalHHMMSS(ts);
}

// ✅ Si falta algún id, NO romper
function setText(el, value){
  if (!el) return;
  el.textContent = value;
}

// ✅ Auto-detectar los 2 device_id usando el histórico (sirve para Supabase y Firebase)
function detectDeviceIdsFromRows(rows){
  deviceIdMap.clear();

  const uniq = [];
  const seen = new Set();
  const tail = (rows || []).slice(-3000).reverse();
  for (const r of tail) {
    const id = String(r?.device_id || "").trim();
    if (!id) continue;
    if (!seen.has(id)) { seen.add(id); uniq.push(id); }
    if (uniq.length >= 4) break;
  }

  let pc = null, rpi = null;
  for (const id of uniq) {
    const s = id.toLowerCase();
    if (!rpi && s.includes("rpi")) rpi = id;
    if (!pc && s.includes("pc")) pc = id;
  }
  if (!pc && uniq[0]) pc = uniq[0];
  if (!rpi && uniq[1]) rpi = uniq[1];
  if (pc && rpi && pc === rpi && uniq[1]) rpi = uniq[1];

  if (pc) deviceIdMap.set(pc, "PC");
  if (rpi) deviceIdMap.set(rpi, "RPI");
}

function deviceKeyFromId(deviceId) {
  const id = String(deviceId || "").trim();
  if (!id) return null;

  if (deviceIdMap.has(id)) return deviceIdMap.get(id);

  const s = id.toLowerCase();
  if (s.includes("rpi")) return "RPI";
  if (s.includes("pc")) return "PC";

  return null;
}

function updateKpi(devKey, key, ts, x, y) {
  const prefix = devKey === "PC" ? "pc" : "rpi";
  const T = fmtLocalHHMMSS(ts);
  const X = fmt6(x);
  const Y = fmt6(y);

  if (!kpiFirstSet[devKey][key]) {
    setText(ui[`${prefix}_first_${key}_t`], T);
    setText(ui[`${prefix}_first_${key}_x`], X);
    setText(ui[`${prefix}_first_${key}_y`], Y);
    kpiFirstSet[devKey][key] = true;
  }

  setText(ui[`${prefix}_last_${key}_t`], T);
  setText(ui[`${prefix}_last_${key}_x`], X);
  setText(ui[`${prefix}_last_${key}_y`], Y);
}

function updateRmsUI() {
  const rmsRpiC = rmsMag(buffersByDevice.RPI.C);
  const rmsPcC  = rmsMag(buffersByDevice.PC.C);
  const rms = Number.isFinite(rmsRpiC) ? rmsRpiC : rmsPcC;

  ui.rmsNow.textContent = fmt(rms);
  ui.rmsBase.textContent = fmt(baselineRms);

  if (Number.isFinite(rms) && Number.isFinite(baselineRms) && baselineRms > 0) {
    ui.rmsRatio.textContent = (rms / baselineRms).toFixed(3);
  } else {
    ui.rmsRatio.textContent = "-";
  }
}

function clearAll() {
  kpiFirstSet.PC = { A:false, B:false, C:false };
  kpiFirstSet.RPI = { A:false, B:false, C:false };

  for (const dev of ["pc","rpi"]) {
    for (const k of ["A","B","C"]) {
      setText(ui[`${dev}_first_${k}_t`], "-");
      setText(ui[`${dev}_first_${k}_x`], "-");
      setText(ui[`${dev}_first_${k}_y`], "-");
      setText(ui[`${dev}_last_${k}_t`], "-");
      setText(ui[`${dev}_last_${k}_x`], "-");
      setText(ui[`${dev}_last_${k}_y`], "-");
    }
  }

  for (const devKey of ["PC", "RPI"]) {
    for (const k of ["A","B","C"]) {
      buffersByDevice[devKey][k].length = 0;

      const ch = chartsByDevice[devKey][k];
      ch.data.labels = [];
      ch.data.datasets[0].data = [];
      ch.data.datasets[1].data = [];
      redraw(ch);
    }
  }

  log.clear();
  updateRmsUI();
}

function ingestRow(row) {
  if (paused) return;

  decCounter++;
  if (decimation > 1 && (decCounter % decimation !== 0)) return;

  const devKey = deviceKeyFromId(row.device_id);
  if (!devKey) return;

  const ts = row.ts ? new Date(row.ts) : new Date();

  // Hora local (MX) para tabla, KPIs y gráficas
  const labelLocal = fmtLocalLabel(ts);

  const sensorType = row.sensor_type ?? row.sensor ?? "lsm6dsox";
  const key = pickSensorKey(sensorType);

  const x = Number(row.x_value ?? row.x ?? 0);
  const y = Number(row.y_value ?? row.y ?? 0);

  // KPI
  updateKpi(devKey, key, ts, x, y);

  // buffers + chart (también con etiqueta UTC)
  const point = { t: ts.getTime(), x, y, label: labelLocal, sensor: sensorType, device: row.device_id };

  const buf = buffersByDevice[devKey][key];
  buf.push(point);
  while (buf.length > maxPoints) buf.shift();

  const chart = chartsByDevice[devKey][key];
  pushPoint(chart, labelLocal, x, y, maxPoints);
  redraw(chart);

  // log
  log.push({ label: labelLocal, sensor: `${devKey} • ${sensorType}`, x, y });

  updateRmsUI();
}

// ---------------- connect
// ---------------- source selector UI
const DB_SOURCE_LS = "MIIDT_DB_SOURCE_v1";

function applySourceUI(src){
  const isFb = src === 'firebase';
  ui.supabaseCfg?.classList.toggle('hidden', isFb);
  ui.firebaseCfg?.classList.toggle('hidden', !isFb);
}

// ---------------- connect (Supabase o Firebase)
async function connectSelected() {
  const src = (ui.dbSource?.value || 'supabase').trim();
  localStorage.setItem(DB_SOURCE_LS, src);
  applySourceUI(src);

  const limitLast = Number(ui.limitLast.value || 2000);
  const sessionId = ui.sessionId.value.trim();

  await disconnectAll();
  clearAll();

  try {
    let data = [];

    if (src === 'firebase') {
      const fbCfg = {
        apiKey: ui.fbApiKey.value.trim(),
        authDomain: ui.fbAuthDomain.value.trim(),
        databaseURL: ui.fbDbUrl.value.trim(),
        path: ui.fbPath.value.trim() || 'sensor_data',
        tsField: ui.fbTsField.value.trim() || 'timestamp',
      };

      if (!fbCfg.apiKey || !fbCfg.authDomain || !fbCfg.databaseURL) {
        alert('Falta apiKey / authDomain / databaseURL de Firebase');
        return;
      }

      saveFirebaseCfg(fbCfg);
      fb = await createFbClient(fbCfg);
      setDb(true);
      setRt('');

      data = await fetchFirebaseHistory({
        fb,
        path: fbCfg.path,
        tsField: fbCfg.tsField,
        limitLast,
        sessionId,
      });

      detectDeviceIdsFromRows(data);
      for (const row of data) ingestRow(row);

      try { if (sub) await sub.stop(); } catch {}
      sub = subscribeFirebaseRealtime({
        fb,
        path: fbCfg.path,
        tsField: fbCfg.tsField,
        sessionId,
        onStatus: setRt,
        onInsert: (row) => ingestRow(row),
      });

    } else {
      const url = ui.sbUrl.value.trim();
      const anon = ui.sbAnon.value.trim();
      const table = ui.sbTable.value.trim() || "sensor_data";

      if (!url || !anon) {
        alert("Pon tu Supabase URL y tu Anon Key.");
        return;
      }

      saveSupabaseCfg({ url, anon, table });
      sb = createSbClient(url, anon);

      // Ping rápido
      const { error } = await sb.from(table).select("ts").limit(1);
      if (error) throw error;
      setDb(true);

      data = await fetchHistory({ sb, table, limitLast, sessionId });

      detectDeviceIdsFromRows(data);
      for (const row of data) ingestRow(row);

      try { if (sub) await sub.stop(); } catch {}
      sub = subscribeRealtime({
        sb,
        table,
        onStatus: setRt,
        onInsert: (row) => ingestRow(row),
      });
    }

  } catch (e) {
    console.error(e);
    alert(`Error conectando: ${e?.message || e}`);
    await disconnectAll();
  }
}

// ---------------- disconnect
async function disconnectAll() {
  try { if (sub) await sub.stop(); } catch {}
  sub = null;

  try { if (sb) await sb.removeAllChannels(); } catch {}
  sb = null;

  fb = null;

  setDb(false);
  setRt("");
}

// ---------------- wire
ui.btnConnect.addEventListener("click", connectSelected);
ui.btnDisconnect.addEventListener("click", disconnectAll);

wireBasicControls({
  ui,
  onPause: () => {
    paused = !paused;
    ui.pauseBtn.textContent = paused ? "Reanudar" : "Pausar";
  },
  onClear: () => clearAll(),
  onExport: () => exportLogToCSV(log.getRows(), "miidt_log.csv"),
  onSimToggle: () => {
    simOn = !simOn;
    ui.simBtn.textContent = simOn ? "Simulador ON" : "Simulador OFF";
    if (simOn) {
      startSimulator({
        onSample: (r) => ingestRow({
          ts: r.ts,
          device_id: "pc_simulator",
          sensor_type: r.sensor_type,
          x_value: r.x_value,
          y_value: r.y_value
        })
      });
    } else {
      stopSimulator();
    }
  },
  onWinChange: (v) => {
    maxPoints = v;
    ui.winLabel.textContent = String(maxPoints);
    for (const devKey of ["PC", "RPI"]) {
      for (const k of ["A","B","C"]) {
        const buf = buffersByDevice[devKey][k];
        while (buf.length > maxPoints) buf.shift();
      }
    }
    updateRmsUI();
  },
  onDecChange: (v) => {
    decimation = Math.max(1, v);
    ui.decLabel.textContent = String(decimation);
  },
  onBaselineSet: () => {
    const rpiC = rmsMag(buffersByDevice.RPI.C);
    const pcC  = rmsMag(buffersByDevice.PC.C);
    baselineRms = Number.isFinite(rpiC) ? rpiC : pcC;
    updateRmsUI();
  },
  onBaselineClear: () => {
    baselineRms = null;
    updateRmsUI();
  },
});

// ---------------- boot
(function boot() {
  setDb(false); setRt("");
  const src = localStorage.getItem(DB_SOURCE_LS) || 'supabase';
  if (ui.dbSource) ui.dbSource.value = src;
  applySourceUI(src);

  // Supabase
  const cfg = loadSupabaseCfg();
  if (cfg?.url) ui.sbUrl.value = cfg.url;
  if (cfg?.anon) ui.sbAnon.value = cfg.anon;
  if (cfg?.table) ui.sbTable.value = cfg.table;

  // Firebase
  const fbc = loadFirebaseCfg();
  if (fbc?.apiKey) ui.fbApiKey.value = fbc.apiKey;
  if (fbc?.authDomain) ui.fbAuthDomain.value = fbc.authDomain;
  if (fbc?.databaseURL) ui.fbDbUrl.value = fbc.databaseURL;
  if (fbc?.path) ui.fbPath.value = fbc.path;
  if (fbc?.tsField) ui.fbTsField.value = fbc.tsField;

  // Cambio inmediato al seleccionar
  ui.dbSource?.addEventListener('change', () => {
    const v = ui.dbSource.value;
    localStorage.setItem(DB_SOURCE_LS, v);
    applySourceUI(v);
  });
})();
