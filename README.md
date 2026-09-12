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

## Install

Needs [Almide](https://github.com/almide/almide) 0.62 or newer.

```
almide build src/main.almd -o emet     # single native binary
almide run src/main.almd claims.json   # or run in place
almide test src/main.almd              # 13 tests
```

## Usage

```
emet <claims.json|-> [options]

  --report <path>          refusals and passes as JSON, one row per claim
  --allow-unverifiable     let claims with no checkable figure through
  --min-digits <n>         a figure needs this many digits to be checked (3)
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

Short runs are dropped. `9` matches by accident on almost any page, and a token
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
