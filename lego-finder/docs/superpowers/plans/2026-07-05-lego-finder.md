# LEGO-Stein-Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile Web-App, die einen per Referenzfoto bestimmten LEGO-Stein in einem Kisten-Snapshot findet und markiert (Spec: `docs/superpowers/specs/2026-07-05-lego-finder-design.md`).

**Architecture:** Statische Single-Page-App ohne Framework/Build. Kandidaten-Boxen werden lokal im Browser gefunden (HSV-Farbmaske bzw. Farbcluster + Kachelraster), Bildausschnitte per Brickognize-API identifiziert, Treffer im Standbild markiert. Reine Logik-Module (Farbe, Segmentierung, API-Client) sind DOM-frei und Node-testbar.

**Tech Stack:** Vanilla JS (ES Modules), Canvas 2D, `getUserMedia`, Brickognize-API (`https://api.brickognize.com`), Node `node:test` für Unit-Tests, `python3 -m http.server` zum lokalen Testen.

## Global Constraints

- Kein Framework, kein Build-Tool, keine npm-Abhängigkeiten — nur statische Dateien
- Alle UI-Texte auf Deutsch
- ES Modules überall (`"type": "module"` in package.json; `<script type="module">` im Browser)
- Logik-Module `js/color.js`, `js/segmentation.js`, `js/brickognize.js` dürfen NICHT auf `document`/`window` zugreifen (Node-Testbarkeit); `fetch` nur als injizierbares `fetchFn` mit Default `globalThis.fetch`
- Tests: `node --test tests/` (Node ≥ 18, lokal installiert: v24)
- Brickognize: `POST https://api.brickognize.com/predict/parts/`, multipart-Feld `query_image`, keine Auth, Rate-Limit ~60/min → max. 20 Kandidaten pro Scan, max. 4 parallele Anfragen
- Konstanten (in `js/app.js`, empirisch justierbar): `MAX_IMAGE_WIDTH=1600`, `SEG_WIDTH=480`, `MAX_CANDIDATES=20`, `SCORE_MIN=0.12`, `COLOR_TOLERANCE=0.18`
- Commits nach jedem Task, Commit-Messages auf Deutsch mit `feat:`/`test:`-Präfix

---

### Task 1: Projektgerüst + Farbmodul `js/color.js`

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `js/color.js`
- Test: `tests/helpers.js`, `tests/color.test.js`

**Interfaces:**
- Consumes: —
- Produces (von späteren Tasks verwendet):
  - `rgbToHsv(r, g, b)` → `{h: 0–360, s: 0–1, v: 0–1}`
  - `hsvToRgb({h, s, v})` → `{r, g, b}` (0–255, gerundet)
  - `colorDistance(a, b)` → Zahl ≥ 0 (0 = identisch; zirkulärer Farbton; bei geringer Sättigung zählt fast nur Helligkeit/Sättigung)
  - `isColorMatch(a, b, threshold = 0.15)` → boolean
  - `averageColorAt(imageData, cx, cy, radius = 8)` → HSV oder `null`; `imageData` ist ein Objekt `{data, width, height}` (kompatibel mit Canvas-`ImageData` UND einfachen Test-Objekten)
  - `averageColorInBox(imageData, box)` → HSV oder `null`; `box = {x, y, w, h}`, gemessen wird nur das zentrale Viertel-Rechteck (25–75 %), damit Ränder/Nachbarsteine nicht mitzählen
  - Test-Helper `makeImage(width, height, fillFn)` in `tests/helpers.js`

- [ ] **Step 1: Projektgerüst anlegen**

`package.json`:

```json
{
  "name": "lego-finder",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "serve": "python3 -m http.server 8000"
  }
}
```

`.gitignore`:

```
node_modules/
.DS_Store
```

- [ ] **Step 2: Failing Tests schreiben**

`tests/helpers.js`:

```js
// Synthetische Testbilder im ImageData-Format ({data, width, height})
export function makeImage(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fillFn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}
```

`tests/color.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHsv, hsvToRgb, colorDistance, isColorMatch,
  averageColorAt, averageColorInBox,
} from '../js/color.js';
import { makeImage } from './helpers.js';

test('rgbToHsv: Rot', () => {
  const { h, s, v } = rgbToHsv(255, 0, 0);
  assert.equal(h, 0);
  assert.equal(s, 1);
  assert.equal(v, 1);
});

test('rgbToHsv: Weiß hat Sättigung 0', () => {
  const { s, v } = rgbToHsv(255, 255, 255);
  assert.equal(s, 0);
  assert.equal(v, 1);
});

test('rgbToHsv: Blau', () => {
  assert.equal(rgbToHsv(0, 0, 255).h, 240);
});

test('hsvToRgb: Roundtrip Rot', () => {
  const { r, g, b } = hsvToRgb({ h: 0, s: 1, v: 1 });
  assert.deepEqual([r, g, b], [255, 0, 0]);
});

test('hsvToRgb: Roundtrip Grau', () => {
  const { r, g, b } = hsvToRgb(rgbToHsv(128, 128, 128));
  assert.deepEqual([r, g, b], [128, 128, 128]);
});

test('colorDistance: zirkulärer Farbton, 350° liegt nahe 10°', () => {
  const d = colorDistance({ h: 350, s: 1, v: 1 }, { h: 10, s: 1, v: 1 });
  assert.ok(d < 0.1, `d=${d}`);
});

test('isColorMatch: Rot ≈ leicht anderes Rot', () => {
  assert.ok(isColorMatch({ h: 0, s: 1, v: 1 }, { h: 8, s: 0.9, v: 0.95 }));
});

test('isColorMatch: Rot ≠ Blau', () => {
  assert.ok(!isColorMatch({ h: 0, s: 1, v: 1 }, { h: 240, s: 1, v: 1 }));
});

test('isColorMatch: Weiß ≠ Schwarz (bei Sättigung 0 zählt Helligkeit)', () => {
  assert.ok(!isColorMatch({ h: 0, s: 0, v: 1 }, { h: 0, s: 0, v: 0 }));
});

test('isColorMatch: Rot ≠ Weiß', () => {
  assert.ok(!isColorMatch({ h: 0, s: 1, v: 1 }, { h: 0, s: 0, v: 1 }));
});

test('averageColorAt: misst die Farbe am Tippunkt, nicht den Hintergrund', () => {
  // linke Hälfte rot, rechte Hälfte grau
  const img = makeImage(40, 20, (x) => (x < 20 ? [200, 0, 0] : [128, 128, 128]));
  const c = averageColorAt(img, 10, 10, 5);
  assert.ok(c.s > 0.9, `s=${c.s}`);
  assert.ok(c.h < 10 || c.h > 350, `h=${c.h}`);
});

test('averageColorInBox: nutzt nur das Zentrum der Box', () => {
  // Box umschließt roten Kern mit grauem Rand — Zentrum ist rot
  const img = makeImage(40, 40, (x, y) =>
    (x >= 12 && x < 28 && y >= 12 && y < 28 ? [200, 0, 0] : [128, 128, 128]));
  const c = averageColorInBox(img, { x: 8, y: 8, w: 24, h: 24 });
  assert.ok(c.s > 0.8, `s=${c.s}`);
});

test('averageColorInBox: leere Box ergibt null', () => {
  const img = makeImage(10, 10, () => [0, 0, 0]);
  assert.equal(averageColorInBox(img, { x: 0, y: 0, w: 0, h: 0 }), null);
});
```

