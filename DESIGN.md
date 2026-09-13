# Design

What this is for, what it optimises, and the rules it will not break.

Written down because the objective is easy to lose. Every session that touches a
gate drifts toward "make it more accurate", which is unbounded and unfalsifiable.
The objective below is neither.

Every number here is either cited or marked unmeasured. A design document for a
citation gate that made up its figures would be self-refuting.

## The objective

> **Minimise the abstention rate, subject to a guaranteed error bound.**
>
> abstention rate = the cost function
> error rate ≤ α = the constraint
> signals = what you buy to lower the cost

Not "raise the pass rate" — a gate that passes more by checking less is worse, and
the pass rate cannot tell you which happened. Not "improve accuracy" — there is no
stopping condition.

This framing is why conformal prediction is the target and not an extra: it is the
theory of exactly this problem, and it supplies the constraint as a distribution-free
bound rather than a hope.

Today emet abstains on a large fraction of real claims with **no bound at all**.
That is the baseline. The bound comes in v2; until then the cost function has no
constraint and the numbers below are descriptive, not guarantees.

## The benchmark target, and where the gap actually is

The agentic composite the general-purpose coding agents are ranked on, as reported by
[BenchLM, September 2026](https://benchlm.ai/agentic) — Terminal-Bench 2.0 30% ·
BrowseComp 25% · OSWorld-Verified 25% · OSWorld 2.0 10%, the four documented weights
summing to 90%:

| | composite | weights |
|---|---|---|
| Claude Fable 5.1 | 80.2 | closed |
| Claude Opus 5 | 78.1 | closed |
| Kimi K3 | 71.9 | open |
| GLM-5.3 | 68.4 | open |

### The first read of this was wrong

The original version of this section reasoned: three of four components validate by
execution or compile, BrowseComp does not, therefore BrowseComp is where open weights
lose and a citation gate is the missing verifier. That was a guess about where the
8.3-point gap lives, and it does not survive the published component scores.

| component (weight) | best open-weight | best Claude |
|---|---|---|
| Terminal-Bench (30%) | GLM-5.3 **88.2** | Opus 5 ≈89 |
| BrowseComp (25%) | Kimi K3 **91.2** | Opus 5 90.8 |
| OSWorld-Verified (25%) | Qwen3.8 Max **86.1** · Kimi K3 84.8 | Fable 5 85.0 |
| OSWorld 2.0 (10%) | Kimi K3 58.3 | GPT-5.6 Sol 62.6 |

**On every component, open weights are within roughly a point of Claude's best or
ahead of it.** BrowseComp in particular is near saturation — the top models sit inside
1.0 point of each other — and Kimi K3 leads it. A gate that supplies BrowseComp with a
verifier is aimed at the component that is not the bottleneck.

### What the arithmetic says instead

Reconstructing the composite from each model's own published component bests, over the
90% of weight that is documented:

| | reconstructed | published | shortfall |
|---|---|---|---|
| Claude, best of Opus 5 / Fable 5 | 85.5 | **80.2** | −5.3 |
| Kimi K3 alone, at its own bests | 84.8 | **71.9** | **−12.9** |
| Open weights, best per component | 85.1 | — | — |

Two things fall out, and the second is the one that matters.

**Kimi K3's own component scores reconstruct to 84.8 — above Fable 5.1's published
80.2.** The capability to exceed the target is already in an open-weight model.

**And every model's published composite is below its own reconstruction, but the open-weight
model loses two and a half times as much.** A composite measures every model through one
common harness. Claude gives up 5.3 points to that; Kimi K3 gives up 12.9. The
difference is not ability — it is that Claude's harness is co-designed with Claude, and
an open-weight model in a generic scaffold cannot reach scores it demonstrably has.
This is the same effect the Terminal-Bench maintainers warn about when they note the
same model can swing 30 to 50 points depending on which harness wraps it.

> **~~So the target is not a capability gap to close. It is ~13 points of a model's own
> measured ability that a generic harness throws away, and the harness is the part a
> system builder controls.~~**
>
> **RETRACTED.** The two composites being subtracted are averages over different
> component sets, and the per-component figures come from vendor reports rather than from
> the composite's own measurements. See *The reconstruction itself does not hold* below.
> The number is an artifact; nothing here establishes that a harness throws away 13 points,
> or any points.

That was what golemide was for, and it is why the composite claim belonged to the harness
work rather than to this repo. `emet` remains useful for what it actually does — making
a claim's grounding checkable where nothing checked it before — but the measurement says
it is not the lever on this benchmark.

**Caveats, stated because the reconstruction is arithmetic on other people's numbers.**
Component scores come from different pages and different harness configurations, several
at "maximum thinking, tools enabled", and BenchLM does not publish the per-model
breakdown behind its composite — so these reconstructions are upper bounds on what a
harness could recover, not measured composites. 10% of the composite weight is
undocumented.

### The reconstruction itself does not hold

Checked against BenchLM's own per-benchmark leaderboards, and it fails for a reason that
has nothing to do with harnesses.

The weights above are right — Terminal-Bench 2.0 30%, BrowseComp 25%, OSWorld-Verified
25%, OSWorld 2.0 10%, everything else display-only — and so are the published composites.
The sentence that matters is how the composite handles a missing component: it is
**normalized by available weights**. And the components are missing, differently for each
model:

| component | Kimi K3 | Claude Fable 5.1 | Claude Opus 5 | GLM-5.3 |
|---|---|---|---|---|
| BrowseComp | **91.2** | not listed | 90.8 | not listed |
| OSWorld-Verified | **not listed** | Fable 5: 85.0 | not listed | not listed |

So 71.9 and 80.2 are not two measurements of the same thing. Each is an average over
whichever components that model has, and the sets differ — Kimi K3 has the BrowseComp
score and no OSWorld-Verified one; Fable 5.1 is the other way round.

The reconstruction above took each model's **vendor-reported best** on all four components
— several at "maximum thinking, tools enabled" — and subtracted a composite computed over
only *some* components, then read the difference as harness loss. Two different
normalizations and two different data sources. The −12.9 and −5.3 are artifacts of that
mismatch. **There was never a measured ~13 points to recover, and the asymmetry between the
open and closed model was an artifact of which components each one happens to be listed
for.**

This is the premise the harness work below was built on, so it is worth being blunt: the
work that followed was aimed at a gap that this arithmetic invented.

### What was tested anyway, and what it found

"Prompt overhead is where the harness loses" was the working hypothesis, and it was
measured independently of the premise above.

Three defects were found in golemide's prompt and loop, model-free, and fixed: the
language reference sent twice per attempt (42% of the prompt), a stale baseline
diagnostic sent under the header `CURRENT TEST OUTPUT` on every retry (5–7%), and a
latency guard cancelling an escalation the retry ladder had earned (4/4 collisions).

The effect on solve rate was measured twice, on two corpora:

| corpus | paired trials | before | after all fixes | sign test |
|---|---|---|---|---|
| Almide exercises, 2 attempts | 24 | 18/24 | 18/24 | p = 1.000 |
| Aider polyglot (rust + cpp), 3 attempts | 54 | 49/54 | 49/54 | p = 1.000 |

**Zero, both times.** Cost per attempt fell 41.5% on the Almide corpus and not at all on
the polyglot one — the deduplication has nothing to deduplicate where a project carries
no reference file, so even the cost win is corpus-specific.

So the second half of the claim is wrong as stated. Prompt bloat costs money and is worth
removing, but a token saved is not a problem solved, and these three defects were not
what the harness loses points to. The ~13-point reconstruction may still be real; what is
now known is that it is not made of prompt overhead. That matters more than the cost
figure, because it removes the explanation that was easiest to believe and cheapest to
act on — which is exactly the kind of claim this repo exists to stop anyone from
asserting without a measurement.

The raw data and the instruments are in golemide: `bench/constrained.sh`,
`bench/budget.almd`, `bench/results-constrained.tsv`, `bench/results-polyglot-*.tsv`.

## Five rules

**1. Measure, never judge.** Every signal measures either the source or the
generator. No signal is a model's opinion about whether a claim is grounded — a
model asked that question inherits the calibration problem the gate exists to fix.
This is the rule that constrains everything else, and it is why the core is
model-free.

**2. Orthogonal signals, not more signals.** A-group measures the world, B-group
measures the model, and they fail independently: a source can lack the figure while
the generator is perfectly stable, and vice versa. Conformal is fitted on the
**joint** score. Adding another signal from a family already present buys almost
nothing.

**3. Both ends, one mechanism.** The entrance asks whether a request can be turned
into acceptance criteria; the exit asks whether an answer is grounded. Both are
abstention, and both are measurements: the entrance samples *k* interpretations of
the request and abstains when they disagree. Nothing judges.

**4. Calibration comes from operation.** The human's accept/reject history *is* the
calibration set, and the same rows are the training data for a post-trained
abstention model. No separate labelling effort — a design that adds work is not
the ideal one.

**5. The seal is a type, not a policy.** `Grounded<T>` / `Deficient<T>`, with the
output path accepting only the former, so an ungrounded value cannot reach output
at compile time. Neither a person nor a model can write the bypass.

## Signals

**A-group — measures the source. No model.**

| signal | catches | status |
|---|---|---|
| figure | invented quantities | **shipped** |
| quote | words never said | **shipped** |
| entity | a source about someone else | **shipped** |
| date | an event dated to the wrong day | not built |

**B-group — measures the generator. Samples, never judges.**

| signal | why | status |
|---|---|---|
| logprob entropy **at the probe positions** | a confabulated figure has high entropy exactly at its digits. `probes.of` already knows where those are, and Workers AI returns per-token logprobs in the same response — so this costs no extra inference | not built |
| self-consistency (*k* samples) | measures the generator's own stability; must use the model that generated, or it measures agreement between two models instead | not built |
| paraphrase stability (*m* rewordings) | domain-independent, which is what makes it apply to prose | not built |

**C — the bound.** Conformal over the joint score, fitted on the operational
calibration set. Turns a hand-set threshold into "error rate ≤ α".

**D — the seal.** `Grounded<T>`.

## Order — corrected by measurement

The first version of this section ordered the work by cost: A-group first because it
needs no inference. That rationale was wrong, and the measurement is in
[README.md](./README.md#measured): **A-group alone has no usable operating point at
any threshold, in any of four scoring schemes.** Over 91 decided timeline entries the
best trade anywhere is 61.5% false refusal for 54.9% detection, and the point with
tolerable false refusal (22.0%) detects 1.2%. Quantity comparison, graded figures and
graded text together bought about six points of specificity. Cheapness does not matter
when the whole curve is unusable, and this is a ceiling rather than a backlog.

So B-group is not "next". It is **required**, for a reason the measurement makes
concrete: A-group asks whether the source contains the claim's evidence, and two
thirds of honestly-sourced claims fail that question because people restate figures
and paraphrase quotes. B-group asks a different question — whether the generator was
stable when it produced them — and that question does not care how the source is
worded.

1. **A-group** — shipped. Necessary but insufficient; it supplies the calibration
   rows and the retry hints, not the decision.
2. **Logprob entropy at the probe positions** — the first B-group signal, and free:
   `probes.of` already knows which tokens carry the evidence, and Workers AI returns
   per-token logprobs in the same response. This is now the critical path.
3. **Self-consistency and paraphrase stability** — the two that work on prose, which
   is where A-group is weakest.
4. **Conformal on the joint score** — the first point at which anything is
   *guaranteed*, and the only instrument that can say an entity miss is weaker
   evidence than a figure miss. The A-group work produced two decisions that cannot
   be made without it (whether entity probes are decisive; where the support
   threshold sits), which is the strongest argument for it there is.
5. **Entrance gate** — interpretation self-consistency.
6. **`Grounded<T>`** — seal it.
7. **Post-trained abstention** — only if 1–6 are insufficient.
   [Abstain-R1](https://arxiv.org/abs/2604.17073) reports calibrated abstention is
   learnable at 3B with a clarification-aware RLVR reward, so this is cheap if
   needed. Last because it is the only step that requires training.

## What the ideal does not reach

**Correlated error survives.** A generator that is confidently and consistently
wrong passes every B-group signal. Only an independent source catches it, which is
A-group — so neither family is optional.

**The bound is marginal, not conditional.** "At most α of accepted claims are
wrong" is not "this claim is 1−α likely to be right." Reading it the second way
turns a guarantee into overconfidence.

**A person remains the last resort.** This is specification, not shortfall. The
goal is to reduce how much a person must read, never to claim they need not. A
design that says otherwise has stopped being the ideal and started being a lie —
which is the failure mode this whole tool exists to make visible.
