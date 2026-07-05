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
