# emet

**A claim moves only while its figures hold.**

`emet` reads claims with their sources, checks every figure in each claim against
the pages it cites, and answers with an exit status. Nothing else. Whatever runs
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
almide test src/main.almd              # 24 tests
almide test src/worker.almd            # 22 tests
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

115 entries of a real timeline ([chip-war-chronicle](https://github.com/O6lvl4/chip-war-chronicle),
every 5th of 574, so the sample spans 2018–2026 and all six of its lanes), each
one a claim written from the source it cites. Two runs, before and after the
figure rule learned to skip years:

| verdict | first run | after | |
|---|---|---|---|
| `supported` | 28 | **18** | −10 |
| `unsupported` | 45 | 39 | −6 |
| `unverifiable` | 36 | **55** | +19 |
| `unreachable` | 6 | **3** | −3 |

Three things came out of this, and only one of them was expected.

**Ten of the 28 passes were spurious.** They were vouched for by a *year*
matching — `2019` in the claim, `2019` somewhere on the page — and nothing else.
Over a third of everything the gate let through was resting on no evidence at all.
Excluding years is what moved 19 claims into `unverifiable`: the gate stopped
pretending to check them. The worse-looking column is the correct one.

**Redirects were refusing correct claims.** Newsrooms answer 302 —
`news.samsung.com`, `ir.amd.com`, `www.intc.com`, `news.skhynix.com` — and
`--timeout-ms` was being parsed and then dropped on the floor rather than written
to the env knob that actually governs the read. Fixing both took `unreachable`
from 6 to 3, and the 3 that remain are a genuine `sec.gov` 403 and two slow hosts.

**Only about a sixth of the corpus is checkable this way.** 55 of 115 entries
carry no figure that literal matching can verify, and most of the 39 refusals are
the unit-conversion case above rather than anything wrong with the claim. That is
the honest ceiling on citation coverage alone, and it is the whole argument for
the two signals below: they need a model, but they apply to prose.

One caveat on the runs themselves: one pass died in an Almide runtime panic
(`end byte index … is not a char boundary`, inside a `\u{fffd}`) on a page with
invalid UTF-8, and did not reproduce on the next. `string.index_of`, `slice` and
`drop` were checked and agree on char indices, so this looks like it belongs
upstream rather than here.

## Not built yet

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
