// Shared wrapper for every /api function: method check, visitor id, timing, error -> friendly JSON,
// and an audit row in Supabase for refusals, caps and failures (successful calls log themselves).
import {visitorOf, logRequest} from './store.js';

export function endpoint(name, method, fn) {
  return async (req, res) => {
    if (req.method !== method) return res.status(405).json({error: `Use ${method}`});
    const ctx = {who: visitorOf(req), startedAt: Date.now(), destination: null, input: null, query: queryOf(req)};
    try {
      return await fn(req, res, ctx);
    } catch (e) {
      const status = e.status || 500;
      const kind = e.refused ? 'refused' : e.capped ? 'capped' : 'error';
      if (ctx.input) await logRequest({endpoint: name, who: ctx.who, destination: ctx.destination, input: ctx.input,
        output: {error: e.message}, usage: e.usage, status: kind, startedAt: ctx.startedAt});
      return res.status(status).json({error: e.status ? e.message : 'Something went wrong. Please try again.', ...(e.refused ? {refused: true} : {})});
    }
  };
}

function queryOf(req) {
  if (req.query) return req.query;
  try { return Object.fromEntries(new URL(req.url, 'http://x').searchParams); } catch { return {}; }
}
