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
