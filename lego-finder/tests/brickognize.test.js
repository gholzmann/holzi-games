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
