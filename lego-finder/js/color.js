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
