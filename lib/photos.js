// A photo for each place card. Wikipedia/Wikimedia first (free, no key, good for landmarks), then
// Unsplash (free key, needs photographer credit) for restaurants and smaller spots. No photo -> null,
// and the page shows a category illustration instead.
const WIKI_UA = 'WanderMap/1.0 (student travel project)';

function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const hasCoords = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

async function wiki(params) {
  const r = await fetch('https://en.wikipedia.org/w/api.php?' + new URLSearchParams({format: 'json', formatversion: '2', ...params}),
    {headers: {'User-Agent': WIKI_UA}, signal: AbortSignal.timeout(4000)});
  return r.ok ? r.json() : null;
}

// Accept a Wikipedia page only if it has an image and, when both sides have coordinates, sits within 30 km
// of the place. That stops "Jay Fai" (a restaurant) from matching a person's biography photo.
export function pickWikiPage(pages, place) {
  for (const pg of pages || []) {
    if (!pg?.thumbnail?.source || pg.missing) continue;
    const c = pg.coordinates?.[0];
    if (hasCoords(place) && c && km(place, {lat: c.lat, lng: c.lon}) > 30) continue;
    if (hasCoords(place) && !c) continue; // no coordinates on the page: too risky to trust for a place
    return {url: pg.thumbnail.source, source: 'Wikipedia', credit: 'Wikimedia Commons', creditUrl: pg.fullurl || null, title: pg.title};
  }
  return null;
}

async function fromWikipedia(place, destination) {
  const props = {prop: 'pageimages|coordinates|info', inprop: 'url', piprop: 'thumbnail', pithumbsize: '960', redirects: '1'};
  if (place.wiki) {
    const hit = pickWikiPage((await wiki({action: 'query', titles: place.wiki, ...props}))?.query?.pages, place);
    if (hit) return hit;
  }
  const res = await wiki({action: 'query', generator: 'search', gsrsearch: `${place.name} ${destination}`, gsrlimit: '3', ...props});
  const pages = (res?.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pickWikiPage(pages, place);
}

async function fromUnsplash(place, destination) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const q = encodeURIComponent(`${place.name} ${destination}`);
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape&content_filter=high`,
    {headers: {Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1'}, signal: AbortSignal.timeout(4000)});
  const p = r.ok ? (await r.json()).results?.[0] : null;
  if (!p) return null;
  const utm = '?utm_source=wandermap&utm_medium=referral'; // required by Unsplash's attribution guidelines
  return {url: p.urls.regular, source: 'Unsplash', credit: p.user?.name || 'Unsplash', creditUrl: (p.user?.links?.html || 'https://unsplash.com') + utm,
    alt: p.alt_description || place.name, generic: true}; // generic: may show the area rather than the exact place
}

export async function photoFor(place, destination) {
  try { return (await fromWikipedia(place, destination)) || (await fromUnsplash(place, destination)); }
  catch { return null; }
}
