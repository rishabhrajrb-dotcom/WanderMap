// /t/<shareId> (rewritten here by vercel.json). Social apps don't run JavaScript, so this returns a tiny
// HTML page with Open Graph tags for a rich link preview, then forwards people to the app.
import {selectOne} from '../lib/store.js';
import {validShareId} from './trip.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export default async function handler(req, res) {
  const id = (req.query?.id) || new URL(req.url, 'http://x').searchParams.get('id');
  const row = validShareId(id) ? await selectOne('trips', `share_id=eq.${id}&select=destination,days,trip`) : null;
  const t = row?.trip;
  const title = t ? `${t.title} · WanderMap` : 'WanderMap: trips that feel like you';
  const moments = (t?.days || []).map(d => d.signatureMoment).filter(Boolean).slice(0, 2).join(' · ');
  const desc = t ? `${row.days}-day ${row.destination} plan${moments ? ': ' + moments : ''}. Plan yours in 2 minutes.`
    : 'Tell us how you like to travel. Get a personal, budget-aware itinerary with hidden gems and real traveller tips.';
  const host = `https://${req.headers?.host || 'wandermap.vercel.app'}`;
  const target = row ? `/?trip=${encodeURIComponent(id)}` : '/';
  res.setHeader?.('Content-Type', 'text/html; charset=utf-8');
  res.setHeader?.('Cache-Control', 'public, s-maxage=3600');
  res.status(row ? 200 : 404).send?.(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(host + '/t/' + (row ? id : ''))}">
<meta property="og:image" content="${esc(host)}/og-image.png"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}"></head>
<body><a href="${esc(target)}">Open this trip on WanderMap</a></body></html>`);
}
