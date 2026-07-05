// js/app.js — UI-Steuerung und App-Zustand
import {
  startCamera, stopCamera, captureFrame, canvasFromFile,
  canvasToBlob, cropToBlob, downscaleImageData,
} from './camera.js';
import { identifyPart, identifyAll } from './brickognize.js';
import { findCandidates } from './segmentation.js';
import { averageColorAt, averageColorInBox, isColorMatch, hsvToRgb } from './color.js';

const STORAGE_KEY = 'legofinder.v1';
const MAX_IMAGE_WIDTH = 1600; // Vollbild fürs Ausschneiden der Crops
const SEG_WIDTH = 480;        // Auflösung für die Segmentierung
const MAX_CANDIDATES = 20;    // Obergrenze API-Anfragen pro Scan (Rate-Limit ~60/min)
const SCORE_MIN = 0.12;       // Mindest-Score für einen Treffer (empirisch justieren)
const COLOR_TOLERANCE = 0.18; // Toleranz beim Farbabgleich der Treffer

const $ = (id) => document.getElementById(id);
const els = {
  screenSetup: $('screen-setup'), screenSearch: $('screen-search'),
  refInput: $('ref-input'), refWrap: $('ref-preview-wrap'), refCanvas: $('ref-canvas'),
  refStatus: $('ref-status'), refResults: $('ref-results'),
  setupExtra: $('setup-extra'), colorHint: $('color-hint'), colorSwatch: $('color-swatch'),
  btnStartSearch: $('btn-start-search'), btnChangePart: $('btn-change-part'),
  chipImg: $('chip-img'), chipName: $('chip-name'),
  video: $('video'), freeze: $('freeze'), overlay: $('overlay'),
  btnScan: $('btn-scan'), btnResume: $('btn-resume'),
  progress: $('progress'), progressBar: $('progress-bar'), progressText: $('progress-text'),
  searchStatus: $('search-status'), scanFileLabel: $('scan-file-label'), scanInput: $('scan-input'),
  zoomModal: $('zoom-modal'), zoomCanvas: $('zoom-canvas'), zoomInfo: $('zoom-info'),
  btnZoomClose: $('btn-zoom-close'),
};

let state = { part: null, colorHsv: null, mode: 'shape+color' };
let refCanvas = null; // Referenzfoto (max 1024 px) fürs Farb-Picken
let scanCanvas = null;   // eingefrorenes Kistenbild (Vollauflösung)
let matches = [];        // [{box, score, colorOk}] des letzten Scans
let cameraFailed = false;
let scanning = false;

// ---------- Zustand ----------
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (s && s.part) state = { part: s.part, colorHsv: s.colorHsv || null, mode: (s.mode === 'shape' || s.mode === 'shape+color') ? s.mode : 'shape+color' };
  } catch { /* kaputter Eintrag — Standardzustand behalten */ }
}

// ---------- Screens ----------
function updateChip() {
  const has = !!state.part;
  els.btnChangePart.hidden = !has;
  if (has) {
    els.chipImg.src = state.part.imgUrl || '';
    els.chipName.textContent = state.part.name;
  }
}

function updateSwatch() {
  if (state.colorHsv) {
    const { r, g, b } = hsvToRgb(state.colorHsv);
    els.colorSwatch.style.background = `rgb(${r},${g},${b})`;
  } else {
    els.colorSwatch.style.background = 'transparent';
  }
}

function showSetup() {
  stopCamera(els.video);
  els.screenSearch.hidden = true;
  els.screenSetup.hidden = false;
  els.setupExtra.hidden = !state.part;
  updateChip();
  updateSwatch();
}

async function showSearch() {
  els.screenSetup.hidden = true;
  els.screenSearch.hidden = false;
  updateChip();
  await initSearchScreen(); // Kamera starten + Scan-UI zurücksetzen
}

// ---------- Screen 1: Stein erfassen ----------
function setRefStatus(msg) {
  els.refStatus.hidden = !msg;
  els.refStatus.textContent = msg || '';
}

els.refInput.addEventListener('change', async () => {
  const file = els.refInput.files[0];
  els.refInput.value = '';
  if (!file) return;
  state.part = null;
  state.colorHsv = null;
  els.setupExtra.hidden = true;
  els.refResults.innerHTML = '';
  updateChip();
  updateSwatch();
  try {
    refCanvas = await canvasFromFile(file, 1024);
  } catch (err) {
    setRefStatus(err.message);
    return;
  }
  const ctx = els.refCanvas.getContext('2d');
  els.refCanvas.width = refCanvas.width;
  els.refCanvas.height = refCanvas.height;
  ctx.drawImage(refCanvas, 0, 0);
  els.refWrap.hidden = false;
  setRefStatus('Stein wird identifiziert …');
  try {
    const items = await identifyPart(await canvasToBlob(refCanvas));
    if (!items.length) {
      setRefStatus('Kein Teil erkannt — bitte nochmal: ein einzelner Stein, neutraler Hintergrund, gutes Licht.');
      return;
    }
    setRefStatus('Welcher ist es? Tippe auf den richtigen Vorschlag:');
    renderCards(items.slice(0, 5));
  } catch (err) {
    setRefStatus(`Identifikation fehlgeschlagen (${err.message}). Bitte nochmal versuchen.`);
  }
});

