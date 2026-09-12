// Fetch every source once and write the worker's page set.
//
// Separate from build.mjs so a run can be repeated without re-fetching, and so the
// judging is reproducible: the same pages.json judged twice gives the same verdicts,
// which is what lets the corruption sets be compared against the originals at all.
//
//   node bench/fetch.mjs <out-dir> [concurrency]

import fs from 'node:fs';
import path from 'node:path';

const [outDir, conc = '6'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node bench/fetch.mjs <out-dir> [concurrency]');
  process.exit(2);
}

const urls = JSON.parse(fs.readFileSync(path.join(outDir, 'urls.json'), 'utf8'));
const UA = 'Mozilla/5.0 (compatible; emet/0.1; +https://github.com/O6lvl4/emet)';
const pages = [];
let done = 0;

// Bytes, not text: a page with invalid UTF-8 is decoded here with the replacement
// policy stated, rather than left to whatever the caller happens to do. The gate
// is being measured, not the decoder.
async function one(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { url, doc: '', error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { url, doc: new TextDecoder('utf-8', { fatal: false }).decode(buf), error: '' };
  } catch (e) {
    return { url, doc: '', error: String(e.message || e).slice(0, 120) };
  }
}

const queue = [...urls];
await Promise.all(
  Array.from({ length: Math.min(+conc, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      pages.push(await one(url));
      done += 1;
      if (done % 20 === 0) console.error(`  ${done}/${urls.length}`);
    }
  }),
);

fs.writeFileSync(path.join(outDir, 'pages.json'), JSON.stringify(pages));
const failed = pages.filter((p) => p.error);
console.error(`pages ${pages.length}  reachable ${pages.length - failed.length}  failed ${failed.length}`);
for (const p of failed.slice(0, 8)) console.error(`  ${p.error}  ${p.url.slice(0, 72)}`);
