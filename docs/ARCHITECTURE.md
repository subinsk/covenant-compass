# Architecture

Covenant Compass has two parts that share one repository:

- an **extraction pipeline** (`lib/edgar`, `lib/agreements`, `lib/extraction`, `lib/llm`, `lib/eval`) that turns a credit agreement on SEC EDGAR into financial covenants with checked citations. It runs from the command line through the scripts in `scripts/`.
- a **monitoring web app** (`app/`, `components/`, `lib/services`, `lib/auth`, `prisma/`) where lenders manage facilities, covenants and their reporting obligations, and borrowers see what they owe.

The pipeline does not write to the database yet; the two parts meet only through shared types and conventions.

## Modules

### `lib/edgar`

- `client.ts`: `edgarFetch` and `edgarJson` for SEC endpoints. Sends the required `SEC_USER_AGENT`, keeps at least 110 ms between requests, retries 429 and 5xx responses up to three attempts with exponential backoff, and caches responses on disk (`.cache/edgar`, keyed by a SHA-256 of the URL). Also `getSubmissions`, `getCompanyFacts` and URL helpers for filing folders and documents.
- `exhibits.ts`: `findExhibits` walks a company's recent 8-K, 10-K and 10-Q filings and returns the documents whose file names look like EX-10 exhibits (material contracts, where credit agreements are filed).

### `lib/agreements`

All functions here are deterministic and work on one string: the agreement text. Every result is a `{ start, end }` range in that string.

- `text.ts`: `htmlToPages` converts exhibit HTML to text with one line per paragraph, table row or list item. It drops scripts and styles, struck-through text (deletions in conformed amendment copies), and page-number lines at the top or bottom of a page, decodes HTML entities (including Windows-1252 numeric references from older filings), and returns `pageStarts`, the offset where each physical page begins. `pageAt` maps an offset to its page.
- `sections.ts`: `findSections` classifies article and section headings into definitions, financial covenants, negative covenants and other, skipping table-of-contents entries, with an inline fallback for text without line breaks. `findDefinitions` finds each `"Term" means ...` definition. `relevantText` assembles the extraction prompt: the financial covenant sections, then the definitions they need.
- `graph.ts`: `buildDefinitionGraph` records, for each definition, which other defined terms it mentions (whole-word, case-sensitive, longest term first, plural allowed), ordered by mention count. Also `dependencies` (breadth-first with depth), `findCycles` (circular definitions) and `formulaTree` (nested view for debugging).
- `clauses.ts`: `splitSentences` and `splitClauses` split text into sentences and enumerated clauses (`(a)`, `(ii)`, `(A)`, `(1)`), handling legal abbreviations and section numbering. `cite` turns any range into a citation with its page, enclosing sentence and excerpt.

### `lib/llm`

- `client.ts`: `chat` posts to `${LLM_BASE_URL}/chat/completions` with `LLM_MODEL` and `LLM_API_KEY`, optionally in JSON mode and with `reasoning_effort`. With `LLM_CACHE=1` it caches replies on disk (`.cache/llm`, keyed by a hash of the endpoint, model, messages and options).
- `structured.ts`: `chatJson` asks for JSON, strips Markdown code fences, parses and validates with a zod schema. On failure it sends the bad reply and the validation error back and asks for corrected JSON, up to two retries.

### `lib/extraction`

- `schema.ts`: the zod schema for an extracted covenant: name, metric (leverage, secured leverage, net leverage, interest coverage, fixed charge coverage, other), operator, limit, test frequency, step-downs, numerator, denominator and the verbatim quote. `null` for an optional field is treated as absent.
- `extract.ts`: `extractCovenants` builds the prompt from `relevantText` within a character budget (60,000 by default), calls `chatJson` at temperature 0, then runs `locateQuote` on each covenant's quote against the full agreement text. Each result carries `citation` (offsets or `null`), `verified`, and `limitInQuote` (whether the extracted limit appears as a number in the quote).

### `lib/eval`

- `companies.ts`: loads `data/eval/companies.json`, validates it with zod and exports `evalCompanies`, plus `isCompliant(covenant, value)` for the operator check.

### `lib/auth`

- `jwt.ts`: HS256 tokens with `jose`, 24-hour expiry. Production refuses to sign or verify without `JWT_SECRET`.
- `password.ts`: bcrypt hashing and verification.
- `session.ts`: `getSession` reads the `token` cookie in server components.
- `cron.ts`: `isAuthorizedCron` compares the `Authorization` header with `Bearer ${CRON_SECRET}` in constant time and fails closed when no secret is set.

### `lib/services` and `lib/portal`

- `schedule-engine.ts`: `generateScheduleForCovenant` creates the dated occurrences (obligations) for a covenant from its frequency and the facility's dates. Called when a covenant is created.
- `rag-engine.ts`: `updateComplianceStatuses` marks pending occurrences past due as overdue and red, turns green ones due within seven days amber, and creates notifications for the facility's creator.
- `portal/compliance.ts`: `complianceScore`, the share of decided obligations that were completed.

### `app/` and `middleware.ts`