function renderCards(items) {
  els.refResults.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('button');
    card.className = 'card';
    const img = document.createElement('img');
    img.src = item.imgUrl || '';
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = item.name;
    const meta = document.createElement('small');
    meta.textContent = `${item.id} · ${Math.round(item.score * 100)} %`;
    card.append(img, name, meta);
    card.addEventListener('click', () => {
      state.part = { id: item.id, name: item.name, imgUrl: item.imgUrl };
      saveState();
      els.refResults.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      els.setupExtra.hidden = false;
      els.colorHint.textContent = 'Tippe im Foto auf den Stein, um seine Farbe zu bestimmen.';
      setRefStatus('');
      updateChip();
    });
    els.refResults.appendChild(card);
  }
}

// Farbe per Tipp aufs Referenzfoto bestimmen
els.refCanvas.addEventListener('click', (e) => {
  if (!refCanvas || !state.part) return;
  const rect = els.refCanvas.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (refCanvas.width / rect.width));
  const y = Math.round((e.clientY - rect.top) * (refCanvas.height / rect.height));
  const imageData = refCanvas.getContext('2d').getImageData(0, 0, refCanvas.width, refCanvas.height);
  const hsv = averageColorAt(imageData, x, y, 10);
  if (!hsv) return;
  state.colorHsv = hsv;
  saveState();
  updateSwatch();
  els.colorHint.textContent = 'Farbe gesetzt ✓ — bei Bedarf nochmal antippen.';
});

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    state.mode = radio.value;
    saveState();
  });
});

els.btnStartSearch.addEventListener('click', () => {
  if (state.mode === 'shape+color' && !state.colorHsv) {
    setRefStatus('Bitte zuerst im Foto auf den Stein tippen (Farbe bestimmen) — oder auf „Nur Form" umschalten.');
    return;
  }
  showSearch();
});

els.btnChangePart.addEventListener('click', showSetup);

// ---------- Screen 2: Kiste durchsuchen ----------
function setSearchStatus(msg) { els.searchStatus.textContent = msg; }

function showProgress(done, total) {
  els.progressBar.style.width = `${Math.round((done / total) * 100)}%`;
  els.progressText.textContent = `${done} von ${total} Kandidaten analysiert`;
}

async function initSearchScreen() {
  resetScanUi();
  if (els.video.srcObject) return;
  try {
    await startCamera(els.video);
    cameraFailed = false;
  } catch {
    cameraFailed = true;
    setSearchStatus('Kein Kamerazugriff — nimm stattdessen ein Foto der Kiste auf.');
  }
  resetScanUi();
}

function resetScanUi() {
  matches = [];
  scanCanvas = null;
  els.freeze.hidden = true;
  const octx = els.overlay.getContext('2d');
  octx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  els.btnResume.hidden = true;
  els.progress.hidden = true;
  els.btnScan.hidden = cameraFailed;
  els.scanFileLabel.hidden = !cameraFailed;
  setSearchStatus(state.mode === 'shape+color'
    ? 'Suche nach Form + Farbe. Kamera auf die Kiste richten und „Suchen" tippen.'
    : 'Suche nur nach der Form. Kamera auf die Kiste richten und „Suchen" tippen.');
}

function showFrozen(canvas) {
  els.freeze.width = canvas.width;
  els.freeze.height = canvas.height;
  els.freeze.getContext('2d').drawImage(canvas, 0, 0);
  els.freeze.hidden = false;
  els.overlay.width = canvas.width;
  els.overlay.height = canvas.height;
}

