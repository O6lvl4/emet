# emet

**A claim moves only while its evidence holds.**

`emet` reads claims with their sources, checks every figure, quotation and name in
each claim against the pages it cites, and answers with an exit status. Nothing else. Whatever runs
it decides what to do — the tool takes no position beyond whether the claim stood
up.

```
$ emet claims.json
ok  glm-flash    supported     https://huggingface.co/api/models/zai-org/GLM-5.3-Flash
ok  glm-max      supported     https://huggingface.co/api/models/zai-org/GLM-5.3
MET tsmc-aug     unsupported   裏が取れない数値 1/2: 5148.1
MET wrong-figures unsupported  裏が取れない数値 2/2: 7785900000, 5272000000
MET no-figures   unverifiable  検査できる数値がない
MET no-source    no_citation   出典が付いていない

6 件中 4 件を止めた
$ echo $?
1
```

In the story, the golem runs while **אמת** (*emet*, truth) is written on it, and
stops the moment the first letter is rubbed out, leaving **מת** (*met*, dead).
That is the whole interface: exit 0 or exit 1.

## Why an exit status

A generator that writes code can be held to a compiler. A generator that writes
claims has had nothing to be held to, so it is held to its own opinion of its
work — and a model's opinion of its own output is the one number that does not
improve with scale. Current open-weight models illustrate this precisely: on
AA-Omniscience, GLM-5.3 and Claude Opus 5 answer correctly at nearly the same
rate (80% vs 79%), yet score 14 against 34 on the index that penalises
hallucination. Same accuracy; the whole gap is knowing when not to answer.

So don't ask the model. Measure it from outside, and put the measurement where
it cannot be skipped.

## Verdicts

Five, and only the first one passes.

| | |
|---|---|
| `supported` | every checkable figure was found on a cited page |
| `no_citation` | no source was given (refused before any fetch) |
| `unreachable` | a source was given and did not answer |
| `unsupported` | a source answered and a figure is not on it |
| `unverifiable` | this tool has no way to check the claim |

`unverifiable` is deliberately **not** a pass. It is the answer for a claim with
nothing checkable in it, and the point is that it says so rather than letting it
through. `--allow-unverifiable` loosens that; it is off by default, because a
gate whose default is "probably fine" is not a gate.

The order matters. A claim with no source is refused before anything is fetched,
and a claim with nothing checkable is refused before that — no request is spent
to learn that the answer would have been "cannot tell" either way.

## Two entries, one verdict

The judging is a pure function of claim + pages. Only `src/fetch.almd` opens a
socket, which buys a second entry point that needs no network at all:

| | |
|---|---|
| `src/main.almd` | the CLI. Reads the sources itself, native binary |
| `src/worker.almd` | takes claims **and** the documents their sources returned on stdin, and judges. No `http` anywhere in its graph |

`worker.almd` exists for Cloudflare Workers, where the host's `fetch` is the only
client available and is better than any compiled in here. Same `judge.verdict`
either way, so the verdict does not depend on who did the reading.

```json
{ "min_digits": 3,
  "claims": [{"id": "c1", "text": "…", "citations": ["https://a"]}],
  "pages":  [{"url": "https://a", "doc": "<html>…", "error": ""}] }
```

**The wasm build does not work yet, and the blocker is upstream.** `page`,
`tokens` and `claim` all render to verified wasm and pass their tests there, but
`judge.verdict` walls the v1 renderer:

```
exported `pub fn verdict` is outside the MIR-lowering subset:
heap-result `match` outside the executable subset cannot be faithfully
returned in this brick (would move out an empty deferred heap value)
```

Ruled out with minimal repros: a list-carrying variant returned from a branch, a
nested heap-result `match`, block-bodied match arms, and nested closure capture
all lower fine. Returning `Option[Verdict]` — an *empty* option of a heap type —
does wall, and removing it (`local type Early` instead) did not clear `verdict`
itself. Worth filing against almide#1423 with this shape.

## Install

