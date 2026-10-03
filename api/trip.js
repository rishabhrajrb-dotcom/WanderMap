// GET /api/trip?id=<shareId> -> a saved itinerary, for shared links.
import {RequestError} from '../lib/planning.js';
import {selectOne} from '../lib/store.js';
import {endpoint} from '../lib/http.js';

export const validShareId = id => /^[\w-]{6,16}$/.test(String(id || ''));
export default endpoint('trip', 'GET', async (req, res, ctx) => {
  if (!validShareId(ctx.query.id)) throw new RequestError('That trip link is not valid.', 404);
  const row = await selectOne('trips', `share_id=eq.${ctx.query.id}&select=destination,days,trip,created_at`);
  if (!row) throw new RequestError('That trip could not be found.', 404);
  res.setHeader?.('Cache-Control', 'public, s-maxage=3600');
  return res.status(200).json(row);
});
