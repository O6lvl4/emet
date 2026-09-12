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

115 entries of a real timeline ([chip-war-chronicle](https://github.com/O6lvl4/chip-war-chronicle),
every 5th of 574, spanning 2018–2026 and all six of its lanes), each one a claim
written from the source it cites. Four runs, each one a change the previous run
forced:

| | figures only | + quote/entity | entity advisory | + multi-word names |
|---|---|---|---|---|
| `supported` | 28 | 27 | 20 | **21** |
| `unsupported` | 45 | 72 | 50 | **77** |
| `unverifiable` | 36 | **11** | 40 | **11** |
| `unreachable` | 6 | 5 | 5 | **5** |
| **abstention** | 36.5% | 13.9% | 39.1% | **14.0%** |

**Quotes and names are what make prose checkable.** Abstention fell from 36.5% to
14.0% — 44 claims that figures alone could not judge at all became judgeable. That
is the one result that came out as intended.

**Ten of the original 28 passes were spurious.** They were vouched for by a *year*
matching — `2019` in the claim, `2019` somewhere on the page — and nothing else.
Excluding years (`is_year`) cost 10 passes that were resting on no evidence.

**Entity probes cannot be made reliable by tuning, and the measurement says so
four times.** Of 283 entity probes, 96 fail, and inspecting them shows the failures
are mostly the extractor's: domain vocabulary read as names (GPU, DRAM, NAND, IoT,
HPC, MoE, G20), and product names a source renders differently (Rubin, BiCS, A12).
Two attempts to fix it both made something worse:

- *Demoting entity to advisory* moved abstention from 13.9% to **39.1%** — worse,
  because an entity is the only probe many claims have, so removing it from the
  decision removes the claim from being checkable. It also opened a false pass: a
  right figure on a page about a different company went green.
- *Spanning multi-word names* is semantically right — "Western Digital" is one name,
  not two probes — and lowered the entity hit rate from 71% to 66%, because sources
  write "WD". It is kept anyway: matching the fragment "Western" is a false-pass
  mechanism, and the same reasoning that excluded years applies here.

And one case no extractor can fix: a claim about TSMC citing TSMC's own press
release does not need the string "TSMC" in the body, because TSMC is the publisher.

The conclusion is in [DESIGN.md](./DESIGN.md): a binary all-or-nothing per probe
kind is the wrong instrument. An entity miss is weaker evidence than a figure miss,
and nothing here can say "weaker". That is what the conformal step is for, and why
this choice is undecidable without it.

**Redirects were refusing correct claims.** Newsrooms answer 302 —
`news.samsung.com`, `ir.amd.com`, `www.intc.com`, `news.skhynix.com` — and
`--timeout-ms` was parsed and then dropped rather than written to the env knob that
governs the read. Fixing both took `unreachable` from 6 to 3; it is 5 here because
two slow hosts moved.

**Figures still cannot follow unit conversion or rounding.** A claim reading
`TSMC の8月の月次売上はNT$5148.1億で、前年同月比53.3%増` cites TSMC's own monthly revenue
page. `emet` finds `53.3` and refuses on `5148.1`: TSMC reports in NT$ thousands, so
the figure as written appears nowhere on it, in any scale, because it is also
rounded. The workable discipline is the reverse — **quote figures in the units the
source uses** — and it is the intended constraint.

### Known crash

One citation (`si-2`, a `tsmc.com` blog URL) aborts the process:

```
thread 'main' panicked: end byte index 57647 is not a char boundary;
it is inside '\u{fffd}' (bytes 57645..57648 of string)
```

The page contains invalid UTF-8. `fs.read_text` refuses such input outright; the
HTTP client decodes it lossily, so the string arrives carrying replacement
characters. Normalising before any index is taken (so every offset comes from the
string it cuts) did not clear it, and a synthetic invalid-UTF-8 page served over
HTTP does not reproduce it. A pure-regex rewrite of the page path was tried and
reverted — it overflowed the stack on a 200 KB page. The 114-entry column above
excludes this one claim.

## Not built yet## Not built yet

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
