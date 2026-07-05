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

// ---------- Formbasierte Kandidaten (Modus „Nur Form") ----------

// Seitenverhältnis, skala- und rotationstolerant: 0 (sehr länglich) .. 1 (quadratisch).
export function aspectRatio({ w, h }) {
  const hi = Math.max(w, h);
  return hi === 0 ? 0 : Math.min(w, h) / hi;
}

// Füllgrad der Bounding-Box (area / w·h), 0 .. 1 — unterscheidet kompakte von sparrigen Formen.
export function extent({ w, h, area }) {
  const bb = w * h;
  return bb === 0 ? 0 : Math.min(1, area / bb);
}

export function descriptorOf(box) {
  return { aspect: aspectRatio(box), extent: extent(box) };
}

// Abstand zweier Form-Deskriptoren (klein = ähnlich). Seitenverhältnis zählt mehr als Füllgrad.
export function shapeDistance(a, b) {
  return 0.6 * Math.abs(a.aspect - b.aspect) + 0.4 * Math.abs(a.extent - b.extent);
}

// Median-Größe einer Box-Liste — robuste Schätzung der Einzel-Steingröße im Bild.
export function medianBoxSize(boxes) {
  if (!boxes.length) return { w: 0, h: 0, area: 0 };
  const med = (vals) => {
    const s = [...vals].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return {
    w: med(boxes.map((b) => b.w)),
    h: med(boxes.map((b) => b.h)),
    area: med(boxes.map((b) => b.area)),
  };
}

// Zerlegt eine (zu große) Box in ein Raster ~stein-großer Zellen, statt sie zu verwerfen.
export function splitBox(box, unit) {
  const cols = Math.max(1, Math.round(box.w / unit.w));
  const rows = Math.max(1, Math.round(box.h / unit.h));
  if (cols === 1 && rows === 1) return [{ ...box }];
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round(box.x + (c * box.w) / cols);
      const y = Math.round(box.y + (r * box.h) / rows);
      const w = Math.round(box.x + ((c + 1) * box.w) / cols) - x;
      const h = Math.round(box.y + ((r + 1) * box.h) / rows) - y;
      cells.push({ x, y, w, h, area: w * h });
    }
  }
  return cells;
}

// Deskriptor des Referenzsteins: Vordergrund gegen einen aus den Rändern geschätzten
// (neutralen) Hintergrund segmentieren, größte Komponente vermessen.
export function describeShape(imageData, { tolerance = 0.16, minAreaFrac = 0.02 } = {}) {
  const { data, width, height } = imageData;
  let r = 0, g = 0, b = 0, n = 0;
  const sample = (x, y) => {
    const i = (y * width + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  };
  for (let x = 0; x < width; x++) { sample(x, 0); sample(x, height - 1); }
  for (let y = 0; y < height; y++) { sample(0, y); sample(width - 1, y); }
  if (n === 0) return null;
  const bg = rgbToHsv(r / n, g / n, b / n);
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (colorDistance(rgbToHsv(data[i], data[i + 1], data[i + 2]), bg) > tolerance) mask[p] = 1;
  }
  const minArea = Math.max(20, Math.round(width * height * minAreaFrac));
  const comps = findComponents(mask, width, height, { minArea });
  if (!comps.length) return null;
  comps.sort((a, b) => b.area - a.area);
  const box = comps[0];
  return { aspect: aspectRatio(box), extent: extent(box), box };
}

// Kandidaten für den Modus „Nur Form": alle Steine segmentieren, verschmolzene Blobs
// in stein-große Zellen splitten, nach Formähnlichkeit zum Referenzstein priorisieren.
export function findShapeCandidates(imageData, { refShape = null, maxCandidates = 36 } = {}) {
  const { width, height } = imageData;
  const minArea = Math.max(20, Math.round(width * height * 0.0003));
  const maxArea = Math.round(width * height * 0.9); // große Blobs behalten (werden gesplittet)
  const blobs = findColorBlobs(imageData, { minArea, maxArea });
  if (!blobs.length) return tileGrid(width, height).slice(0, maxCandidates);
  const unit = medianBoxSize(blobs);
  const unitArea = unit.area || minArea;
  const boxes = [];
  for (const box of blobs) {
    if (box.area > 1.8 * unitArea) boxes.push(...splitBox(box, unit));
    else boxes.push(box);
  }
  for (const box of boxes) {
    if (box.area == null) box.area = box.w * box.h;
    const shapePen = refShape ? shapeDistance(descriptorOf(box), refShape) : 0;
    const sizePen = 0.15 * Math.abs(Math.log((box.area || 1) / unitArea));
    box.shapeScore = -(shapePen + sizePen); // höher = besser
  }
  boxes.sort((a, b) => b.shapeScore - a.shapeScore);
  return dedupeBoxes(boxes).slice(0, maxCandidates);
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
