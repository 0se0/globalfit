# bench — how well do small open-weight models parse job postings?

A small evaluation harness for GlobalFit's posting-parsing step (`app/api/parse-job`). It runs the
**production prompt** (read from the route file at run time, so the two cannot drift apart) on a few
open-weight models served locally with Ollama, and scores the output against answer lists for 30 real
postings.

This is a one-person experiment, not a benchmark suite. Read the limits below before quoting a number.

## Setup

- **Postings:** 30 developer postings (15 English, 15 Korean) from Greenhouse's public job-board API,
  collected on 2026-11-18 with `collect.mjs`.
- **Answer lists** (`labels.json`): required stacks, preferred stacks, "ambiguous" items that are
  neither rewarded nor penalised, years of experience, and submission method. Claude Code drafted them
  from the full posting text **before any model ran on this set**; I then reviewed the six judgment calls
  it flagged and changed three entries (`labels.before-user-review.json` is the version before that
  review). The rules used are in `labels.json` under `_rules`.
- **Models** (4-bit, via Ollama): `llama3.1:8b`, `gemma3:12b`, `llama3.2:3b`.
- **Metrics** (`score.mjs`, logic in `metrics.ts`): stack-extraction precision / recall / F1 (required and
  preferred pooled, names normalised by exact match against the keyword dictionary), F1 when the
  required-vs-preferred split must also be right, stacks that do not appear in the posting text,
  years-of-experience text that does not appear in the posting, schema failures, mean latency.
  A schema failure counts as "found nothing" rather than being dropped.

## Results

| Model | Stack F1 | Precision / Recall | F1 incl. required-vs-preferred | Stacks absent from the posting | Mean latency |
|---|---|---|---|---|---|
| Gemma 3 12B | 86.5% | 85.3% / 87.8% | 69.3% | 1 / 305 | 19.9 s |
| Llama 3.1 8B | 72.1% | 63.1% / 84.0% | 47.9% | 25 / 398 | 11.5 s |
| Llama 3.2 3B | 63.0% | 66.2% / 60.1% | 36.2% | 37 / 276 | 4.8 s |

Differences with a 95% interval from resampling the 30 postings 5,000 times (`compare.mjs`):

| Comparison | Stack F1 difference |
|---|---|
| Gemma 12B − Llama 8B | +14.5 points [+7.3, +22.0] |
| Gemma 12B − Llama 3B | +23.5 points [+12.2, +35.4] |
| Llama 8B − Llama 3B | +9.1 points [−2.3, +20.6] (cannot be told apart) |

Other findings:

- **Guessing how to apply.** None of the 30 postings states a submission method, yet the models answered
  with one for 27 (Gemma), 30 (Llama 8B) and 30 (Llama 3B) of them. Applying `lib/verify-submission-method.ts`
  to the saved outputs brings every case to `unclear` (`verify-eval.mjs`). Because every correct answer
  here is `unclear`, this does **not** show that the verifier keeps correct answers; its unit tests do that.
- **Copied prompt examples.** The production prompt contains example values (`"React"`, `"3년 이상"`,
  `"2-5 years"`). Llama 3B wrote `React` for 7 postings that never mention it and `3년 이상` for 7 (and
  `2-5 years` for 2); the larger models never did (`example-copies.mjs`). Removing the examples stopped
  the copying but lowered F1 (3B −12.5 [−24.8, −2.4], 8B −8.2 [−11.9, −4.3], Gemma −2.3 [−5.4, +0.4])
  because the models then listed concepts and skill phrases as stacks. I did not change the production
  prompt.

## Limits

- 30 postings, so the intervals are wide. Differences smaller than about 10 points are not reliable.
- The answer lists were drafted by an AI agent and reviewed by me only on the ambiguous cases, not entry
  by entry. Different labelling rules would shift the absolute numbers.
- **The model GlobalFit actually uses (Gemini) was not measured.** A `gemini` config exists but its free
  tier allows about 20 calls a day. Nothing here says how accurate the live service is.
- **Not reproducible from this repository alone.** Posting texts and raw model outputs are not published
  (the postings belong to the companies), and `collect.mjs` fetches whatever is listed today, so re-running
  it produces different postings that `labels.json` does not match. The scripts show the method; the
  numbers can only be re-derived with the original posting files.

## Running it

```bash
ollama pull llama3.1:8b && ollama pull gemma3:12b && ollama pull llama3.2:3b
node bench/collect.mjs                 # writes bench/jds/ (needs your own labels.json for new postings)
node bench/extract.mjs llama3.1-8b-q4 gemma3-12b-q4 llama3.2-3b-q4   # writes bench/out/<config>/
                                       # (always name the configs: with no arguments it also runs `gemini` and uses its free quota)
node bench/score.mjs                   # prints the metrics tables
node bench/compare.mjs gemma3-12b-q4 llama3.1-8b-q4   # difference with a 95% interval
node bench/example-copies.mjs llama3.2-3b-q4 llama3.2-3b-q4-noex
node bench/load.mjs llama3.1-8b-q4     # latency / throughput under 1, 2, 4, 8 concurrent requests
```

The scoring functions have unit tests in `test/bench-metrics.test.ts` (`npm test`).