async function runScan(sourceCanvas) {
  if (scanning) return;
  scanning = true;
  scanCanvas = sourceCanvas;
  showFrozen(sourceCanvas);
  els.btnScan.hidden = true;
  els.scanFileLabel.hidden = true;
  els.btnResume.hidden = true;
  try {
    if (!navigator.onLine) {
      finishScan('Offline — die Steinerkennung braucht eine Internetverbindung.');
      return;
    }
    setSearchStatus('Suche Kandidaten …');
    const fullData = sourceCanvas.getContext('2d')
      .getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const small = downscaleImageData(sourceCanvas, SEG_WIDTH);
    const scale = sourceCanvas.width / small.width;
    const useColor = state.mode === 'shape+color' && !!state.colorHsv;
    const boxes = findCandidates(small, {
      targetHsv: useColor ? state.colorHsv : null,
      maxCandidates: MAX_CANDIDATES,
    }).map((b) => ({
      x: Math.round(b.x * scale),
      y: Math.round(b.y * scale),
      w: Math.round(b.w * scale),
      h: Math.round(b.h * scale),
    }));
    if (!boxes.length) {
      finishScan('Keine Kandidaten gefunden — näher herangehen oder Licht verbessern.');
      return;
    }
    setSearchStatus(`Analysiere ${boxes.length} Kandidaten …`);
    els.progress.hidden = false;
    showProgress(0, boxes.length);
    const blobs = await Promise.all(boxes.map((b) => cropToBlob(sourceCanvas, b, 0.2)));
    const results = await identifyAll(blobs, { concurrency: 4, onProgress: showProgress });
    matches = [];
    results.forEach((res, i) => {
      const hit = (res.items || []).slice(0, 3).find((it) => it.id === state.part.id);
      if (!hit || hit.score < SCORE_MIN) return;
      let colorOk = true;
      if (useColor) {
        const c = averageColorInBox(fullData, boxes[i]);
        colorOk = c ? isColorMatch(c, state.colorHsv, COLOR_TOLERANCE) : false;
      }
      matches.push({ box: boxes[i], score: hit.score, colorOk });
    });
    matches.sort((a, b) => (b.colorOk - a.colorOk) || (b.score - a.score));
    drawMatches();
    const green = matches.filter((m) => m.colorOk).length;
    const failed = results.filter((r) => r.error).length;
    let msg;
    if (green) msg = `${green} Treffer — Rahmen antippen zum Vergrößern.`;
    else if (matches.length) msg = 'Nur Form-Treffer in anderer Farbe gefunden (gelb).';
    else msg = 'Nicht gefunden — Steine umrühren oder näher herangehen und neu scannen.';
    if (failed) msg += ` (${failed} Kandidaten wegen API-Fehlern übersprungen.)`;
    finishScan(msg);
  } catch (err) {
    finishScan(`Scan fehlgeschlagen: ${err.message}`);
  } finally {
    scanning = false;
  }
}

function finishScan(msg) {
  setSearchStatus(msg);
  els.progress.hidden = true;
  els.btnResume.hidden = false;
}

function drawMatches() {
  const ctx = els.overlay.getContext('2d');
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  const lw = Math.max(3, Math.round(els.overlay.width / 300));
  ctx.font = `${lw * 5}px system-ui`;
  for (const m of matches) {
    const color = m.colorOk ? '#4caf50' : '#ffc107';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(m.box.x, m.box.y, m.box.w, m.box.h);
    const label = `${Math.round(m.score * 100)} %`;
    ctx.fillStyle = color;
    ctx.fillRect(m.box.x, Math.max(0, m.box.y - lw * 7), ctx.measureText(label).width + lw * 4, lw * 7);
    ctx.fillStyle = '#000';
    ctx.fillText(label, m.box.x + lw * 2, Math.max(lw * 5, m.box.y - lw * 2));
  }
}

els.btnScan.addEventListener('click', () => {
  if (!els.video.videoWidth) return;
  runScan(captureFrame(els.video, MAX_IMAGE_WIDTH));
});

els.scanInput.addEventListener('change', async () => {
  const file = els.scanInput.files[0];
  els.scanInput.value = '';
  if (!file) return;
  runScan(await canvasFromFile(file, MAX_IMAGE_WIDTH));
});

els.btnResume.addEventListener('click', resetScanUi);

// Tipp auf einen Treffer → Zoom-Ansicht
els.overlay.addEventListener('click', (e) => {
  if (!scanCanvas || !matches.length) return;
  // object-fit: contain → Klickkoordinaten auf Canvas-Pixel umrechnen
  const rect = els.overlay.getBoundingClientRect();
  const scale = Math.min(rect.width / els.overlay.width, rect.height / els.overlay.height);
  const offX = (rect.width - els.overlay.width * scale) / 2;
  const offY = (rect.height - els.overlay.height * scale) / 2;
  const x = (e.clientX - rect.left - offX) / scale;
  const y = (e.clientY - rect.top - offY) / scale;
  const m = matches.find(({ box }) =>
    x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h);
  if (!m) return;
  const mx = Math.round(m.box.w * 0.3);
  const my = Math.round(m.box.h * 0.3);
  const cx = Math.max(0, m.box.x - mx);
  const cy = Math.max(0, m.box.y - my);
  const cw = Math.min(scanCanvas.width - cx, m.box.w + 2 * mx);
  const ch = Math.min(scanCanvas.height - cy, m.box.h + 2 * my);
  els.zoomCanvas.width = cw;
  els.zoomCanvas.height = ch;
  els.zoomCanvas.getContext('2d').drawImage(scanCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  els.zoomInfo.textContent = `${state.part.name} — Übereinstimmung ${Math.round(m.score * 100)} %`
    + (m.colorOk ? '' : ' (andere Farbe)');
  els.zoomModal.hidden = false;
});

els.btnZoomClose.addEventListener('click', () => { els.zoomModal.hidden = true; });

// ---------- Start ----------
loadState();
document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
if (state.part) {
  showSearch(); // gemerktes Teil → direkt weitersuchen
} else {
  showSetup();
}
