# WanderMap setup

Static HTML/CSS/JS plus Vercel functions in `api/`. No build step. See README.md for local preview and tests.

## 1. Supabase (once)
Supabase → SQL Editor → paste all of `supabase/schema.sql` → Run. It is safe to run again, and it upgrades the
old `trips` table (adds `share_id`, removes the `email` column).

It creates:
| Table / function | What it holds |
|---|---|
| `requests` | Every AI request and response: input, output, input/output tokens, model, latency, status (ok / refused / capped / error), hashed visitor id. No names, emails or health data. |
| `trips` | Saved itineraries, opened by a random share id (`/t/<id>`). |
| `cache` | Reddit summaries (3 days) and place photos (30 days), to stay inside free API limits. |
| `wandermap_stats()` | The live numbers on the page: trips planned, destinations, top destinations, % within budget, hidden gems found. |

All tables have Row Level Security on and no policies, so only the server (secret key) can read or write them.

## 2. Vercel environment variables
Settings → Environment Variables. Tick **Production and Preview**, then redeploy.

| Name | Required | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | yes | aistudio.google.com/apikey |
| `SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | yes | Supabase secret / service-role key. `SUPABASE_SECRET_KEY` also works. |
| `VISITOR_SALT` | yes | Any long random string. Used to hash visitor ids and IPs. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | optional | reddit.com/prefs/apps → create app (type "script"). Without them the Reddit tips section is hidden. |
| `REDDIT_USER_AGENT` | optional | e.g. `web:wandermap:v1.0 (by /u/yourname)`. Reddit asks every app to send one. |
| `UNSPLASH_ACCESS_KEY` | optional | unsplash.com/developers. Photo fallback for places without a Wikipedia photo. |
| `GEMINI_MODEL` | optional | Defaults to `gemini-3.5-flash-lite`. |

Keys live only in Vercel. To check the repo is clean, search it on GitHub for the first few characters of your Gemini and Supabase keys (expect no results).

Reddit note: Reddit's Data API is free for low-volume, non-commercial use, but Reddit can ask new apps to request
access first. If that takes too long, leave the variables unset and everything else still works.

## 3. Endpoints
| Endpoint | Gemini? | Cap per visitor per day | Max output tokens |
|---|---|---|---|
| `POST /api/extract` (personal recommendation cards) | yes | 8 | 2500 |
| `POST /api/plan` (day-by-day itinerary + budget check) | yes | 5 | 3000 |
| `GET /api/community?destination=` (Reddit tips) | yes, cached | 10 | 1200 |
| `POST /api/photos` (Wikipedia → Unsplash) | no | n/a (cached) | n/a |
| `GET /api/stats` (live numbers from Supabase) | no | n/a | n/a |
| `GET /api/trip?id=` and `/t/<id>` (shared trips with link previews) | no | n/a | n/a |

Caps are counted from the `requests` table over the last 24 hours, per hashed browser id. There's also a looser
limit of 60 requests per network, so classmates on the same Wi-Fi don't block each other. Capped visitors get a
friendly message, and their choices stay on the page.

## 4. Guardrail
Every Gemini call gets the system prompt in `lib/guard.js`. Gemini must refuse non-travel requests and fictional
places. It must also label prices as estimates, give no visa, legal or medical advice, never suggest experiences
that exploit animals, and never invent Reddit claims. Destinations that look like injection attempts are refused
before Gemini is called. Reddit tips that don't cite a real fetched post are dropped on the server.

## 5. Current limits
Recommendations, costs and times are AI estimates. They are not checked against live opening hours or transport data.
YouTube extraction needs a public video and can take 20–40 seconds; text input is faster.
