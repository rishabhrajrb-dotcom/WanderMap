# WanderMap AI — Setup (30–45 min of clicking)

This is the real, working version. Three files:
- `index.html` — the site (talks to the two functions below; never sees any key)
- `api/extract.js` — calls Gemini to find real places from your notes
- `api/plan.js` — calls Gemini to build the itinerary, then saves it to Supabase

Follow your class handout's four sections. This file only adds the WanderMap-specific bits: the Supabase table and the three environment variables.

---

## 1. The three environment variables (Vercel → Project → Settings → Environment Variables)

Add all three, tick **all environments**, Save, then **Deployments → latest → Redeploy** (variables are read only at deploy time).

| Name | Value | From |
|---|---|---|
| `GEMINI_API_KEY` | your key (starts `AQ.`) | aistudio.google.com/apikey |
| `SUPABASE_URL` | Project URL | Supabase → Settings → API |
| `SUPABASE_SECRET_KEY` | the **secret** key (`sb_secret_…`, NOT the publishable one) | Supabase → Settings → API |

The functions use the Supabase **secret** key on the server only. That's fine and safe here — it lives in Vercel, the browser never receives it.

---

## 2. The Supabase table (Supabase → SQL Editor → paste → Run)

```sql
create table if not exists trips (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  email text,
  destination text,
  days int,
  party text,
  budget text,
  pace text,
  interests jsonb,
  notes text,
  trip jsonb
);

-- Row Level Security on, but we insert from the server with the secret key,
-- which bypasses RLS. No anon policy is needed because the browser never
-- writes directly. This keeps strangers from reading your leads.
alter table trips enable row level security;
```

To see what people plan: **Supabase → Table Editor → trips**. Each row = one built trip, with the email and the full itinerary in the `trip` column.

---

## 3. Local vs live

- On your laptop opening `index.html` directly will NOT work — the `/api/...` calls need Vercel. Test on the live `.vercel.app` URL.
- "Works on laptop, not live" or a 500 = usually a missing/misspelt env var, or you forgot to Redeploy after adding one.

---

## 4. Model note

Functions use `gemini-2.5-flash-lite` (free tier, fast). If you hit a `429 / quota exceeded`, wait a minute or change the `MODEL` constant at the top of both files to another flash-lite variant.

---

## YouTube link extraction (how it works)
When a user pastes a **public** YouTube link, `extract.js` sends the URL to Gemini as a
video part (`file_data.file_uri`). Gemini watches the video and returns the real places.
No download, no scraping on our side — Gemini does it.

Limits to know (free tier):
- Only **public** videos (not private/unlisted) — those return a 400.
- Free tier caps total YouTube processing at ~8 hours/day; over that you get a 429.
- Video takes ~20–40s vs instant for text — the UI already tells the user this.
- Very long videos cost more tokens; travel Reels/Shorts and normal guides are fine.

## Known limits (be honest with trial users)
- Map pins are illustrative positions, not real geocoded coordinates yet.
- Real routing + geocoding is the next build.
