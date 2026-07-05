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
