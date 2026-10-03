import test from 'node:test';
import assert from 'node:assert/strict';
import extract from '../api/extract.js';
import plan from '../api/plan.js';
import community from '../api/community.js';
import {attachSources} from '../lib/community.js';
import {pickWikiPage} from '../lib/photos.js';
import {geminiReply} from './fixtures.js';

const ENV = {GEMINI_API_KEY: 'test', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'svc', REDDIT_CLIENT_ID: 'id', REDDIT_CLIENT_SECRET: 'sec'};
function withEnv(t) {
  const before = Object.fromEntries(Object.keys(ENV).map(k => [k, process.env[k]]));
  Object.assign(process.env, ENV);
  t.after(() => Object.entries(before).forEach(([k, v]) => v === undefined ? delete process.env[k] : process.env[k] = v));
}
const invoke = async (handler, req) => {
  const res = {statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(v) { this.body = v; return this; }};
  await handler({headers: {'x-visitor-id': 'v1', 'x-forwarded-for': '10.0.0.1'}, ...req}, res); return res;
};
const gemini = (obj, usage = {promptTokenCount: 812, candidatesTokenCount: 1440}) =>
  Response.json({candidates: [{finishReason: 'STOP', content: {parts: [{text: JSON.stringify(obj)}]}}], usageMetadata: usage});

// A fake Supabase + Gemini. `used` is what the cap count query returns.
function fakeBackend(t, {used = 0, reply} = {}) {
  const log = {rows: [], geminiBodies: [], counts: 0};
  t.mock.method(globalThis, 'fetch', async (url, opt = {}) => {
    url = String(url);
    if (url.includes('/rest/v1/requests') && opt.method === 'HEAD') { log.counts++; return new Response(null, {status: 200, headers: {'content-range': `0-0/${used}`}}); }
    if (url.includes('/rest/v1/')) { log.rows.push({table: url.split('/rest/v1/')[1].split('?')[0], row: JSON.parse(opt.body || 'null')}); return new Response(null, {status: 201}); }
    if (url.includes('generativelanguage')) {
      const body = JSON.parse(opt.body); log.geminiBodies.push(body);
      return gemini(reply ? reply(body) : geminiReply(body.contents[0].parts.at(-1).text));
    }
    throw new Error('unexpected ' + url);
  });
  return log;
}
const profile = {destination: 'Lisbon', days: 2, budgetPerDay: 5000, currency: 'INR', occasion: 'Anniversary', email: 'me@example.com',
  notes: 'call me on +91 98765 43210', moments: ['Rooftop or view', 'Not a real option']};

test('every exchange is stored with tokens, a system prompt and an output cap, and without emails', async t => {
  withEnv(t); const log = fakeBackend(t);
  const r = await invoke(extract, {method: 'POST', body: profile});
  assert.equal(r.statusCode, 200);
  const g = log.geminiBodies[0];
  assert.match(g.systemInstruction.parts[0].text, /refused/); assert.equal(g.generationConfig.maxOutputTokens, 2500);
  const row = log.rows.find(x => x.table === 'requests').row;
  assert.equal(row.status, 'ok'); assert.equal(row.input_tokens, 812); assert.equal(row.output_tokens, 1440);
  assert.equal(row.endpoint, 'extract'); assert.ok(row.visitor && row.visitor !== 'v1', 'visitor id is hashed');
  const stored = JSON.stringify(row);
  assert.doesNotMatch(stored, /me@example\.com|98765/); assert.match(stored, /\[phone\]/);
  assert.deepEqual(row.input.moments, ['Rooftop or view'], 'unknown fixed-field values are dropped');
});