- [ ] **Step 3: Tests laufen lassen — müssen fehlschlagen**

Run: `cd /home/grh/games/lego-finder && node --test tests/`
Expected: FAIL (Cannot find module '../js/color.js')

- [ ] **Step 4: `js/color.js` implementieren**

```js
// js/color.js — reine Farbfunktionen, kein DOM (läuft in Browser und Node)

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// Gewichtete Distanz zweier HSV-Farben in ~[0, 1].
// Bei geringer Sättigung (Grau/Weiß/Schwarz) ist der Farbton bedeutungslos.
export function colorDistance(a, b) {
  const dh = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 180;
  const ds = Math.abs(a.s - b.s);
  const dv = Math.abs(a.v - b.v);
  const hueWeight = Math.min(a.s, b.s) > 0.2 ? 0.55 : 0.05;
  return hueWeight * dh + 0.2 * ds + 0.25 * dv;
}

export function isColorMatch(a, b, threshold = 0.15) {
  return colorDistance(a, b) <= threshold;
}

// Mittlere Farbe in einer Kreisscheibe um (cx, cy) — für "Tippe auf den Stein".
export function averageColorAt(imageData, cx, cy, radius = 8) {
  const { data, width, height } = imageData;
  let r = 0, g = 0, b = 0, n = 0;
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(height - 1, cy + radius);
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(width - 1, cx + radius);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      n++;
    }
  }
  return n === 0 ? null : rgbToHsv(r / n, g / n, b / n);
}

// Mittlere Farbe im zentralen Viertel-Rechteck einer Box (25–75 %),
// damit Ränder und Nachbarsteine nicht mitgemessen werden.
export function averageColorInBox(imageData, box) {
  const { data, width } = imageData;
  const x0 = Math.round(box.x + box.w * 0.25);
  const x1 = Math.round(box.x + box.w * 0.75);
  const y0 = Math.round(box.y + box.h * 0.25);
  const y1 = Math.round(box.y + box.h * 0.75);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      n++;
    }
  }
  return n === 0 ? null : rgbToHsv(r / n, g / n, b / n);
}
```

- [ ] **Step 5: Tests laufen lassen — müssen bestehen**

Run: `node --test tests/`
Expected: PASS, 13 Tests

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore js/color.js tests/
git commit -m "feat: Projektgerüst und Farbmodul (HSV, Distanz, Mittelwerte)"
```

---

### Task 2: Segmentierung `js/segmentation.js`

**Files:**
- Create: `js/segmentation.js`
- Test: `tests/segmentation.test.js`

**Interfaces:**
- Consumes: `rgbToHsv`, `colorDistance` aus `js/color.js`
- Produces (von `js/app.js` verwendet):
  - `findCandidates(imageData, {targetHsv = null, maxCandidates = 20})` → `[{x, y, w, h, area}]`, priorisiert, dedupliziert, gedeckelt. Mit `targetHsv`: Farbmasken-Komponenten (Kachelraster nur als Fallback wenn 0 Funde). Ohne: Farbcluster-Blobs beliebiger Farbe + Kachelraster.
  - Bausteine (einzeln getestet): `buildColorMask(imageData, targetHsv, maxDistance = 0.15)` → `Uint8Array`; `findComponents(mask, width, height, {minArea, maxArea})` → Boxen; `findColorBlobs(imageData, {minArea, maxArea})` → Boxen; `tileGrid(width, height, {cols = 3, rows = 4})` → Boxen; `iou(a, b)` → 0–1; `dedupeBoxes(boxes, iouThreshold = 0.4)` → Boxen; `quantizeBucket(hsv)` → 0–14

- [ ] **Step 1: Failing Tests schreiben**

`tests/segmentation.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorMask, findComponents, findColorBlobs, tileGrid,
  iou, dedupeBoxes, quantizeBucket, findCandidates,
} from '../js/segmentation.js';
import { makeImage } from './helpers.js';

const RED = { h: 0, s: 1, v: 0.78 }; // entspricht rgb(200, 0, 0)
const redOnGray = (x, y) =>
  (x >= 10 && x < 25 && y >= 5 && y < 20 ? [200, 0, 0] : [120, 120, 120]);

