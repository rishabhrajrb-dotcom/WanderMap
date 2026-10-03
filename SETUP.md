# WanderMap setup

The app uses static HTML/CSS/JS and two Vercel server functions. See README.md for local preview and testing.

## Vercel environment
Set GEMINI_API_KEY for generation. GEMINI_MODEL is optional (default: gemini-3.5-flash-lite).
For server-side trip storage, set SUPABASE_URL and SUPABASE_SECRET_KEY.
Keep secret keys server-side, never in browser files. Redeploy after changing environment settings.

No build command or frontend framework is required. Publish the repository root with api functions.
The local fixture preview is only available through scripts/dev.js --demo and does not run on Vercel.

## Supabase table
Existing installations do not need a schema migration for this feature.
For a new installation, create the table and keep RLS enabled:

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
alter table trips enable row level security;
```

The server writes using its secret key. Do not add public read policies to expose saved trips.
Intensity and per-day settings are stored inside trip.preferences; pace also stores the overall intensity.
The UI does not collect email or promise delivery. Saving does not send email.

## Current scope
Recommendations and time estimates are AI drafts, not checked against live place or transport data.
YouTube extraction sends a public video URL to Gemini. Provider availability and quotas apply; text remains an alternative.
No Reddit/X data is fetched in this release.
The decorative map has been removed until real coordinates and an interactive map are implemented.

## Before production
Test the actual Gemini model and Supabase connection on a preview deployment.
Add per-user/IP limits and monitoring before broad public traffic. Quota errors preserve the user's choices on the open page.
