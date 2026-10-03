-- WanderMap · Supabase schema. Paste into Supabase -> SQL Editor -> Run. Safe to re-run.
-- Every table has Row Level Security ON and NO policies: only the Vercel functions (secret key) can
-- read or write. The browser never talks to Supabase directly.

-- 1) Every AI request and response (assignment Task 4 audit table). No names, emails or health data.
create table if not exists requests (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  endpoint      text not null,             -- extract | plan | community
  status        text not null,             -- ok | refused | capped | error
  visitor       text,                      -- salted hash of a random browser id
  ip_hash       text,                      -- salted hash of the IP, for the looser per-network cap
  destination   text,
  input         jsonb,                     -- the request (free text has emails/phones redacted)
  output        jsonb,                     -- the model's validated answer, or the error shown
  input_tokens  int,
  output_tokens int,
  model         text,
  latency_ms    int,
  within_budget boolean,                   -- plan only: every day under the traveller's daily budget
  hidden_gems   int,                       -- how many hidden-gem places were suggested or planned
  share_id      text
);
create index if not exists requests_visitor_idx on requests (visitor, endpoint, created_at desc);
create index if not exists requests_ip_idx on requests (ip_hash, created_at desc);
create index if not exists requests_endpoint_idx on requests (endpoint, status, created_at desc);
alter table requests enable row level security;

-- 2) Shareable trips. Keeps the original columns; email is removed (the assignment forbids storing it).
create table if not exists trips (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  destination text, days int, party text, budget text, pace text, interests jsonb, notes text, trip jsonb
);
alter table trips add column if not exists share_id text;
create unique index if not exists trips_share_id_idx on trips (share_id);
alter table trips drop column if exists email;
alter table trips enable row level security;

-- 3) Cache for Reddit summaries and place photos (keeps us inside free API limits).
create table if not exists cache (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table cache enable row level security;

-- 4) The live numbers shown on the page (GET /api/stats). One round trip, computed from `requests`.
create or replace function wandermap_stats() returns json
language sql stable security definer set search_path = public as $$
  with ok_plans as (select * from requests where endpoint = 'plan' and status = 'ok')
  select json_build_object(
    'trips_planned',     (select count(*) from ok_plans),
    'trips_this_week',   (select count(*) from ok_plans where created_at > now() - interval '7 days'),
    'destinations',      (select count(distinct lower(trim(destination))) from ok_plans),
    'top_destinations',  (select coalesce(json_agg(t), '[]'::json) from (
                            select initcap(lower(trim(destination))) as name, count(*) as trips
                            from ok_plans where created_at > now() - interval '30 days'
                            group by 1 order by 2 desc limit 5) t),
    'within_budget_pct', (select round(100.0 * count(*) filter (where within_budget) / nullif(count(within_budget), 0))
                            from ok_plans),
    'hidden_gems_found', (select coalesce(sum(hidden_gems), 0) from requests where endpoint = 'extract' and status = 'ok'),
    'avg_input_tokens',  (select round(avg(input_tokens)) from requests where status = 'ok'),
    'avg_output_tokens', (select round(avg(output_tokens)) from requests where status = 'ok'),
    'refusals',          (select count(*) from requests where status = 'refused')
  );
$$;
revoke all on function wandermap_stats() from public, anon, authenticated;
grant execute on function wandermap_stats() to service_role;