Needs [Almide](https://github.com/almide/almide) 0.62 or newer.

```
almide build src/main.almd -o emet     # single native binary (2.8 MB)
almide run src/main.almd claims.json   # or run in place
almide test src/main.almd              # 44 tests
almide test src/worker.almd            # 42 tests
```

## Usage

```
emet <claims.json|-> [options]

  --report <path>          refusals and passes as JSON, one row per claim
  --allow-unverifiable     let claims with no checkable figure through
  --min-digits <n>         a figure needs this many digits to be checked (3)
                           years (1900-2099) are never checked
  --timeout-ms <n>         per-request budget (15000)
  --quiet                  exit status only
```

Input:

```json
{"claims": [
  {"id": "c1", "text": "総パラメータは321323031390。", "citations": ["https://..."]}
]}
```

Exit `0` every claim supported · `1` something refused · `2` bad input.

## What gets checked

Three kinds of probe, and there are three because they fail independently — a claim
can carry a right number about the wrong company, or a real quote with an invented
figure attached.

| | catches |
|---|---|
| `figure` a run of digits | invented quantities |
| `quote` a 「…」 or "…" span | words never said |
| `entity` a capitalised latin run | a source that is about someone else |

A claim that mentions something **in order to deny it** yields no probe for it:
"GLM-5.3 のライセンスは MIT ではない" cites a page that indeed does not say MIT, and a
gate that refused it would have inverted the claim. Presence-matching cannot check
an absence, so it does not pretend to. Japanese negation is postpositional and
English prepositional, so both sides of the mention are inspected.

Katakana is **not** used as a name signal, though it was tried: it carries every
loanword, so `[ァ-ヶー]{3,}` extracted パラメータ, ライセンス and クローズド and then refused
correct claims. Kanji names are not extracted either — there is no boundary to find
without a tokeniser, and guessing one invents probes rather than finding them.

## What a figure is

A run of digits with the separators that appear inside numbers, so `NT$5148.1億`
yields `5148.1` and `前年同月比53.3%増` yields `53.3`. Commas come out of both the
claim and the page, so `5,148` and `5148` are one figure on either side.

Bare years are dropped too — see Measured below for what that was costing. Short
runs are dropped as well: `9` matches by accident on almost any page, and a token
that always matches tells the gate nothing while still costing a fetch. The floor
is on digits rather than length, so `53.3` is checked and `1.5` is not.

A figure counts as found if it appears on **any one** of the cited pages. Sources
are a set, not a ranking: a claim citing two pages and taking one figure from each
is supported.

## What it cannot do

**It matches figures as written. It does not follow unit conversion or
rounding.** This is the dominant source of refusals that are not the claim's
fault, and it is worth stating with the case that produced it.

A claim read `TSMC の8月の月次売上はNT$5148.1億で、前年同月比53.3%増` and cited TSMC's
own monthly revenue page. `emet` found `53.3` there and refused on `5148.1`. The
page is not wrong and neither is the claim — TSMC reports in NT$ thousands, so the
figure as written appears nowhere on it, in any scale, because it is also rounded.
Literal matching cannot bridge that, and guessing at scale factors would turn a
check into a coin flip.

The workable discipline is the reverse: **quote figures in the units the source
uses**, or cite a source that states them in the claim's units. That is a real
constraint on how claims get written, and it is the intended one.

Also outside v0:

- **Prose claims.** No numbers, no check — `unverifiable`, by design.
- **Semantic support.** A page that contains `53.3` in an unrelated sentence will
  vouch for a claim about `53.3`. Figures are evidence of contact with the source,
  not proof the source says what the claim says.
- **Anything behind auth, or rendered only by script.**

## The report is the point

`--report` writes one row per claim: the verdict, the figures that were checked,
the ones that matched, the ones that did not.

That file is why this is worth building before the rest of a pipeline. Each
refusal is one row of the calibration set a conformal threshold is later fitted
on, and one example for training a model to abstain. So the shape is designed and
flat rather than derived from the type — it has to stay readable by whatever reads
it next, which is not this program.

## Measured

The gate is a detector, so it is measured as one. Two numbers, and they trade:

- **detection** — of claims with one piece of evidence corrupted, how many are refused
- **false refusal** — of curated claims written from the source they cite, how many are refused

Neither means anything alone. Refuse everything and detection is perfect; refuse
nothing and false refusal is zero. The pair is the operating point.

**Corpus.** 115 entries of [chip-war-chronicle](https://github.com/O6lvl4/chip-war-chronicle)
(every 5th of 574, spanning 2018–2026 and all six lanes), each written by hand from
the source it cites. Every source is fetched **once** (`bench/fetch.mjs`) and all
sets are judged against byte-identical pages through `src/worker.almd`, so a verdict
can only differ because of the corruption. 102 of 115 sources returned content; 101
of those carry real body text, so page acquisition is not the bottleneck.

**Corruptions**, one per claim per kind: a figure scaled by 1.7, the first name
swapped for one absent from the corpus, a fabricated 「…」 inserted. The scale factor
matters — changing the last digit was the first attempt and it was invalid, because
53.3 → 53.7 is 0.75% and sits *inside* the 1% rounding tolerance, so a correct
matcher scored as a miss.

### The curve, four ways

`min_support` is the threshold on a claim's support score. 91 of 115 originals were
decided (the rest unverifiable or unreachable). Each column is a different way of
scoring the evidence, built in this order because each one was the fix the previous
measurement asked for:

| min_support | binary match | + quantity compare | + graded figures | + graded text |
|---|---|---|---|---|
| 100 | 78.0% / 100% | 74.7% / 96.1% | 75.8% / 100% | **75.8% / 100%** |
| 90 | 76.9% / 95.6% | 72.5% / 89.5% | 73.6% / 92.6% | **70.3% / 83.6%** |
| 80 | 68.1% / 59.7% | 65.9% / 47.9% | 65.9% / 52.1% | **61.5% / 54.9%** |
| 70 | 62.6% / 45.7% | 62.6% / 33.3% | 61.5% / 34.9% | **57.1% / 32.6%** |
| 60 | 52.7% / 23.3% | 51.6% / 26.4% | 53.8% / 23.0% | **49.5% / 24.3%** |
| 25 | 31.9% / 3.5% | 29.7% / 4.8% | 29.7% / 5.4% | **25.3% / 7.1%** |
| 1 | 27.5% / 2.6% | 25.3% / 3.1% | 25.3% / 1.9% | **22.0% / 1.2%** |

*(false refusal / detection)*

**No configuration has a usable operating point.** The best trade available anywhere
is 61.5% false refusal for 54.9% detection. Where false refusal becomes tolerable,
detection is in single digits. A retry loop driven by any column here sends back
roughly three correct answers in five.

Everything that was tried is in that table, and the total gain from all of it is
about six points of specificity. That is the result: **not an implementation that
needs more work, a ceiling.**

### Why the ceiling is there

Three measurements locate it, and none of them is about the code.

**1. Most honest citations do not contain their claim's evidence verbatim.** On pages
carrying real body text, only **34%** of claims have every figure present as written:

> TSMC reports `NT$514,806,000 thousand`. The claim says `NT$5148.1億`.

A unit multiplier of 10⁵, a rounding to five significant figures, and a thousands
separator, all at once. `src/numeric.almd` compares quantities across powers of ten
within 1% precisely for this, and it is worth **three points**.

**2. Counting probes is structurally biased against well-evidenced claims.** False
refusal rises with how much evidence a claim carries, because every additional probe
is another chance to be scored missing:

| probes in claim | 1 | 2–3 | 4–6 | 7+ |
|---|---|---|---|---|
| false refusal | 70.0% | 69.6% | 81.8% | **85.7%** |

Averaging graded strengths instead of counting matches removes that bias, which is
what the fourth column does.

**3. And this is the one that closes it.** A corruption changes one probe. An honest
restatement also changes one probe. So *any* statistic over how many probes are
missing confounds the two, and grading only widens the gap where the difference is
numeric — a 1.7× figure scores 0 against a rounding's 100. For a paraphrased quote or
an aliased name there is no comparable distance, and those are 319 of 440 probes.

**The finding is about the approach, not the implementation: citation grounding by
matching measures a property most honest citations do not have.**

That is why [DESIGN.md](./DESIGN.md) lists the generator-side signals as **required**
rather than next. They ask a different question — was the model stable when it
produced this — and that question is indifferent to how the source is worded. It also
needs a model, which is where this stops.

### What the A-group work did establish

- **Quotes and names make prose checkable at all.** Claims with no checkable figure
  fell from 36 to 11 of 115. Necessary, just not sufficient.
- **Ten of the first 28 passes were spurious** — vouched for by a *year* matching and
  nothing else. Excluding years cost 10 passes that rested on no evidence.
- **Redirects and a dropped timeout were refusing correct claims.** Newsrooms answer
  302 (`news.samsung.com`, `ir.amd.com`, `www.intc.com`, `news.skhynix.com`), and
  `--timeout-ms` was parsed and then never written to the env knob that governs the
  read.
- **Two decisions could not be made from the data**: whether entity probes should be
  decisive (advisory moved abstention from 13.9% to 39.1% *and* opened a false pass),
  and where the support threshold belongs. Both need a calibrated score rather than a
  binary, which is the strongest argument for the conformal step there is.

### Reproducing

```
node bench/build.mjs <claims.json> /tmp/bench   # originals + corruption sets
node bench/fetch.mjs /tmp/bench 8               # one request per source
node bench/score.mjs /tmp/bench                 # detection / false refusal
node bench/curve.mjs /tmp/bench                 # sweep min_support
```

### Known crash

One citation (`si-2`, a `tsmc.com` URL) aborts the process:

```
thread 'main' panicked: end byte index 57647 is not a char boundary;
it is inside '\u{fffd}' (bytes 57645..57648 of string)
```

The page contains invalid UTF-8. `fs.read_text` refuses such input outright; the HTTP
client decodes it lossily, so the string arrives carrying replacement characters.
Normalising before any index is taken did not clear it, and a synthetic invalid-UTF-8
page served over HTTP does not reproduce it. A pure-regex rewrite of the page path was
tried and reverted — it overflowed the stack on a 200 KB page. `bench/fetch.mjs`
decodes in Node and sidesteps it, which is how the numbers above were obtained.

## Not built yet## Not built yet## Not built yet

v0 checks citation coverage and nothing else. The two signals that go with it —
self-consistency across repeated samples, and stability across paraphrases of the
same question — need a model behind them and are not here. Neither is the
conformal calibration that would turn a hand-set threshold into a stated bound on
how often a refusal is wrong.

The order is deliberate: citation coverage is the cheapest of the three and the
only one that needs no inference at all, and the other two are fitted on data this
one produces.

## License

MIT or Apache-2.0, at your option.
