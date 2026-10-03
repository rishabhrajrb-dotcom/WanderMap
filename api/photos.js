// POST /api/photos {destination, places:[{id,name,wiki,lat,lng}]} -> {photos:{[id]: {url, credit, creditUrl, source} | null}}
// No Gemini call, so it is not logged or capped per visitor beyond the input limit; results are cached.
import {text, RequestError} from '../lib/planning.js';
import {cacheGet, cacheSet} from '../lib/store.js';
import {photoFor} from '../lib/photos.js';
import {endpoint} from '../lib/http.js';

export default endpoint('photos', 'POST', async (req, res) => {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const destination = text(b?.destination, 150);
  const places = (Array.isArray(b?.places) ? b.places : []).slice(0, 12).map(p => ({
    id: text(p?.id, 40), name: text(p?.name, 160), wiki: text(p?.wiki, 200),
    lat: Number.isFinite(+p?.lat) && p?.lat !== null ? +p.lat : NaN, lng: Number.isFinite(+p?.lng) && p?.lng !== null ? +p.lng : NaN,
  })).filter(p => p.id && p.name);
  if (!destination || !places.length) throw new RequestError('Send a destination and up to 12 places.');

  const photos = {};
  await Promise.all(places.map(async p => {
    const key = `photo:${destination}:${p.name}`.toLowerCase();
    let hit = await cacheGet(key, 24 * 30);
    if (!hit) { hit = await photoFor(p, destination); if (hit) await cacheSet(key, hit); }
    photos[p.id] = hit || null;
  }));
  res.setHeader?.('Cache-Control', 'public, s-maxage=86400');
  return res.status(200).json({photos});
});