test('the per-visitor cap blocks before Gemini is called, with a friendly message', async t => {
  withEnv(t); const log = fakeBackend(t, {used: 8});
  const r = await invoke(extract, {method: 'POST', body: profile});
  assert.equal(r.statusCode, 429); assert.match(r.body.error, /today's free limit/);
  assert.equal(log.geminiBodies.length, 0);
  assert.equal(log.rows.find(x => x.table === 'requests').row.status, 'capped');
});

test('model refusals reach the visitor and are logged with their token cost', async t => {
  withEnv(t);
  const log = fakeBackend(t, {reply: () => ({refused: true, reason: "I couldn't find a real place called Atlantis."})});
  const r = await invoke(extract, {method: 'POST', body: {destination: 'Atlantis', days: 2}});
  assert.equal(r.statusCode, 422); assert.equal(r.body.refused, true); assert.match(r.body.error, /Atlantis/);
  const row = log.rows.find(x => x.table === 'requests').row;
  assert.equal(row.status, 'refused'); assert.equal(row.output_tokens, 1440);
});

test('plan saves a shareable trip without email and records the budget check', async t => {
  withEnv(t); const log = fakeBackend(t);
  const r = await invoke(plan, {method: 'POST', body: {...profile, places: [{id: 'p1', name: 'Alfama', priority: 'must', hiddenGem: true}, {id: 'p2', name: 'Estrela'}]}});
  assert.equal(r.statusCode, 200); assert.match(r.body.shareId, /^[\w-]{8}$/);
  const trip = log.rows.find(x => x.table === 'trips').row, req = log.rows.find(x => x.table === 'requests').row;
  assert.equal(trip.share_id, r.body.shareId); assert.equal('email' in trip, false);
  assert.equal(req.within_budget, true); assert.equal(req.hidden_gems, 1); assert.equal(req.share_id, r.body.shareId);
  assert.equal(log.geminiBodies[0].generationConfig.maxOutputTokens, 3000);
});

test('community tips must cite fetched Reddit sources; uncited or invented ones are dropped', () => {
  const sources = [{id: 't1_a', subreddit: 'solotravel', score: 40, permalink: 'https://www.reddit.com/r/solotravel/a', created: 1}];
  const tips = attachSources([
    {place: 'LX Factory', tip: 'Sunday market', sentiment: 'recommend', sourceIds: ['t1_a']},
    {place: 'Made up bar', tip: 'Everyone loves it', sourceIds: ['t1_fake']},
    {place: 'No source', tip: 'x'},
  ], sources);
  assert.equal(tips.length, 1); assert.equal(tips[0].sources[0].permalink, sources[0].permalink); assert.equal(tips[0].upvotes, 40);
});

test('community endpoint reads Reddit through OAuth and caches the summary', async t => {
  withEnv(t); const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opt = {}) => {
    url = String(url); calls.push(url);
    if (url.includes('/rest/v1/cache') && (opt.method || 'GET') === 'GET') return Response.json([]);
    if (url.includes('/rest/v1/requests') && opt.method === 'HEAD') return new Response(null, {headers: {'content-range': '0-0/0'}});
    if (url.includes('/rest/v1/')) return new Response(null, {status: 201});
    if (url.includes('access_token')) return Response.json({access_token: 'tok', expires_in: 3600});
    if (url.includes('oauth.reddit.com/comments/')) return Response.json([{}, {data: {children: [{kind: 't1', data: {id: 'c1', body: 'Go to LX Factory on Sunday', score: 12, subreddit: 'travel', permalink: '/r/travel/c1', created_utc: 1}}]}}]);
    if (url.includes('oauth.reddit.com')) return Response.json({data: {children: [{data: {id: 'p1', title: 'Lisbon tips?', selftext: '', score: 50, subreddit: 'travel', permalink: '/r/travel/p1', created_utc: 1}}]}});
    if (url.includes('generativelanguage')) return gemini({tips: [{place: 'LX Factory', tip: 'Sunday market', sentiment: 'recommend', sourceIds: ['t1_c1']}]});
    throw new Error(url);
  });
  const r = await invoke(community, {method: 'GET', query: {destination: 'Lisbon'}});
  assert.equal(r.statusCode, 200); assert.equal(r.body.tips[0].place, 'LX Factory'); assert.match(r.body.tips[0].sources[0].permalink, /reddit\.com\/r\/travel\/c1/);
  assert.ok(calls.some(u => u.includes('/rest/v1/cache?on_conflict=key')), 'summary cached');
  assert.ok(calls.every(u => !u.includes('twitter') && !u.includes('x.com')));
});

test('a Wikipedia photo is used only when the page is near the place', () => {
  const place = {name: 'Jay Fai', lat: 13.7525, lng: 100.5048};
  const far = {title: 'Someone', thumbnail: {source: 'a.jpg'}, coordinates: [{lat: 40.7, lon: -74}]};
  const none = {title: 'A person', thumbnail: {source: 'b.jpg'}};
  const near = {title: 'Jay Fai (restaurant)', thumbnail: {source: 'c.jpg'}, coordinates: [{lat: 13.753, lon: 100.505}], fullurl: 'https://en.wikipedia.org/wiki/x'};
  assert.equal(pickWikiPage([far, none], place), null);
  assert.equal(pickWikiPage([far, none, near], place).url, 'c.jpg');
});