test('buildColorMask + findComponents: roter Fleck auf Grau wird genau eine Box', () => {
  const img = makeImage(60, 40, redOnGray);
  const mask = buildColorMask(img, RED);
  const boxes = findComponents(mask, 60, 40, { minArea: 20 });
  assert.equal(boxes.length, 1);
  assert.deepEqual(
    { x: boxes[0].x, y: boxes[0].y, w: boxes[0].w, h: boxes[0].h },
    { x: 10, y: 5, w: 15, h: 15 });
  assert.equal(boxes[0].area, 225);
});

test('findComponents: zwei getrennte Flecken ergeben zwei Boxen', () => {
  const img = makeImage(60, 40, (x, y) =>
    ((x < 10 && y < 10) || (x >= 40 && y >= 25) ? [200, 0, 0] : [120, 120, 120]));
  const mask = buildColorMask(img, RED);
  const boxes = findComponents(mask, 60, 40, { minArea: 20 });
  assert.equal(boxes.length, 2);
});

test('findComponents: minArea filtert Rauschen', () => {
  const img = makeImage(60, 40, (x, y) => (x === 3 && y === 3 ? [200, 0, 0] : [120, 120, 120]));
  const mask = buildColorMask(img, RED);
  assert.equal(findComponents(mask, 60, 40, { minArea: 20 }).length, 0);
});

test('tileGrid: 3×4 Kacheln decken das Bild ab', () => {
  const tiles = tileGrid(60, 40, { cols: 3, rows: 4 });
  assert.equal(tiles.length, 12);
  const last = tiles[tiles.length - 1];
  assert.equal(last.x + last.w, 60);
  assert.equal(last.y + last.h, 40);
});

test('iou: identisch = 1, disjunkt = 0', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(iou(a, a), 1);
  assert.equal(iou(a, { x: 20, y: 20, w: 5, h: 5 }), 0);
});

test('dedupeBoxes: stark überlappende Boxen werden zusammengefasst', () => {
  const boxes = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 1, y: 1, w: 10, h: 10 },
    { x: 30, y: 30, w: 5, h: 5 },
  ];
  assert.equal(dedupeBoxes(boxes).length, 2);
});

test('quantizeBucket: Grau/Weiß/Schwarz landen in eigenen Buckets', () => {
  assert.equal(quantizeBucket({ h: 0, s: 0.1, v: 0.1 }), 12);  // schwarz
  assert.equal(quantizeBucket({ h: 0, s: 0.1, v: 0.9 }), 13);  // weiß
  assert.equal(quantizeBucket({ h: 0, s: 0.1, v: 0.5 }), 14);  // grau
  assert.equal(quantizeBucket({ h: 240, s: 1, v: 1 }), 8);     // blau
});

test('findColorBlobs: findet rote und blaue Steine, Hintergrund via maxArea raus', () => {
  const img = makeImage(60, 40, (x, y) => {
    if (x >= 5 && x < 20 && y >= 5 && y < 20) return [200, 0, 0];
    if (x >= 35 && x < 50 && y >= 20 && y < 35) return [0, 0, 200];
    return [120, 120, 120];
  });
  const boxes = findColorBlobs(img, { minArea: 20, maxArea: 480 });
  assert.equal(boxes.length, 2);
});

test('findCandidates mit Zielfarbe: genau der rote Fleck, kein Kachel-Fallback', () => {
  const img = makeImage(60, 40, redOnGray);
  const boxes = findCandidates(img, { targetHsv: RED });
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].x, 10);
});

test('findCandidates mit Zielfarbe: Kachel-Fallback wenn Farbe nirgends vorkommt', () => {
  const img = makeImage(60, 40, () => [120, 120, 120]);
  const boxes = findCandidates(img, { targetHsv: RED });
  assert.equal(boxes.length, 12); // 3×4-Raster
});

test('findCandidates ohne Zielfarbe: Blobs + Kacheln, gedeckelt', () => {
  const img = makeImage(60, 40, redOnGray);
  const boxes = findCandidates(img, { maxCandidates: 20 });
  assert.ok(boxes.length <= 20);
  // enthält eine Box, die den roten Fleck überlappt
  assert.ok(boxes.some((b) => iou(b, { x: 10, y: 5, w: 15, h: 15 }) > 0.3));
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test tests/`
Expected: FAIL (Cannot find module '../js/segmentation.js'); die 13 color-Tests weiter PASS

- [ ] **Step 3: `js/segmentation.js` implementieren**

```js
// js/segmentation.js — Kandidatensuche im Bild, kein DOM (läuft in Browser und Node)
import { rgbToHsv, colorDistance } from './color.js';

// 1, wo die Pixelfarbe nahe genug an targetHsv liegt.
export function buildColorMask(imageData, targetHsv, maxDistance = 0.15) {
  const { data, width, height } = imageData;
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (colorDistance(hsv, targetHsv) <= maxDistance) mask[p] = 1;
  }
  return mask;
}

// Zusammenhängende Bereiche (4er-Nachbarschaft, iterativer Flood-Fill).
export function findComponents(mask, width, height, { minArea = 20, maxArea = Infinity } = {}) {
  const visited = new Uint8Array(mask.length);
  const boxes = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0;
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p / width) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !visited[p - 1]) { visited[p - 1] = 1; stack.push(p - 1); }
      if (x < width - 1 && mask[p + 1] && !visited[p + 1]) { visited[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask[p - width] && !visited[p - width]) { visited[p - width] = 1; stack.push(p - width); }
      if (y < height - 1 && mask[p + width] && !visited[p + width]) { visited[p + width] = 1; stack.push(p + width); }
    }
    if (area >= minArea && area <= maxArea) {
      boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
    }
  }
  return boxes;
}

// Farb-Bucket: 0–11 = Farbton in 30°-Schritten, 12 = schwarz, 13 = weiß, 14 = grau.
export function quantizeBucket(hsv) {
  if (hsv.s < 0.25) {
    if (hsv.v < 0.25) return 12;
    if (hsv.v > 0.7) return 13;
    return 14;
  }
  return Math.floor(hsv.h / 30) % 12;
}

