# Project

GlobalFit is an application-process assistant for job seekers: it matches a job posting against a
resume, explains how to submit, and suggests tailored rewrites of the documents. It is used by its
developer, and it is a two-week MVP, not a production service.

This file is the rule set the AI coding agent (Claude Code) reads at the start of every session.
Rules are numbered because code comments refer to them (for example "hard rule 4" or "암묵지 4번"
both mean rule 4 below). Each rule names **what enforces it**, so you can tell a rule that code
guarantees from a rule that only a prompt asks for. Enforcement labels:

- **code**: behavior fixed in code, no model judgment involved
- **schema**: output shape constrained by a JSON schema
- **test**: checked by an automated test (`npm test`)
- **prompt**: asked of the LLM in a prompt; the model decides whether to comply

# Commands

Dev `npm run dev` · Test `npm test` · Typecheck `npm run typecheck`

# Stack (fixed, do not change without being asked)

Next.js + TypeScript + LangChain.js + LangGraph.js

- No separate backend server and no persistent database. Do not add Prisma, SQLite or any other DB
  dependency, with no exceptions. This is a decided rule, not a question to ask.
- The keyword dictionary is a small in-memory embedding index built from a static list. It is never
  persisted.
- LLM providers: free-tier models only (for example Google Gemini's free tier). Never use a provider
  that needs a payment method or paid credits.
- **Free-only rule for the whole project**, not just the LLM: hosting, npm packages and external
  APIs must not require a payment method or paid credits. Free open-source packages that run inside
  the project's own code (for example a headless browser inside a serverless function) are fine; the
  test is "works with code alone, no API key or payment needed". Adding a new package still requires
  asking first, and paid options are excluded from the candidates before asking.
- LangGraph manages the state and branching of the judgment-point agent (three tools, at most five
  iterations). The embedding-based dictionary exists because a static keyword list cannot be
  maintained. LangChain is an engineering choice to reduce duplicated LLM-call code, not a
  necessity.

# Working rules

- Ask before adding any package that is not listed in the stack above. The core stack items are
  fixed and are not questions.
- One commit per feature.
- No `any`.
- Comments say **why** only. Do not comment what the code already shows. Forbidden: "// compute the
  score". Allowed: "// required skills weigh 3x because they directly affect eligibility".

# Rules 1-9

1. **No adjective feedback.** Never write "overall this looks great". Compare only by match
   percentage (0-100%) and technology names.
   *Enforced by:* design (the UI renders scores and stack names only).

2. **Do not translate English postings.** Keep stack names and proper nouns as written. Unify
   synonyms only, using the global tech keyword dictionary. A stack name not in the dictionary stays
   as written and is marked "unregistered"; never guess a mapping.
   *Enforced by:* code (exact match, then embedding similarity at a 0.8 threshold; below it, the
   name stays unregistered) and prompt (do not translate). *Test:* the e2e test asserts that gap
   stacks contain no Hangul.

3. **Constrained output, one retry, visible failure.** LLM output must follow a fixed JSON schema.
   On a parse failure, retry once; if it fails again, show an error card with a retry button and
   send a failure log (first 100 characters of the input, the error message, a timestamp) to a
   Discord webhook.
   *Enforced by:* schema (`responseSchema`), code (`retryOnce`, `reportFailure`, `ErrorCard`). The
   webhook only fires when `DISCORD_WEBHOOK_URL` is set.
   *Known gap:* six of the seven LLM-calling routes use retry and alert; `parse-resume` does not.

4. **The match score is never computed by an LLM.** Matching is plain code, including inside any
   LangGraph node. The original, improved and potential scores all reuse the same function.
   *Enforced by:* code (`lib/calculate-match.ts` is a pure function with no model call).
   *Test:* unit tests for scoring and deductions, plus property-based tests on random inputs (score
   bounds, determinism, monotonicity in the applicant's skills, order and case invariance, deduction
   accounting).

5. **The judgment-point agent has three tools and a hard cap.** Tools: `lookup_keyword`,
   `check_ambiguous_requirement`, `flag_low_confidence`. The model chooses which to call and in what
   order, but iterations are capped at five. Score calculation is never a tool. Implemented with a
   LangGraph StateGraph and conditional edges.
   *Enforced by:* code (`MAX_ITERATIONS = 5`, fixed tool list) and test (a mocked model that always
   asks for another tool call is cut off at five iterations). A code-level gate
   (`shouldRunJudgeAgent`) skips the agent entirely when a posting shows no ambiguity signals.

6. **The keyword dictionary is an embedding similarity search**, not a hard-coded mapping, so new
   stack names can be handled. The index is rebuilt from a static list and never persisted (it is
   cached only for the life of a warm server instance).
   *Enforced by:* code (`lib/canonicalize-stacks.ts`).

7. **`submission_method` and `required_documents` come only from what the posting states.** If the
   posting does not say, `submission_method` is `"unclear"`, and nothing is guessed.
   *Enforced by:* schema (the field is an enum that includes `unclear`), prompt ("never guess") and
   code (`lib/verify-submission-method.ts` checks the model's answer against the posting text and
   lowers it to `unclear` unless a sentence ties that method to an act of applying; it never raises
   `unclear` to a method). *Test:* unit tests, including sentences from real postings that look like
   application instructions but are not (inquiry emails, document-return requests, accessibility
   notes).
   *Known gaps:* the checker matches English and Korean phrasing, so unusual wording is read as
   `unclear` (the safe direction). `required_documents` is still prompt-only. The e2e test mocks the
   LLM, so it checks the pipeline, not the model's behavior.

8. **Document rewrites may reword and reorder, never add facts.**
   - Allowed: reordering sentences or paragraphs, replacing wording with the same meaning, shifting
     emphasis, restating an existing number or fact in a different form (for example "joined a team
     project" to "backend developer on a five-person team").
   - Forbidden: adding any new fact, number, experience, project name or technology that is not in
     the original.
   - A skill the posting wants but the original lacks goes **only** into a separate "improvement
     suggestions" section, always with the note that the user decides whether they have it.
   *Enforced by:* prompt (the model must confirm a skill appears literally in the original before
   treating it as present) and code (after generation, `lib/detect-leaked-stacks.ts` scans the
   rewritten resume, cover letter, portfolio and suggested edits for unconfirmed skills and shows a
   warning; it never edits the text). *Test:* unit tests for the check, and the e2e test searches
   mocked output for leaked items.
   *Known gaps:* whether a skill is "confirmed in the original" is decided by the LLM. The check is
   a plain string match, so it can miss a paraphrase and can flag a short name by accident.

9. **Company analysis uses only the sources the user supplied, and it comes before matching.**
   - Every fact in the report must come from the page text fetched from the URLs the user gave. If
     the sources do not say something (for example a typical day, how the role changes over 3-5-7
     years, how non-routine issues are handled), the field is left empty and the UI shows "not
     available in the provided materials". Nothing is invented to fill it.
   - Matching is blocked until the analysis has run. There is no path that scores from only the
     posting and the resume.
   - The required stacks found in the company's recent postings (`job_strategy.aggregated_stacks`)
     are merged into the target posting's `preferred_stacks` (deduplicated by canonical name) before
     scoring. `required_stacks` is never changed, and scoring itself stays pure code (rule 4).
   *Enforced by:* prompt ("base every fact only on the source materials", empty string when absent),
   code (the empty-field display, the disabled "show match result" button until a report exists,
   `mergeCompanyStacksIntoPreferred`). *Test:* unit tests for the merge, including that
   `required_stacks` is untouched. The hard gate has no automated test.
   *Known gaps:* nothing in code checks that a stated fact really appears in the sources; that is
   the model's judgment. The report is only as good as the pages the user supplies.

# Definition of done

Work is done only when every item below passes automatically under `npm test -- e2e`. A run is
judged by the test result (pass or fail) and the console output, not by manual inspection.

Note: the implementation is split across several routes (`parse-job`, `parse-applicant`,
`suggest-resume` and others) plus a client-side recomputation of `calculateMatch`. So "the API
response" in the criteria below means the combined result built by `runAnalysisPipeline` in
`test/e2e.test.ts`, which calls the routes in the same order as `app/page.tsx`. Do not create a new
combined API.

**The e2e tests mock the LLM.** They verify orchestration, scoring, error handling and the shape of
results. They do not measure the model's real output quality or real response time.

- The English posting (`test/fixtures/yc-job.txt`) with the Korean resume
  (`test/fixtures/resume-ko.txt`) runs through the pipeline and passes.
- A posting with no stated way to apply (`test/fixtures/job-no-submission-method.txt`) returns
  exactly `"unclear"` for `submission_method` (with the mocked model).
- The measured processing time printed by `console.time`/`console.timeEnd` is under 10,000 ms. This
  is the time of the orchestration logic with a mocked LLM, not a guarantee of real model latency.
- `gap_stacks` contains original stack names (for example "Node.js") with no Hangul.
- The result contains `submission_method`, `required_documents`, `original_score`, `improved_score`
  and `potential_score`.
- Items that appear only in the improvement suggestions do not appear anywhere in the generated
  resume, cover letter or portfolio text (a string search on mocked output).

# Do not

- Refactor what was not requested: no structural changes, renames or style cleanups to files or
  functions outside the current instruction. Do these only when explicitly asked.
- Make tests pass by skipping them.
- Add login, sign-up, payments or OCR (reading text from scanned images). Fetching a posting's text
  from a URL, or extracting the text layer of PDF, Word or HWP files, is not a crawler or OCR and is
  allowed.
- Add automatic application, automatic email sending, or automatic login or submission on a company
  site. The product explains how to submit; the user always does the actual submitting.
- Store result history in a database or show a list of past results. A server database is still
  forbidden. Keeping only the latest input and result in the browser's localStorage (client-side,
  not a server database) is allowed so that a refresh does not lose it.
- Fill experience that the posting wants but the source documents lack into the document body. It
  goes only into the improvement suggestions.
- Add dark mode or an admin page.
- Support more than two languages (Korean and English only).
- Compare several postings side by side (one posting against one resume set). One exception, the
  company-analysis feature, is allowed: given a company name, it provides in-depth company context
  (company info, business analysis, role understanding, environment analysis, hiring strategy and
  roadmap) from the source pages the user supplies. It is informational context about one company,
  not a comparison of postings.
  - **Decision of 2026-08-29:** the "recently posted required stacks" from the analysis
    (`job_strategy.aggregated_stacks`) are merged into the target posting's `preferred_stacks`
    (deduplicated by canonical name) before `calculateMatch`. `required_stacks` is never touched.
    The scoring function (rule 4) is still pure code and all three scores still reuse it; what
    changed from the earlier decision is that its input now includes the company analysis.
  - **Hard gate:** matching results are not available until the company analysis is done. The
    "show match result" button stays disabled until a company name is entered and the analysis has
    run. There is no path that scores from only the posting and resume.
- Any free-form agent loop other than the judgment-point agent. Its tools are fixed to
  `lookup_keyword`, `check_ambiguous_requirement` and `flag_low_confidence`, with iterations capped
  at five.
