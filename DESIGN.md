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

## The benchmark target

The agentic composite that the general-purpose coding agents are ranked on
(Terminal-Bench 2.0 30% · BrowseComp 25% · OSWorld-Verified 25% · OSWorld 2.0 10%),
as reported by [BenchLM, September 2026](https://benchlm.ai/agentic):

| | score | weights |
|---|---|---|
| Claude Fable 5.1 | 80.2 | closed |
| Claude Opus 5 | 78.1 | closed |
| Kimi K3 | 71.9 | open |
| GLM-5.3 | 68.4 | open |
| GLM-5.3-Flash | 60.1 | open |

**On a benchmark, abstention scores zero.** A gate that refuses an answer gets no
credit for being right about refusing. So the gate's value here is not abstention
at all — it is this:

> **A refusal that names what gave way is a retry signal. On a task with no
> verifier, it is the only one there is.**

On Terminal-Bench a compiler supplies that signal, which is why open weights are
already close there — GLM-5.3-Flash scores 84.3 on Terminal-Bench 2.1
([leaderboard](https://codingfleet.com/blog/terminal-bench-leaderboard-2026/)),
above the composite target. OSWorld validates by execution, so it has one too.

**BrowseComp has none.** An answer is prose with sources, and nothing tells the
agent it is wrong. That 25% is where the composite is lost, and it is exactly the
shape emet takes as input.

So the leverage is concentrated, and the claim this design makes is narrow enough
to be falsified: *supplying a verifier to the one unverified component is worth
more than improving the model.* Fugu is the existing evidence that a composition
can beat its parts — Fugu Ultra reaches 82.1 on Terminal-Bench 2.1 with a pool
whose best member is 78.2 ([technical report](https://arxiv.org/html/2606.21228v1)).

**Not reached, and the measurement says why.** The gate's own detector curve has no
usable operating point (see [README.md](./README.md#measured)), so it cannot yet
serve as the retry signal that argument depends on. Two things are outstanding and
they are different in kind:

- *Blocked here:* the end-to-end experiment — BrowseComp with and without the gate in
  a retry loop, same model, same budget — needs a model under test. No API credentials
  are available in this environment.
- *Open regardless:* per-component scores for GLM-5.3 are not published, so the
  arithmetic from 68.4 to above 80.2 cannot be completed from public numbers even
  with the loop built.

What *was* measurable without a model is the half the loop rests on: whether the gate
detects wrong answers without refusing right ones. It does not, yet. That is the
finding, and it is why step 2 below changed.

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