// Einfarbige Flecken beliebiger Farbe (für den Modus "Nur Form").
export function findColorBlobs(imageData, { minArea = 20, maxArea = Infinity } = {}) {
  const { data, width, height } = imageData;
  const n = width * height;
  const buckets = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    buckets[p] = quantizeBucket(rgbToHsv(data[i], data[i + 1], data[i + 2]));
  }
  const boxes = [];
  const mask = new Uint8Array(n);
  for (let b = 0; b <= 14; b++) {
    let any = false;
    for (let p = 0; p < n; p++) {
      mask[p] = buckets[p] === b ? 1 : 0;
      if (mask[p]) any = true;
    }
    if (!any) continue;
    boxes.push(...findComponents(mask, width, height, { minArea, maxArea }));
  }
  return boxes;
}

// Nicht überlappendes Raster als Fallback, damit nichts komplett übersehen wird.
export function tileGrid(width, height, { cols = 3, rows = 4 } = {}) {
  const w = Math.ceil(width / cols);
  const h = Math.ceil(height / rows);
  const boxes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * w;
      const y = r * h;
      boxes.push({ x, y, w: Math.min(w, width - x), h: Math.min(h, height - y), area: w * h });
    }
  }
  return boxes;
}

export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union === 0 ? 0 : inter / union;
}

export function dedupeBoxes(boxes, iouThreshold = 0.4) {
  const kept = [];
  for (const box of boxes) {
    if (!kept.some((k) => iou(k, box) > iouThreshold)) kept.push(box);
  }
  return kept;
}

