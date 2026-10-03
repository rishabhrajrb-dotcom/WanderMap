// GET /api/stats -> the live numbers the page shows back from Supabase (assignment read-back).
import {rpc, hasStore} from '../lib/store.js';
import {endpoint} from '../lib/http.js';

export default endpoint('stats', 'GET', async (req, res) => {
  const stats = hasStore() ? await rpc('wandermap_stats') : null;
  res.setHeader?.('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
  return res.status(200).json(stats || {trips_planned: 0, trips_this_week: 0, destinations: 0, top_destinations: [],
    within_budget_pct: null, hidden_gems_found: 0, avg_output_tokens: null});
});
