# Ver-IQ

Ver-IQ checks supplier quotation PDFs against a purchase request and company
rules. It returns:

- **Approve**
- **Reject**
- **Needs a person to check**

The app does not let an AI make the final decision. The AI extracts information;
deterministic code checks the rules.

## How verification works

The process always runs in this order:

```text
Read PDF
→ Extract information
→ Validate the extracted information
→ Compare with the purchase request
→ Check company rules
→ Check the calculations
→ Make the final decision
```

The app also shows live progress, supports cancellation, and keeps completed
results in the current browser.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful commands:

```bash
npm test          # Run automated tests
npm run build     # Check the production build
npm run eval      # Run the benchmark evaluator
npm run llm:check # Test the OpenRouter connection
```

## Model configuration

Create `.env.local` for local development:

```env
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
OPENROUTER_FALLBACK_MODELS=openai/gpt-oss-120b:free,nex-agi/nex-n2-pro:free
EXTRACTOR_MODE=both
```

`OPENROUTER_MODEL` is the primary model. It must contain one model ID only.
`OPENROUTER_FALLBACK_MODELS` is a comma-separated list. If the primary model
times out, is unavailable, rate-limited, blocked, or returns unusable output,
the app tries the fallback models before showing an error.

Extractor modes:

- `llm`: use OpenRouter only
- `heuristic`: use the local rule-based parser only
- `both`: use OpenRouter and cross-check it with the local parser

The API key is server-side only. Never put it in a `NEXT_PUBLIC_` variable or
commit it to Git.

## Deployment

### Simple deployment

Deploy the repository as one Next.js service on Vercel. Add the same server-side
environment variables shown above in Vercel.

### Recommended for slow free models

Use:

- **Vercel** for the frontend
- **Render** for the API and OpenRouter calls

On Render, set:

```env
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=your-primary-model
OPENROUTER_FALLBACK_MODELS=model-one,model-two
EXTRACTOR_MODE=both
OPENROUTER_TIMEOUT_MS=120000
APP_URL=https://your-render-service.onrender.com
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

On Vercel, set:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

Do not put `OPENROUTER_API_KEY` on Vercel. After changing environment
variables, redeploy the affected service.

## Evaluation

The Evaluation page checks saved verification results against typed reference
data. It does not call the model again or reprocess the PDFs. Results and
human reviews are stored in the browser's `localStorage`; there is currently no
database or shared server history.

## Important rule examples

- Advance above 20% → Reject
- Explicit “No advance payment required” → treated as 0% and passes
- No advance term mentioned → Needs a person; 0% is not assumed
- Missing late-delivery penalty → Reject
- Unclear extraction or calculation → Needs a person
- Any processing failure → Needs a person, never Approve

Thresholds are maintained in [`lib/rules/config.ts`](lib/rules/config.ts).
The written company instructions are in
[`data/company-rules.md`](data/company-rules.md). The purchase request used for
comparison is [`data/purchase-request.csv`](data/purchase-request.csv).

You can open these files directly from the project:

- [Company instructions and verification rules](data/company-rules.md)
- [Purchase request CSV](data/purchase-request.csv)

## Technical structure

- `app/` — user interface and API routes
- `lib/langgraph/graph.ts` — fixed verification workflow
- `lib/extraction/` — OpenRouter extraction, heuristic parsing, and validation
- `lib/rules/` — deterministic comparison, contract, financial, and decision rules
- `lib/evaluation/` — browser evaluation logic and reference data
- `data/` — purchase request, rules, and sample documents
- `tests/` — Vitest tests

## Project directory

```text
veriq/
├── app/
│   ├── api/
│   │   ├── ground-truth/
│   │   ├── samples/
│   │   └── verify/
│   ├── documents/[id]/
│   ├── evaluation/
│   └── page.tsx
├── components/
│   └── ui.tsx
├── data/
│   ├── samples/
│   ├── company-rules.md
│   └── purchase-request.csv
├── lib/
│   ├── evaluation/
│   ├── extraction/
│   ├── langgraph/
│   ├── pdf/
│   ├── pr/
│   ├── rules/
│   ├── client-store.ts
│   └── types.ts
├── scripts/
│   ├── eval.ts
│   └── llm-check.ts
├── tests/
├── .env.local
├── next.config.mjs
├── package.json
└── README.md
```

The main instruction file is
[`data/company-rules.md`](data/company-rules.md). It defines the business
thresholds and outcomes used by the deterministic rule engine. The purchase
request file is
[`data/purchase-request.csv`](data/purchase-request.csv), which supplies the
requested items, quantities, units, and maximum prices.

## Current limitations

- Free AI models can be slow or temporarily unavailable.
- PDF layouts and scanned/image-only PDFs may require additional extraction work.
- Results are local to the browser and are not shared between users or devices.
- Simplicity in UI/UX and lack of real life data may not be best final product for an official production deployment.
