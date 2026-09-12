// Build a labelled detection benchmark for the gate.
//
// The question the gate has to answer is not "is this claim true" but "does the
// cited page support it". So the labels come from provenance, not from judgement:
// a curated timeline entry written from the source it cites is a positive, and the
// same entry with one piece of its evidence corrupted is a negative.
//
// Every source is fetched exactly once and handed to src/worker.almd, so the
// originals and all their corruptions are judged against byte-identical pages. A
// difference in verdict can then only come from the corruption. It also keeps the
// run to one request per URL instead of one per claim.
//
//   node bench/build.mjs <claims.json> <out-dir>
//
// Corruptions, one per claim per kind:
//   figure   last digit of the first figure is changed        → invented quantity
//   entity   the first latin name is swapped for another      → source is about someone else
//   quote    a fabricated 「…」 is inserted                    → words never said

import fs from 'node:fs';
import path from 'node:path';

const [claimsPath, outDir] = process.argv.slice(2);
if (!claimsPath || !outDir) {
  console.error('usage: node bench/build.mjs <claims.json> <out-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf8')).claims;

// Names that do not appear in this corpus, so a swap cannot accidentally still be
// supported by the page.
const FOREIGN = ['Zylotech', 'Brambleworth', 'Quintaneum', 'Ferrovax'];
const FAKE_QUOTE = '過去に一度も観測されていない水準';

const figureRe = /\d[\d,.]{2,}/;
const entityRe = /\b[A-Z][A-Za-z0-9&.-]{2,}(?: [A-Z][A-Za-z0-9&.-]+)*/;

// Years are not probes, so corrupting one would produce a negative the gate is
// correct to pass — that would measure the label, not the detector.
const isYear = (s) => /^\d{4}$/.test(s) && +s >= 1900 && +s <= 2099;

// The corruption has to be larger than the matcher's tolerance, or the measurement
// reports the tolerance instead of the detector. Changing the last digit was the
// first attempt and it was invalid: 53.3 -> 53.7 is a 0.75% change, inside the 1%
// relative tolerance that src/numeric.almd uses for rounding, so a correct matcher
// scored as a miss. Scaling by 1.7 is unambiguously a different quantity and is not
// a power of ten, so no unit rescaling can recover it either.
function corruptFigure(text) {
  let m = null;
  for (const cand of text.matchAll(/\d[\d,.]{2,}/g)) {
    const digits = cand[0].replace(/\D/g, '');
    if (digits.length >= 3 && !isYear(cand[0])) { m = cand; break; }
  }
  if (!m) return null;
  const orig = m[0];
  const value = Number(orig.replace(/,/g, ''));
  if (!Number.isFinite(value) || value === 0) return null;
  const decimals = (orig.split('.')[1] || '').length;
  const swapped = (value * 1.7).toFixed(decimals);
  return swapped === orig ? null : text.slice(0, m.index) + swapped + text.slice(m.index + orig.length);
}

function corruptEntity(text, i) {
  const m = text.match(entityRe);
  if (!m || m[0].length < 3) return null;
  return text.replace(m[0], FOREIGN[i % FOREIGN.length]);
}

function corruptQuote(text) {
  return text.includes('「') ? null : `${text}。関係者は「${FAKE_QUOTE}」と述べた`;
}

const sets = { original: [], figure: [], entity: [], quote: [] };
for (const [i, c] of claims.entries()) {
  sets.original.push({ id: c.id, text: c.text, citations: c.citations });
  for (const [kind, fn] of [['figure', corruptFigure], ['entity', (t) => corruptEntity(t, i)], ['quote', corruptQuote]]) {
    const text = fn(c.text);
    if (text) sets[kind].push({ id: c.id, text, citations: c.citations });
  }
}

const urls = [...new Set(claims.flatMap((c) => c.citations))];
fs.writeFileSync(path.join(outDir, 'urls.json'), JSON.stringify(urls, null, 1));
for (const [name, cs] of Object.entries(sets)) {
  fs.writeFileSync(path.join(outDir, `${name}.claims.json`), JSON.stringify({ claims: cs }, null, 1));
}

console.error(`urls ${urls.length}`);
for (const [name, cs] of Object.entries(sets)) console.error(`${name.padEnd(9)} ${cs.length}`);
