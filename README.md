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
Deploy the root to Vercel as a static project with the api directory. No build step.
Use GEMINI_API_KEY and optionally SUPABASE_URL and SUPABASE_SECRET_KEY on the server.
Existing trips schema remains compatible: trip JSON contains preferences and included choices.
The secret key stays server-side. RLS must remain enabled on trips; no new policies are required for this change.
Saving is best-effort; no email is sent, and this version does not provide account-based reopening.
Production quota management, durable rate limiting, and live-provider smoke tests remain follow-up work.

## Next increments
1. Real interactive map, verified place identities and coordinates.
2. Opening hours, route data and comfortable timing checks.
3. Trip editing/reopening and per-day rearrangement.
4. Locals' perspectives from permitted Reddit/X sources: links, timestamps, provenance and balanced summaries.
   Social opinions must be distinguishable from curated recommendations, never labelled as verified facts.
