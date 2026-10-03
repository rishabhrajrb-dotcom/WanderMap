// GET /api/community?destination=Lisbon -> Reddit-sourced tips with links and upvotes.
// Cached per destination for 3 days so popular cities cost nothing after the first visitor.
import {generate, text, RequestError} from '../lib/planning.js';
import {SYSTEM, assertNotRefused, checkDestination} from '../lib/guard.js';
import {enforceCap, logRequest, cacheGet, cacheSet} from '../lib/store.js';
import {hasReddit, fetchRedditSources, communityPrompt, attachSources} from '../lib/community.js';
import {endpoint} from '../lib/http.js';

export default endpoint('community', 'GET', async (req, res, ctx) => {
  const destination = text(ctx.query.destination, 150);
  if (!destination) throw new RequestError('Add a destination first.');
  checkDestination(destination);
  if (!hasReddit()) return res.status(200).json({available: false, tips: [], reason: 'Community tips are not switched on yet.'});

  const key = 'reddit:' + destination.toLowerCase();
  const cached = await cacheGet(key, 72);
  if (cached) return res.status(200).json({available: true, cached: true, ...cached});

  ctx.destination = destination;
  ctx.input = {destination};
  await enforceCap('community', ctx.who);
  let sources;
  try { sources = await fetchRedditSources(destination); }
  catch { throw new RequestError('Reddit is not responding right now. Your trip works without it.', 503); }
  if (!sources.length) return res.status(200).json({available: true, tips: [], fetched: 0});

  const {data, usage} = await generate([{text: communityPrompt(destination, sources)}], {system: SYSTEM, maxOutputTokens: 1200, temperature: 0.2});
  assertNotRefused(data);
  const result = {tips: attachSources(data?.tips, sources), fetched: sources.length, fetchedAt: new Date().toISOString()};
  await cacheSet(key, result);
  await logRequest({endpoint: 'community', who: ctx.who, destination, input: ctx.input,
    output: {tips: result.tips.map(({place, sentiment, upvotes}) => ({place, sentiment, upvotes})), fetched: sources.length},
    usage, status: 'ok', startedAt: ctx.startedAt});
  return res.status(200).json({available: true, ...result});
});
