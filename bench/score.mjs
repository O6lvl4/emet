// Judge every set against the one page set, and report the gate as a detector.
//
// Two numbers matter and they trade against each other:
//
//   detection      of claims with one piece of evidence corrupted, how many refused
//   false refusal  of curated claims written from their own source, how many refused
//
// Neither is meaningful alone. A gate that refuses everything detects perfectly;
// a gate that refuses nothing never false-refuses. The pair is the operating point,
// and the pair is what a conformal threshold is later fitted to move along.
//
// Judging runs through src/worker.almd, so no source is read twice and every set
// sees byte-identical pages.
//
//   node bench/score.mjs <out-dir> [min_digits]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [outDir, minDigits = '3'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node bench/score.mjs <out-dir> [min_digits]');
  process.exit(2);
}

const pages = JSON.parse(fs.readFileSync(path.join(outDir, 'pages.json'), 'utf8'));

function judge(name) {
  const claims = JSON.parse(fs.readFileSync(path.join(outDir, `${name}.claims.json`), 'utf8')).claims;
  const input = JSON.stringify({ min_digits: +minDigits, claims, pages });
  // The worker exits 1 whenever anything was refused — that is its interface, not
  // an error, so the status is ignored and only the report is read.
  let out;
  try {
    out = execFileSync('almide', ['run', 'src/worker.almd'], {
      input, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8',
    });
  } catch (e) {
    if (typeof e.stdout !== 'string' || !e.stdout.trim()) throw e;
    out = e.stdout;
  }
  const report = JSON.parse(out);
  const by = new Map(report.claims.map((c) => [c.id, c]));
  return { claims, report, by };
}

const sets = {};
for (const name of ['original', 'figure', 'entity', 'quote']) sets[name] = judge(name);

const verdicts = (s) => {
  const n = {};
  for (const c of s.report.claims) n[c.verdict] = (n[c.verdict] || 0) + 1;
  return n;
};

const refused = (c) => c.verdict !== 'supported';
const decidable = (c) => c.verdict === 'supported' || c.verdict === 'unsupported';

const orig = sets.original;
const origBy = orig.by;

console.log('=== verdicts ===');
console.log(['set', 'n', 'supported', 'unsupported', 'unverifiable', 'unreachable'].join('\t'));
for (const [name, s] of Object.entries(sets)) {
  const v = verdicts(s);
  console.log([name, s.report.total, v.supported || 0, v.unsupported || 0, v.unverifiable || 0, v.unreachable || 0].join('\t'));
}

// A corruption only tests the detector where the original was actually decided.
// If the original was unverifiable or unreachable, refusing its corruption proves
// nothing about the corruption.
console.log('\n=== detection, on the subset whose original was decided ===');
console.log(['corruption', 'n', 'caught', 'rate'].join('\t'));
for (const name of ['figure', 'entity', 'quote']) {
  const s = sets[name];
  const rows = s.report.claims.filter((c) => decidable(origBy.get(c.id) || {}));
  const caught = rows.filter((c) => refused(c) && !refused(origBy.get(c.id))).length
    + rows.filter((c) => refused(c) && refused(origBy.get(c.id))).length;
  // A corruption "caught" only counts when the original passed and this one does
  // not: anything already refused cannot be credited to the corruption.
  const fair = rows.filter((c) => !refused(origBy.get(c.id)));
  const hits = fair.filter((c) => refused(c)).length;
  console.log([name, fair.length, hits, fair.length ? (100 * hits / fair.length).toFixed(1) + '%' : '—'].join('\t'));
}

const origDecided = orig.report.claims.filter(decidable);
const falseRefusals = origDecided.filter((c) => c.verdict === 'unsupported');
console.log('\n=== false refusal, on curated originals ===');
console.log(`decided        ${origDecided.length}/${orig.report.total}`);
console.log(`refused        ${falseRefusals.length}  (${(100 * falseRefusals.length / Math.max(origDecided.length, 1)).toFixed(1)}%)`);
const kinds = {};
for (const c of falseRefusals) for (const p of c.missing || []) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log(`missing by kind ${JSON.stringify(kinds)}`);

fs.writeFileSync(path.join(outDir, 'scored.json'), JSON.stringify(
  Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, s.report])), null, 1));
