// Thin Supabase REST helpers (server only). The secret key never reaches the browser.
import {createHash} from 'node:crypto';
import {RequestError} from './planning.js';

const config = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? {url: url.replace(/\/$/, ''), key} : null;
};
export const hasStore = () => !!config();
const headers = (key, extra = {}) => ({'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra});

async function call(path, init = {}) {
  const c = config();
  if (!c) return null;
  return fetch(`${c.url}/rest/v1/${path}`, {...init, headers: headers(c.key, init.headers), signal: AbortSignal.timeout(6000)});
}

export async function insert(table, row, {returning = false} = {}) {
  try {
    const r = await call(table, {method: 'POST', body: JSON.stringify(row), headers: {Prefer: returning ? 'return=representation' : 'return=minimal'}});
    if (!r?.ok) return null;
    return returning ? (await r.json())[0] : true;
  } catch { return null; }
}

export async function rpc(fn, args = {}) {
  try {
    const r = await call(`rpc/${fn}`, {method: 'POST', body: JSON.stringify(args)});
    return r?.ok ? r.json() : null;
  } catch { return null; }
}

export async function selectOne(table, query) {
  try {
    const r = await call(`${table}?${query}&limit=1`, {method: 'GET'});
    return r?.ok ? (await r.json())[0] ?? null : null;
  } catch { return null; }
}

// ---- Visitors and caps ----
// The page sends a random id it keeps in localStorage. We store only salted hashes of it and of the IP.
const salt = () => process.env.VISITOR_SALT || 'wandermap-dev-salt';
const hash = v => createHash('sha256').update(salt() + '|' + v).digest('hex').slice(0, 24);
export function visitorOf(req) {
  const h = req.headers || {};
  const get = k => typeof h.get === 'function' ? h.get(k) : h[k];
  const id = String(get('x-visitor-id') || '').slice(0, 64);
  const ip = String(get('x-forwarded-for') || get('x-real-ip') || 'local').split(',')[0].trim();
  return {visitor: hash(id || 'ip:' + ip), ipHash: hash('ip:' + ip)};
}

// Per-visitor and per-IP request caps, counted from the requests table over the last 24 hours.
// The IP cap is looser so classmates on the same campus Wi-Fi don't block each other.
export const CAPS = {extract: 8, plan: 5, community: 10, ipDaily: 60};
async function count(filter) {
  const since = new Date(Date.now() - 864e5).toISOString();
  const r = await call(`requests?select=id&${filter}&status=in.(ok,refused)&created_at=gte.${since}`,
    {method: 'HEAD', headers: {Prefer: 'count=exact', Range: '0-0'}});
  if (!r?.ok) return 0; // if the count fails we let the visitor through rather than break the page
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}
export async function enforceCap(endpoint, {visitor, ipHash}) {
  if (!hasStore()) return {used: 0, limit: CAPS[endpoint]};
  const [used, ipUsed] = await Promise.all([
    count(`visitor=eq.${visitor}&endpoint=eq.${endpoint}`),
    count(`ip_hash=eq.${ipHash}`),
  ]);
  if (used >= CAPS[endpoint] || ipUsed >= CAPS.ipDaily) {
    throw Object.assign(new RequestError(`You've reached today's free limit (${CAPS[endpoint]} per day). Come back tomorrow, or keep editing the trip you have.`, 429), {capped: true});
  }
  return {used, limit: CAPS[endpoint]};
}

// One row per request and response (the assignment's audit table). Best-effort: never blocks the traveller.
export function logRequest({endpoint, who, destination = null, input, output = null, usage = {}, status, startedAt, extra = {}}) {
  return insert('requests', {
    endpoint, visitor: who?.visitor ?? null, ip_hash: who?.ipHash ?? null, destination,
    input, output, input_tokens: usage.inputTokens ?? null, output_tokens: usage.outputTokens ?? null,
    model: usage.model ?? null, status, latency_ms: startedAt ? Date.now() - startedAt : null, ...extra,
  });
}

// Small key/value cache for Reddit and photo lookups so we stay inside free API limits.
export async function cacheGet(key, maxAgeHours) {
  const since = new Date(Date.now() - maxAgeHours * 36e5).toISOString();
  const row = await selectOne('cache', `key=eq.${encodeURIComponent(key)}&created_at=gte.${since}&select=value`);
  return row?.value ?? null;
}
export async function cacheSet(key, value) {
  try {
    await call('cache?on_conflict=key', {method: 'POST', body: JSON.stringify({key, value, created_at: new Date().toISOString()}),
      headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}});
  } catch { /* cache is optional */ }
}