// Hauptfunktion: priorisierte Kandidaten-Boxen für einen Scan.
export function findCandidates(imageData, { targetHsv = null, maxCandidates = 20 } = {}) {
  const { width, height } = imageData;
  const minArea = Math.max(20, Math.round(width * height * 0.0003));
  const maxArea = Math.round(width * height * 0.2);
  let primary;
  let fallback = [];
  if (targetHsv) {
    const mask = buildColorMask(imageData, targetHsv);
    primary = findComponents(mask, width, height, { minArea, maxArea });
    if (primary.length === 0) fallback = tileGrid(width, height);
  } else {
    primary = findColorBlobs(imageData, { minArea, maxArea });
    fallback = tileGrid(width, height);
  }
  primary.sort((a, b) => b.area - a.area);
  return dedupeBoxes([...primary, ...fallback]).slice(0, maxCandidates);
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `node --test tests/`
Expected: PASS, 24 Tests (13 color + 11 segmentation)

- [ ] **Step 5: Commit**

```bash
git add js/segmentation.js tests/segmentation.test.js
git commit -m "feat: Segmentierung (Farbmaske, Komponenten, Blobs, Kachelraster, Kandidaten)"
```

---

### Task 3: API-Client `js/brickognize.js`

**Files:**
- Create: `js/brickognize.js`
- Test: `tests/brickognize.test.js`

**Interfaces:**
- Consumes: — (nur `fetch`/`FormData`/`Blob`, in Node ≥ 18 global vorhanden)
- Produces (von `js/app.js` verwendet):
  - `identifyPart(blob, {fetchFn = globalThis.fetch, signal})` → `Promise<[{id, name, score, imgUrl}]>`; wirft `Error` mit `err.retryable === true` bei HTTP 429 und Netzwerkfehlern
  - `identifyWithRetry(blob, {retries = 2, waitMs = 4000, fetchFn, signal})` → wie `identifyPart`, mit Wartezeit-Retry bei retryable Fehlern
  - `identifyAll(blobs, {concurrency = 4, waitMs = 4000, onProgress = (done, total) => {}, fetchFn, signal})` → `Promise<[{items, error?}]>` — Fehler einzelner Crops brechen den Scan nicht ab; Reihenfolge = Eingabe-Reihenfolge

- [ ] **Step 1: Failing Tests schreiben**

`tests/brickognize.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyPart, identifyWithRetry, identifyAll } from '../js/brickognize.js';

function fakeResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
const blob = () => new Blob(['x'], { type: 'image/jpeg' });

test('identifyPart: POST an /predict/parts/ mit query_image, mappt items', async () => {
  let seenUrl, seenOpts;
  const fetchFn = async (url, opts) => {
    seenUrl = url; seenOpts = opts;
    return fakeResponse(200, {
      items: [{ id: '3001', name: 'Brick 2 x 4', score: 0.91, img_url: 'https://x/3001.jpg', type: 'part' }],
    });
  };
  const items = await identifyPart(blob(), { fetchFn });
  assert.equal(seenUrl, 'https://api.brickognize.com/predict/parts/');
  assert.equal(seenOpts.method, 'POST');
  assert.ok(seenOpts.body instanceof FormData);
  assert.ok(seenOpts.body.get('query_image') instanceof Blob);
  assert.deepEqual(items, [{ id: '3001', name: 'Brick 2 x 4', score: 0.91, imgUrl: 'https://x/3001.jpg' }]);
});

test('identifyPart: HTTP 429 wirft retryable Fehler', async () => {
  const fetchFn = async () => fakeResponse(429, {});
  await assert.rejects(identifyPart(blob(), { fetchFn }), (err) => err.retryable === true);
});

test('identifyPart: Netzwerkfehler ist retryable', async () => {
  const fetchFn = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(identifyPart(blob(), { fetchFn }), (err) => err.retryable === true);
});

test('identifyPart: HTTP 500 ist NICHT retryable', async () => {
  const fetchFn = async () => fakeResponse(500, {});
  await assert.rejects(identifyPart(blob(), { fetchFn }), (err) => !err.retryable);
});

test('identifyWithRetry: 429, dann Erfolg', async () => {
  let calls = 0;
  const fetchFn = async () => (++calls === 1 ? fakeResponse(429, {}) : fakeResponse(200, { items: [] }));
  const items = await identifyWithRetry(blob(), { fetchFn, waitMs: 0 });
  assert.equal(calls, 2);
  assert.deepEqual(items, []);
});

test('identifyWithRetry: gibt nach retries Versuchen auf', async () => {
  let calls = 0;
  const fetchFn = async () => { calls++; return fakeResponse(429, {}); };
  await assert.rejects(identifyWithRetry(blob(), { fetchFn, waitMs: 0, retries: 2 }));
  assert.equal(calls, 3); // 1 Versuch + 2 Retries
});

test('identifyAll: Fehler einzelner Crops brechen den Scan nicht ab', async () => {
  let calls = 0;
  const fetchFn = async () =>
    (++calls === 2 ? fakeResponse(500, {}) : fakeResponse(200, { items: [] }));
  const results = await identifyAll([blob(), blob(), blob()], { fetchFn, concurrency: 1, waitMs: 0 });
  assert.equal(results.length, 3);
  assert.deepEqual(results[0], { items: [] });
  assert.ok(results[1].error);
  assert.deepEqual(results[2], { items: [] });
});

test('identifyAll: respektiert das Parallelitätslimit', async () => {
  let inflight = 0, maxInflight = 0;
  const fetchFn = async () => {
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    await new Promise((r) => setTimeout(r, 5));
    inflight--;
    return fakeResponse(200, { items: [] });
  };
  await identifyAll(Array.from({ length: 6 }, blob), { fetchFn, concurrency: 2 });
  assert.ok(maxInflight <= 2, `maxInflight=${maxInflight}`);
});

test('identifyAll: onProgress zählt bis total', async () => {
  const fetchFn = async () => fakeResponse(200, { items: [] });
  const seen = [];
  await identifyAll([blob(), blob()], { fetchFn, onProgress: (d, t) => seen.push([d, t]) });
  assert.deepEqual(seen.sort((a, b) => a[0] - b[0]), [[1, 2], [2, 2]]);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test tests/`
Expected: FAIL (Cannot find module '../js/brickognize.js'); alle bisherigen Tests weiter PASS

- [ ] **Step 3: `js/brickognize.js` implementieren**

```js
// js/brickognize.js — Client für die Brickognize-API (https://api.brickognize.com/docs)
// Keine Auth nötig, CORS offen, Rate-Limit ~60 Anfragen/min.

const API_BASE = 'https://api.brickognize.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryableError(message) {
  const err = new Error(message);
  err.retryable = true;
  return err;
}

// Identifiziert EIN Teil auf dem Bild. Liefert die Vorhersagen absteigend nach Score.
export async function identifyPart(blob, { fetchFn = globalThis.fetch, signal } = {}) {
  const form = new FormData();
  form.append('query_image', blob, 'query.jpg');
  let res;
  try {
    res = await fetchFn(`${API_BASE}/predict/parts/`, { method: 'POST', body: form, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw retryableError('Netzwerkfehler — Internetverbindung prüfen');
  }
  if (res.status === 429) throw retryableError('Rate-Limit erreicht');
  if (!res.ok) throw new Error(`Brickognize-Fehler: HTTP ${res.status}`);
  const json = await res.json();
  return (json.items || []).map((it) => ({
    id: it.id,
    name: it.name,
    score: it.score,
    imgUrl: it.img_url,
  }));
}

export async function identifyWithRetry(blob, { retries = 2, waitMs = 4000, fetchFn = globalThis.fetch, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await identifyPart(blob, { fetchFn, signal });
    } catch (e) {
      if (!e.retryable || attempt >= retries) throw e;
      await sleep(waitMs);
    }
  }
}

// Identifiziert viele Crops mit begrenzter Parallelität.
// Ergebnis-Reihenfolge = Eingabe-Reihenfolge; Fehler landen als {items: [], error} im Ergebnis.
export async function identifyAll(blobs, {
  concurrency = 4, waitMs = 4000, onProgress = () => {},
  fetchFn = globalThis.fetch, signal,
} = {}) {
  const results = new Array(blobs.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= blobs.length) return;
      try {
        results[i] = { items: await identifyWithRetry(blobs[i], { waitMs, fetchFn, signal }) };
      } catch (e) {
        results[i] = { items: [], error: e.message };
      }
      done++;
      onProgress(done, blobs.length);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, blobs.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `node --test tests/`
Expected: PASS, 33 Tests (24 + 9 brickognize)

- [ ] **Step 5: Live-Smoke-Test der echten API (einmalig, kein automatischer Test)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.brickognize.com/health/
```
Expected: `200`

- [ ] **Step 6: Commit**

```bash
git add js/brickognize.js tests/brickognize.test.js
git commit -m "feat: Brickognize-API-Client mit Retry und Parallelitätslimit"
```

---

### Task 4: Seitengerüst + Kamera (`index.html`, `style.css`, `js/camera.js`)

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `js/camera.js`

**Interfaces:**
- Consumes: —
- Produces (von `js/app.js` verwendet):
  - `startCamera(videoEl)` → `Promise<MediaStream>` (Rückkamera, wirft bei Verweigerung)
  - `stopCamera(videoEl)` → stoppt Tracks, setzt `srcObject = null`
  - `captureFrame(videoEl, maxWidth)` → `HTMLCanvasElement` (Frame, ggf. runterskaliert)
  - `canvasFromFile(file, maxWidth)` → `Promise<HTMLCanvasElement>`
  - `canvasToBlob(canvas, quality = 0.85)` → `Promise<Blob>` (JPEG)
  - `cropToBlob(canvas, box, margin = 0.15, quality = 0.85)` → `Promise<Blob>` — Ausschnitt mit Rand, an Bildgrenzen geklemmt
  - `downscaleImageData(canvas, maxWidth)` → `ImageData` des verkleinerten Bilds
  - HTML-Element-IDs (von `js/app.js` referenziert): siehe `index.html` unten — die IDs sind verbindlich

- [ ] **Step 1: `index.html` schreiben**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>LEGO-Stein-Finder</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>🧱 LEGO‑Finder</h1>
    <button id="btn-change-part" class="chip" hidden>
      <img id="chip-img" alt=""><span id="chip-name"></span>
    </button>
  </header>

  <!-- Screen 1: Stein erfassen -->
  <section id="screen-setup">
    <p class="hint">Fotografiere den gesuchten Stein — einzeln, auf neutralem Hintergrund, bei gutem Licht.</p>
    <label class="big-btn">
      📷 Stein fotografieren
      <input id="ref-input" type="file" accept="image/*" capture="environment" hidden>
    </label>
    <div id="ref-preview-wrap" hidden>
      <canvas id="ref-canvas"></canvas>
    </div>
    <p id="ref-status" class="hint" hidden></p>
    <div id="ref-results" class="cards"></div>
    <div id="setup-extra" hidden>
      <p id="color-hint" class="hint">Tippe im Foto auf den Stein, um seine Farbe zu bestimmen.</p>
      <div class="row">
        <span>Gewählte Farbe:</span><span id="color-swatch" class="swatch"></span>
      </div>
      <div class="row toggle-row">
        <label><input type="radio" name="mode" value="shape+color" checked> Form + Farbe</label>
        <label><input type="radio" name="mode" value="shape"> Nur Form</label>
      </div>
      <button id="btn-start-search" class="big-btn">🔍 Kiste durchsuchen</button>
    </div>
  </section>

  <!-- Screen 2: Kiste durchsuchen -->
  <section id="screen-search" hidden>
    <div id="viewport">
      <video id="video" autoplay muted playsinline></video>
      <canvas id="freeze" hidden></canvas>
      <canvas id="overlay"></canvas>
    </div>
    <div id="search-controls">
      <div id="progress" hidden>
        <div id="progress-track"><div id="progress-bar"></div></div>
        <span id="progress-text"></span>
      </div>
      <p id="search-status" class="hint"></p>
      <button id="btn-scan" class="big-btn">🔍 Suchen</button>
      <button id="btn-resume" class="big-btn secondary" hidden>▶ Weiter suchen</button>
      <label id="scan-file-label" class="big-btn" hidden>
        📷 Foto der Kiste aufnehmen
        <input id="scan-input" type="file" accept="image/*" capture="environment" hidden>
      </label>
    </div>
  </section>

  <!-- Zoom-Ansicht eines Treffers -->
  <div id="zoom-modal" hidden>
    <canvas id="zoom-canvas"></canvas>
    <p id="zoom-info"></p>
    <button id="btn-zoom-close" class="big-btn secondary">Schließen</button>
  </div>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` schreiben**

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #14151a; color: #eceff4;
  min-height: 100dvh; display: flex; flex-direction: column;
}
header {
  display: flex; justify-content: space-between; align-items: center;
  padding: .6rem 1rem; background: #1b1d24;
}
h1 { font-size: 1.1rem; }
.hint { color: #9aa3b2; font-size: .9rem; padding: .5rem 0; }
section { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; flex: 1; }

.big-btn {
  display: block; width: 100%; padding: 1rem; text-align: center;
  font-size: 1.15rem; font-weight: 600; color: #fff;
  background: #e3000b; border: none; border-radius: 12px; cursor: pointer;
}
.big-btn.secondary { background: #2e3340; }
.big-btn:active { filter: brightness(1.2); }

.chip {
  display: flex; align-items: center; gap: .4rem; max-width: 55vw;
  background: #2e3340; color: #eceff4; border: none; border-radius: 999px;
  padding: .25rem .7rem .25rem .3rem; font-size: .85rem; cursor: pointer;
}
.chip img { width: 28px; height: 28px; object-fit: contain; border-radius: 50%; background: #fff; }
.chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

#ref-preview-wrap { position: relative; }
#ref-canvas { width: 100%; border-radius: 12px; touch-action: manipulation; }

.cards { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.card {
  display: flex; flex-direction: column; align-items: center; gap: .3rem;
  background: #1f222b; color: #eceff4; border: 2px solid transparent;
  border-radius: 12px; padding: .6rem; cursor: pointer; font-size: .85rem;
}
.card img { width: 72px; height: 72px; object-fit: contain; background: #fff; border-radius: 8px; }
.card.selected { border-color: #4caf50; }
.card small { color: #9aa3b2; }

.row { display: flex; align-items: center; gap: .6rem; }
.toggle-row { gap: 1.2rem; font-size: 1rem; }
.toggle-row input { transform: scale(1.3); margin-right: .3rem; }
.swatch {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid #555; background: transparent; display: inline-block;
}

#screen-search { padding: 0; }
#viewport { position: relative; width: 100%; aspect-ratio: 3 / 4; background: #000; overflow: hidden; }
#video, #freeze, #overlay {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
}
#overlay { touch-action: manipulation; }
#search-controls { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }

#progress-track { height: 8px; background: #2e3340; border-radius: 4px; overflow: hidden; }
#progress-bar { height: 100%; width: 0; background: #4caf50; transition: width .2s; }
#progress-text { font-size: .85rem; color: #9aa3b2; }

#zoom-modal {
  position: fixed; inset: 0; background: rgba(0, 0, 0, .92); z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1rem; padding: 1rem;
}
#zoom-canvas { max-width: 100%; max-height: 60vh; border-radius: 12px; }
#zoom-modal .big-btn { max-width: 320px; }
```

- [ ] **Step 3: `js/camera.js` schreiben**

```js
// js/camera.js — Kamerazugriff und Canvas-Hilfsfunktionen (nur Browser)

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

function scaledCanvas(source, srcW, srcH, maxWidth) {
  const scale = Math.min(1, maxWidth / srcW);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function captureFrame(video, maxWidth = 1600) {
  return scaledCanvas(video, video.videoWidth, video.videoHeight, maxWidth);
}

export function canvasFromFile(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(scaledCanvas(img, img.naturalWidth, img.naturalHeight, maxWidth));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };
    img.src = url;
  });
}

export function canvasToBlob(canvas, quality = 0.85) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Bild-Export fehlgeschlagen'))),
      'image/jpeg', quality);
  });
}

// Ausschnitt einer Box mit relativem Rand, an die Bildgrenzen geklemmt.
export function cropToBlob(canvas, box, margin = 0.15, quality = 0.85) {
  const mx = Math.round(box.w * margin);
  const my = Math.round(box.h * margin);
  const x = Math.max(0, box.x - mx);
  const y = Math.max(0, box.y - my);
  const w = Math.min(canvas.width - x, box.w + 2 * mx);
  const h = Math.min(canvas.height - y, box.h + 2 * my);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return canvasToBlob(c, quality);
}

export function downscaleImageData(canvas, maxWidth) {
  const small = scaledCanvas(canvas, canvas.width, canvas.height, maxWidth);
  return small.getContext('2d').getImageData(0, 0, small.width, small.height);
}
```

- [ ] **Step 4: Platzhalter-`js/app.js` für den Smoke-Test**

Damit die Seite ohne Task 5/6 lädt (wird in Task 5 ersetzt):

```js
// js/app.js — wird in Task 5/6 implementiert
console.log('LEGO-Finder geladen');
```

- [ ] **Step 5: Manueller Smoke-Test**

Run: `python3 -m http.server 8000` (im Projektordner), dann im Browser `http://localhost:8000` öffnen.
Expected: Seite lädt ohne Konsolen-Fehler, Screen 1 sichtbar, dunkles Layout, Button „Stein fotografieren" sichtbar. (Kamera wird erst in Task 6 im Browser getestet.)

- [ ] **Step 6: Commit**

```bash
git add index.html style.css js/camera.js js/app.js
git commit -m "feat: Seitengerüst, Styles und Kamera-Modul"
```

---

### Task 5: Screen 1 — Referenzstein erfassen (`js/app.js`, Teil 1)

**Files:**
- Modify: `js/app.js` (Platzhalter komplett ersetzen)

**Interfaces:**
- Consumes: `identifyPart` (brickognize), `canvasFromFile`, `canvasToBlob` (camera), `averageColorAt`, `hsvToRgb` (color), HTML-IDs aus Task 4
- Produces: App-Zustand `state = {part: {id, name, imgUrl}, colorHsv: {h, s, v}, mode: 'shape+color'|'shape'}` in `localStorage` unter `legofinder.v1`; Funktionen `showSetup()`/`showSearch()`, die Task 6 erweitert. Die mit `// TASK 6` markierten Stubs werden in Task 6 ersetzt.

- [ ] **Step 1: `js/app.js` implementieren (Screen 1 + Navigation, Screen 2 als Stub)**

```js
// js/app.js — UI-Steuerung und App-Zustand
import { startCamera, stopCamera, canvasFromFile, canvasToBlob } from './camera.js';
import { identifyPart } from './brickognize.js';
import { averageColorAt, hsvToRgb } from './color.js';

const STORAGE_KEY = 'legofinder.v1';

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

// ---------- Zustand ----------
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (s && s.part) state = { part: s.part, colorHsv: s.colorHsv || null, mode: s.mode || 'shape+color' };
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
  await initSearchScreen(); // TASK 6: Kamera starten + Scan-UI zurücksetzen
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

// ---------- Screen 2: wird in Task 6 implementiert ----------
async function initSearchScreen() {
  // TASK 6: Kamera starten, Scan-UI zurücksetzen
}

// ---------- Start ----------
loadState();
document.querySelector(`input[name="mode"][value="${state.mode}"]`).checked = true;
if (state.part) {
  showSearch(); // gemerktes Teil → direkt weitersuchen
} else {
  showSetup();
}
```

- [ ] **Step 2: Unit-Tests laufen lassen (Regression)**

Run: `node --test tests/`
Expected: PASS, 33 Tests

- [ ] **Step 3: Manueller Test Screen 1**

Run: `python3 -m http.server 8000`, Browser: `http://localhost:8000`.
Mit einem beliebigen LEGO-Foto (Datei-Auswahl am PC):
1. „Stein fotografieren" → Bild wählen → Vorschau erscheint, danach 3–5 Vorschlagskarten von Brickognize.
2. Karte antippen → grüner Rand, Farb-/Modus-Bereich erscheint.
3. Ins Bild tippen → Farb-Swatch füllt sich mit der Farbe des angetippten Bereichs.
4. „Nur Form" wählen, Seite neu laden → App springt direkt zu Screen 2 (noch ohne Funktion), Chip oben zeigt das Teil.
Expected: alle 4 Punkte funktionieren, keine Konsolen-Fehler.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: Screen 1 — Referenzstein erfassen, Farbe picken, Modus wählen"
```

---

### Task 6: Screen 2 — Scan-Pipeline und Treffer-Anzeige (`js/app.js`, Teil 2)

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `findCandidates` (segmentation), `identifyAll` (brickognize), `startCamera`, `captureFrame`, `cropToBlob`, `downscaleImageData`, `canvasFromFile` (camera), `averageColorInBox`, `isColorMatch` (color), `state` aus Task 5
- Produces: vollständige App; keine weiteren Konsumenten

- [ ] **Step 1: Imports und Konstanten erweitern**

Import-Block am Dateianfang ersetzen durch:

```js
import {
  startCamera, stopCamera, captureFrame, canvasFromFile,
  canvasToBlob, cropToBlob, downscaleImageData,
} from './camera.js';
import { identifyPart, identifyAll } from './brickognize.js';
import { findCandidates } from './segmentation.js';
import { averageColorAt, averageColorInBox, isColorMatch, hsvToRgb } from './color.js';
```

Direkt nach `const STORAGE_KEY = 'legofinder.v1';` einfügen:

```js
const MAX_IMAGE_WIDTH = 1600; // Vollbild fürs Ausschneiden der Crops
const SEG_WIDTH = 480;        // Auflösung für die Segmentierung
const MAX_CANDIDATES = 20;    // Obergrenze API-Anfragen pro Scan (Rate-Limit ~60/min)
const SCORE_MIN = 0.12;       // Mindest-Score für einen Treffer (empirisch justieren)
const COLOR_TOLERANCE = 0.18; // Toleranz beim Farbabgleich der Treffer
```

Nach `let refCanvas = null;` einfügen:

```js
let scanCanvas = null;   // eingefrorenes Kistenbild (Vollauflösung)
let matches = [];        // [{box, score, colorOk}] des letzten Scans
let cameraFailed = false;
let scanning = false;
```

- [ ] **Step 2: Screen-2-Stub (`initSearchScreen`) durch die Implementierung ersetzen**

Den Block `// ---------- Screen 2: wird in Task 6 implementiert ----------` bis vor `// ---------- Start ----------` ersetzen durch:

```js
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
        colorOk = c ? isColorMatch(c, state.colorHsv, COLOR_TOLERANCE) : true;
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
```

- [ ] **Step 3: Unit-Tests laufen lassen (Regression)**

Run: `node --test tests/`
Expected: PASS, 33 Tests

- [ ] **Step 4: Manueller End-to-End-Test am PC**

Run: `python3 -m http.server 8000`, Browser: `http://localhost:8000` (Webcam erlauben).
1. Referenzstein erfassen (wie Task 5), „Kiste durchsuchen".
2. Webcam auf mehrere Legosteine richten (oder ein Foto einer Legokiste an den Monitor halten), „Suchen" tippen.
3. Expected: Bild friert ein, Fortschrittsbalken zählt bis n, danach grüne/gelbe Rahmen ODER die „Nicht gefunden"-Meldung; keine Konsolen-Fehler.
4. Rahmen antippen → Zoom-Ansicht mit Ausschnitt; „Schließen" und „Weiter suchen" → Live-Bild wieder da.
5. Kamerazugriff im Browser blockieren, Seite neu laden → Datei-Upload-Fallback erscheint, Scan über Foto-Datei funktioniert.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: Screen 2 — Scan-Pipeline, Treffer-Overlay, Zoom, Fallbacks"
```

---

### Task 7: README + Abschlussprüfung

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: alles Vorherige
- Produces: Doku für Nutzung, Hosting und Grenzen

- [ ] **Step 1: `README.md` schreiben**

```markdown
# 🧱 LEGO-Stein-Finder

Mobile Web-App, die einen bestimmten LEGO-Stein in einer Kiste voller Steine findet.

## Benutzung

1. **Stein erfassen:** Den gesuchten Stein einzeln fotografieren (neutraler
   Hintergrund, gutes Licht). Aus den Vorschlägen den richtigen antippen,
   dann im Foto auf den Stein tippen (bestimmt die Farbe).
   Modus wählen: **Form + Farbe** oder **Nur Form**.
2. **Kiste durchsuchen:** Kamera auf die Kiste richten, **Suchen** tippen.
   Nach 5–20 s werden Treffer markiert: **grün** = Form und Farbe passen,
   **gelb** = richtige Form, andere Farbe. Rahmen antippen zeigt den
   Ausschnitt vergrößert.
3. Nichts gefunden? Steine umrühren oder näher herangehen und neu scannen —
   verdeckte Steine kann keine Kamera sehen.

Das gesuchte Teil wird gemerkt; beim nächsten Öffnen geht es direkt weiter.

## Technik

- Statische Web-App ohne Framework/Build (Vanilla JS, ES Modules)
- Kandidatensuche lokal im Browser (HSV-Farbmaske / Farbcluster + Kachelraster)
- Teile-Identifikation über die kostenlose [Brickognize-API](https://api.brickognize.com/docs)
  (keine Auth, ~60 Anfragen/min → max. 20 Kandidaten pro Scan)

## Entwicklung

- Tests: `npm test` (Node ≥ 18, keine Abhängigkeiten)
- Lokal ausführen: `npm run serve` → http://localhost:8000
  (Kamera funktioniert nur über localhost oder HTTPS)

## Hosting (fürs Handy)

Beliebiges statisches HTTPS-Hosting, z. B. GitHub Pages:
Repo pushen → Settings → Pages → Branch `main`, Ordner `/ (root)` →
URL am Handy öffnen und Kamerazugriff erlauben.

## Grenzen

- Nur oben liegende, sichtbare Steine sind auffindbar.
- Brickognize ist ein Gratis-Dienst ohne Verfügbarkeitsgarantie;
  kommerzielle Nutzung mit dem Autor klären.
- Score-/Farbschwellen (`SCORE_MIN`, `COLOR_TOLERANCE` in `js/app.js`)
  sind Startwerte — bei Bedarf nachjustieren.
```

- [ ] **Step 2: Gesamtprüfung**

Run: `node --test tests/ && ls index.html style.css js/ tests/`
Expected: alle Tests PASS; Dateien vorhanden: `index.html`, `style.css`, `js/{app,camera,color,segmentation,brickognize}.js`, Tests.

- [ ] **Step 3: Manuelle E2E-Checkliste am Handy (nach Hosting durch den Nutzer)**

1. URL am Handy öffnen (HTTPS), Kamera erlauben → Live-Vorschau der Rückkamera.
2. Referenzstein per Handykamera fotografieren → Vorschläge erscheinen.
3. Kiste scannen → Treffer/Meldung wie am PC.
4. „Form + Farbe" vs. „Nur Form" liefern unterschiedlich strenge Treffer.

(Dieser Schritt braucht das Hosting und echte Steine — Abweichungen als Issues notieren, Schwellwerte ggf. justieren.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "feat: README mit Benutzung, Hosting und Grenzen"
```
