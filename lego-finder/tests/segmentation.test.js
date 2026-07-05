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
