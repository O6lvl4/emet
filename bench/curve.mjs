// Sweep the support threshold and print the operating curve.
//
// The all-or-nothing gate has one operating point and it is the wrong one: 100%
// detection, 78% false refusal. This finds out whether a share-of-probes threshold
// has a usable point anywhere, and where.
//
// Detection is credited only where the original passed at the same threshold —
// refusing something already refused proves nothing. False refusal is measured on
// curated entries written from the source they cite, which is a weak positive label:
// some of those refusals are correct, because a timeline entry may legitimately
// convert units or paraphrase. So the false-refusal column is an upper bound on the
// gate's error, and the detection column is exact.
//
//   node bench/curve.mjs <out-dir> [min_digits]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [outDir, minDigits = '3'] = process.argv.slice(2);
const pages = JSON.parse(fs.readFileSync(path.join(outDir, 'pages.json'), 'utf8'));
const load = (n) => JSON.parse(fs.readFileSync(path.join(outDir, `${n}.claims.json`), 'utf8')).claims;
const SETS = ['original', 'figure', 'entity', 'quote'];
const claimSets = Object.fromEntries(SETS.map((n) => [n, load(n)]));

function judge(claims, minSupport) {
  const input = JSON.stringify({ min_digits: +minDigits, min_support: minSupport, claims, pages });
  let out;
  try {
    out = execFileSync('almide', ['run', 'src/worker.almd'], { input, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' });
  } catch (e) {
    if (typeof e.stdout !== 'string' || !e.stdout.trim()) throw e;
    out = e.stdout;
  }
  const r = JSON.parse(out);
  return new Map(r.claims.map((c) => [c.id, c]));
}

const THRESHOLDS = [100, 90, 80, 70, 60, 50, 40, 34, 25, 1];
const rows = [];

for (const t of THRESHOLDS) {
  const by = Object.fromEntries(SETS.map((n) => [n, judge(claimSets[n], t)]));
  const orig = by.original;
  const decided = [...orig.values()].filter((c) => c.verdict === 'supported' || c.verdict === 'unsupported');
  const passed = decided.filter((c) => c.verdict === 'supported');
  const falseRef = decided.length ? (decided.length - passed.length) / decided.length : 0;

  let hits = 0, tot = 0;
  for (const kind of ['figure', 'entity', 'quote']) {
    for (const [id, c] of by[kind]) {
      const o = orig.get(id);
      if (!o || o.verdict !== 'supported') continue;
      tot += 1;
      if (c.verdict !== 'supported') hits += 1;
    }
  }
  rows.push({ t, decided: decided.length, passed: passed.length, falseRef, det: tot ? hits / tot : 0, tot });
  console.error(`  threshold ${t} done`);
}

console.log(['min_support', 'decided', 'passed', 'false_refusal', 'corruptions_seen', 'detection'].join('\t'));
for (const r of rows) {
  console.log([r.t, r.decided, r.passed, (100 * r.falseRef).toFixed(1) + '%', r.tot, (100 * r.det).toFixed(1) + '%'].join('\t'));
}

// The point that matters: the lowest false refusal at which detection is still
// worth having. Stated rather than chosen, because the choice belongs to a
// calibration set and an α, not to this script.
const usable = rows.filter((r) => r.det >= 0.5).sort((a, b) => a.falseRef - b.falseRef)[0];
console.log(`\nlowest false refusal with detection >= 50%: min_support=${usable?.t ?? '—'} ` +
  `false_refusal=${usable ? (100 * usable.falseRef).toFixed(1) + '%' : '—'} ` +
  `detection=${usable ? (100 * usable.det).toFixed(1) + '%' : '—'}`);
fs.writeFileSync(path.join(outDir, 'curve.json'), JSON.stringify(rows, null, 1));
