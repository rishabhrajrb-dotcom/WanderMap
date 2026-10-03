# WanderMap
A lightweight travel planner: vanilla HTML/CSS/JS, Vercel API functions, Gemini, and optional Supabase trip storage.

## First feature: traveller-led curation
- Descriptive interests collected before recommendations.
- Destination-specific place suggestions with an experience, personal fit, trade-off, and estimated duration.
- Suggested "Not to miss" filter; every recommendation remains optional.
- Must-see / optional / skip controls and user-added places.
- Low / Medium / High intensity with per-day overrides, start time and walking tolerance.
- Server validation prevents omitted must-sees, unknown stops, duplicate visits and invalid ordering.
- Optional omissions appear as alternatives. Changes mark an existing draft as stale.
- AI descriptions and commute estimates explicitly remain unverified. No social endorsements are fabricated.

## Run locally
Requires Node 22 or newer; no package install is needed.

```sh
npm test
npm run dev -- --demo
```

Demo mode uses clearly labelled Lisbon fixtures, makes no external requests, and disables database writes.
For real generation, set GEMINI_API_KEY in your shell and run npm run dev without --demo.
Never commit secrets. GEMINI_MODEL optionally overrides the default gemini-3.5-flash-lite.

## Hosting and storage
Deploy the repository root to Vercel. There's no build step; `api/` holds the server functions.
Setup (Supabase SQL, environment variables, caps, guardrail): see **SETUP.md**.
Product spec, personalisation questions, roadmap and how this maps to the GenAI assignment: see **docs/PRODUCT.md**.

## API
- `POST /api/extract`: personal recommendation cards (Gemini)
- `POST /api/plan`: day-by-day plan, signature moment per day, budget check, share link (Gemini)
- `GET /api/community?destination=`: Reddit traveller tips with links (Reddit Data API + Gemini, cached)
- `POST /api/photos`: a photo per place (Wikipedia, then Unsplash, cached)
- `GET /api/stats`: live usage numbers from Supabase
- `GET /api/trip?id=`, `/t/<id>`: shared trips with link previews

Every Gemini exchange is stored in Supabase (`requests`) with token counts, and is capped per visitor per day.