`middleware.ts` requires a valid session cookie everywhere except `/login`, `/api/auth/*` and `/api/system/cron`; API routes get a 401 and pages redirect to `/login`.

| Route | Purpose |
| --- | --- |
| `/` | Lender dashboard: active facilities and upcoming and overdue obligations. |
| `/facilities`, `/facilities/[id]` | Facility list and detail with covenants and occurrences. |
| `/calendar` | Obligations by due date. |
| `/reports` | Obligation listing for reporting. |
| `/portal` | Borrower portal (borrower users only): their obligations and compliance score. |
| `/login` | Sign-in. |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Session handling. |
| `GET, POST /api/facilities` | List facilities for the user's organization (lender or borrower side), create one. |
| `GET, POST /api/facilities/[facilityId]/covenants` | List covenants; lenders create one, which generates its schedule. |
| `GET /api/facilities/[facilityId]/occurrences` | A facility's occurrences. |
| `GET /api/organizations` | Organizations, optionally filtered by type. |
| `POST /api/ai/parse-covenant` | Suggests covenant fields from pasted text using keyword rules. |
| `GET /api/system/cron` | Daily status job (`updateComplianceStatuses`), authorized by `CRON_SECRET`. |

## Data model

From `prisma/schema.prisma` (PostgreSQL, UUID primary keys):

- **Organization**: a lender or borrower (`OrgType`).
- **User**: belongs to one organization, with role `LENDER_ADMIN`, `LENDER_USER` or `BORROWER_USER`.
- **Facility**: a loan between a lender and a borrower organization: reference, currency, commitment, start and end dates, status (`ACTIVE`, `MATURED`, `DEFAULTED`), created and updated by users.
- **Covenant**: a term of a facility: type (`FINANCIAL`, `REPORTING`, `GENERAL`, `ESG`), frequency, due rule, grace days, owner role, importance, and for financial covenants a metric formula and threshold condition as text.
- **CovenantOccurrence**: one dated obligation of a covenant: period, due date, status (`PENDING`, `COMPLETED`, `OVERDUE`, `WAIVED`), RAG status, owner and notes.
- **Document**: an uploaded file for a facility, optionally tied to an occurrence.
- **FinancialMetric**: a named value for a facility over a period.
- **Notification**: an in-app or email message to a user about an occurrence.
- **AuditLog**: who did what to which entity, with JSON details.

Extracted covenants and citations are not stored in the schema yet.

## Design decisions

**Character offsets are the citation unit.** Every step after the HTML conversion returns `{ start, end }` ranges into the same text, and `pageStarts` maps any offset to a page. A citation is therefore exact, checkable and cheap to store, and sentence and clause boundaries can be layered on later without changing what was stored. This works only because `htmlToPages` is deterministic: the same HTML always yields the same text.

**Quotes are verified against the source, not trusted.** The model is asked for a verbatim quote, and `locateQuote` searches for it in the agreement: exactly first, then ignoring whitespace runs, curly versus straight quotes and dash variants (differences that come from text handling, not from wording). A quote that isn't found is returned with `verified: false` instead of being dropped or accepted. `limitInQuote` separately checks that the number the model extracted is in the sentence it cited.

**The prompt is built from structure, not the whole agreement.** Credit agreements often run past 500,000 characters. `relevantText` sends the financial covenant sections and then the definitions they depend on, ordered so that trimming to the budget drops the least-mentioned definitions first.

**Definitions are followed four levels deep, skipping boilerplate terms.** A ratio's meaning is spread across definitions ("Leverage Ratio" refers to "Consolidated EBITDA", which refers to "Consolidated Net Income", and so on), so one level is not enough. Terms such as "Borrower", "Lender", "Loan Documents", "GAAP" and "Subsidiary" (`HUB_TERMS`) are mentioned by nearly every definition; following them pulls in most of the agreement without helping compute a ratio, so they are removed from the graph before traversal.

**Deterministic code wherever possible; the LLM does only the reading.** Text conversion, section finding, definitions, the graph and quote location are plain functions with unit tests. The LLM is used for the step that needs judgment (which sentences are maintenance covenants, and what limit and operator they state), and its output is validated with zod and retried on failure.

**One OpenAI-compatible client, so the model is swappable.** `lib/llm/client.ts` uses only the chat completions API through `fetch`, configured by `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. A local Ollama model and a hosted Groq model run with the same code; switching is a change of environment variables. There is no SDK dependency.

**Disk caches for EDGAR and the LLM.** Filing documents never change, so EDGAR responses are cached indefinitely; submissions and company facts are refetched after a day. LLM replies are cached only when `LLM_CACHE=1`, which makes development runs repeatable and avoids paying for the same prompt twice. Both caches live under `.cache/`.

**Respect the SEC rate limit.** SEC allows at most 10 requests per second and requires a User-Agent with a contact email. The client enforces a minimum interval of 110 ms between requests, refuses to run without `SEC_USER_AGENT`, and backs off on 429 and 5xx responses.

**Ground truth comes from companies' own disclosures.** The eval set uses covenant limits and actual ratios that companies reported in their 10-Q filings, so the pipeline can be checked against figures that are independent of it, including a disclosed breach.
