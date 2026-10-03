export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const text = (v, max = 800) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export const levels = ['Low', 'Medium', 'High'];
const pick = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const pickMany = (v, allowed, max = 8) => Array.isArray(v) ? [...new Set(v.filter(x => allowed.includes(x)))].slice(0, max) : [];
const scale = (v, fallback = 3) => Number.isInteger(v) && v >= 1 && v <= 5 ? v : fallback;
// Fixed choices keep the prompt predictable and keep personal or health details out of storage.
export const choices = {
  party: ['Solo', 'Partner', 'Friends', 'Family with kids', 'Parents'],
  budget: ['Budget', 'Mid-range', 'Premium'],
  occasion: ['Just because', 'First solo trip', 'Birthday', 'Anniversary', 'Honeymoon', 'Friends reunion', 'Workation', 'Celebration'],
  diet: ['No restrictions', 'Vegetarian', 'Vegan', 'Jain', 'Halal', 'Kosher'],
  rhythm: ['Early bird', 'Flexible', 'Night owl'],
  avoid: ['Crowds', 'Long queues', 'Tourist traps', 'Early starts', 'Late nights', 'Long commutes', 'Heat', 'Steep climbs'],
  moments: ['Sunrise or sunset spot', 'Street-food crawl', 'Hands-on class or workshop', 'Live music', 'Local market',
    'Nature escape', 'Rooftop or view', 'Museum or gallery', 'Neighbourhood wander', 'Spa or slow morning',
    'Adventure activity', 'Photo-worthy spots', 'Shopping for local crafts', 'Nightlife'],
};
export function readProfile(raw) {
  let b = raw;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { throw new RequestError('Please send a valid trip.'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new RequestError('Please send a valid trip.');
  const destination = text(b.destination, 150);
  if (!destination) throw new RequestError('Add a destination first.');
  const days = Number(b.days ?? 2);
  if (!Number.isInteger(days) || days < 1 || days > 5) throw new RequestError('Choose between 1 and 5 days.');
  const intensity = levels.includes(b.intensity) ? b.intensity : ({Relaxed:'Low', Balanced:'Medium', Packed:'High'}[b.pace] || 'Medium');
  return {
    destination, days, intensity,
    dayIntensity: Array.from({length:days}, (_, i) => levels.includes(b.dayIntensity?.[i]) ? b.dayIntensity[i] : intensity),
    party: pick(b.party === 'Family' ? 'Family with kids' : b.party, choices.party, 'Friends'), budget: pick(b.budget, choices.budget, 'Mid-range'),
    // Personal-finance angle: an optional daily spend ceiling in the traveller's own currency.
    budgetPerDay: Number.isFinite(+b.budgetPerDay) && +b.budgetPerDay > 0 ? Math.min(Math.round(+b.budgetPerDay), 10_000_000) : null,
    currency: /^[A-Z]{3}$/.test(b.currency) ? b.currency : 'INR',
    month: /^(0?[1-9]|1[0-2])$/.test(String(b.month ?? '')) ? Number(b.month) : null,
    firstVisit: b.firstVisit !== false,
    occasion: pick(b.occasion, choices.occasion, 'Just because'),
    diet: pick(b.diet, choices.diet, 'No restrictions'),
    rhythm: pick(b.rhythm, choices.rhythm, 'Flexible'),
    offbeat: scale(b.offbeat), // 1 = iconic classics … 5 = mostly hidden gems
    adventure: scale(b.adventure), // 1 = comfort first … 5 = up for anything
    moments: pickMany(b.moments, choices.moments, 4),
    avoid: pickMany(b.avoid, choices.avoid),
    stayArea: text(b.stayArea, 120),
    interests: Array.isArray(b.interests) ? b.interests.filter(v => typeof v === 'string').slice(0,8).map(v => text(v,80)) : [],
    notes:text(b.notes,1500), source:text(b.source,6000),
    startTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime) ? b.startTime : '09:00',
    walking:['Light','Moderate','Lots'].includes(b.walking) ? b.walking : 'Moderate',
    places:b.places, community: Array.isArray(b.community) ? b.community.slice(0, 20) : []
  };
}
// Costs are whole numbers in the traveller's currency; anything else becomes null ("unknown").
export const money = v => Number.isFinite(+v) && +v >= 0 && v !== '' && v !== null ? Math.round(+v) : null;
const coord = (v, max) => Number.isFinite(+v) && Math.abs(+v) <= max && v !== null && v !== '' ? +v : null;
export function normalizePlaces(places) {
  if (!Array.isArray(places) || !places.length || places.length > 30) throw new RequestError('Choose between 1 and 30 places.');
  const result = places.map((p,i) => ({
    id:text(p?.id,80) || `p${i+1}`, name:text(p?.name,160), area:text(p?.area,160), category:text(p?.category,60),
    priority:['must','optional','skip'].includes(p?.priority) ? p.priority : 'optional',
    ...(coord(p?.lat,90) !== null && coord(p?.lng,180) !== null ? {lat:+p.lat,lng:+p.lng} : {}),
    ...(p?.hiddenGem === true ? {hiddenGem:true} : {})
  })).filter(p => p.priority !== 'skip');
  if (!result.length || result.some(p => !p.name)) throw new RequestError('Pick at least one named place.');
  if (new Set(result.map(p => p.id)).size !== result.length) throw new RequestError('Each place needs a unique identifier.');
  return result;
}
export const MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
// Returns {data, usage}. `system` carries the product context and refusal rules;
// maxOutputTokens is the per-request cost cap the assignment asks for.
export async function generate(parts, {system, maxOutputTokens = 2048, temperature = 0.4} = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new RequestError('Trip planning is not configured yet. Please try again later.',503);
  const model = MODEL();
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({
        ...(system ? {systemInstruction:{parts:[{text:system}]}} : {}),
        contents:[{parts}],
        generationConfig:{temperature,maxOutputTokens,responseMimeType:'application/json'}
      }),
      signal:AbortSignal.timeout(45000)
    });
  } catch { throw new RequestError('The planner took too long to respond. Please try again.',504); }
  if (response.status === 429) throw new RequestError('The planner is busy or its allowance is used up. Your choices are safe on this page; try again later.',429);
  if (!response.ok) throw new RequestError('Could not generate suggestions. If you used a video, try its caption or your own notes.',502);
  try {
    const data = await response.json(), candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error();
    const content = candidate?.content?.parts?.filter(p => !p.thought && p.text).map(p => p.text).join('') || '';
    const m = data.usageMetadata || {};
    const usage = {inputTokens: m.promptTokenCount ?? null, outputTokens: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0) || null, model};
    return {data: JSON.parse(content.replace(/^```json\s*|\s*```$/g,'').trim()), usage};
  } catch { throw new RequestError('The planner returned an incomplete answer. Please try again.',502); }
}
export function validateItinerary(raw, places, profile) {
  const fail = () => { throw new RequestError('The draft did not respect all your choices. Please try building it again.',502); };
  if (!raw || !Array.isArray(raw.days) || raw.days.length !== profile.days) fail();
  const byId = new Map(places.map(p => [p.id,p])), used = new Set();
  const start = Number(profile.startTime.slice(0,2))*60 + Number(profile.startTime.slice(3));
  const days = raw.days.map((day,i) => {
    if (day?.day !== i+1 || !Array.isArray(day.stops) || day.stops.length > 30) fail();
    let previousTime = -1;
    const stops = day.stops.map(stop => {
      const place = byId.get(stop?.placeId);
      if (!place || used.has(place.id) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time)) fail();
      const time = Number(stop.time.slice(0,2))*60 + Number(stop.time.slice(3));
      if (time < start || time <= previousTime) fail();
      previousTime = time; used.add(place.id);
      return {placeId:place.id,name:place.name,area:place.area,priority:place.priority,time:stop.time,
        why:text(stop.why),whatToDo:text(stop.whatToDo),duration:text(stop.duration,80),travelToNext:text(stop.travelToNext,250),
        cost:money(stop.cost),signature:stop.signature === true,lat:place.lat ?? null,lng:place.lng ?? null};
    });
    // Exactly one "signature moment" a day: keep the first one the model flagged, or the first stop.
    const firstSig = stops.findIndex(s => s.signature);
    stops.forEach((s, j) => { s.signature = j === (firstSig < 0 ? 0 : firstSig); });
    const extras = money(day.extras); // meals, transport and small spends between stops
    const estimate = stops.reduce((t, s) => t + (s.cost ?? 0), 0) + (extras ?? 0);
    return {day:i+1,intensity:profile.dayIntensity[i],theme:text(day.theme,150),guidance:text(day.guidance),
      signatureMoment:text(day.signatureMoment,250),stops,extras,estimate};
  });
  if (!used.size || places.some(p => p.priority === 'must' && !used.has(p.id))) fail();
  const omitted = places.filter(p => !used.has(p.id)).map(p => {
    const detail = Array.isArray(raw.omitted) ? raw.omitted.find(o => o?.placeId === p.id) : null;
    return {placeId:p.id,name:p.name,reason:text(detail?.reason) || 'Kept as an alternative to leave more room in your days.'};
  });
  const total = days.reduce((t, d) => t + d.estimate, 0);
  const budget = {currency:profile.currency,estimatedTotal:total,perDayLimit:profile.budgetPerDay,
    withinBudget:profile.budgetPerDay ? days.every(d => d.estimate <= profile.budgetPerDay) : null,
    note:'Estimated from typical prices. Check current prices before you go.'};
  return {title:text(raw.title,180) || `${profile.destination}, your way`,days,omitted,budget,
    review:{verdict:text(raw.review?.verdict),fix:text(raw.review?.fix)},
    preferences:{intensity:profile.intensity,dayIntensity:profile.dayIntensity,walking:profile.walking,startTime:profile.startTime,
      party:profile.party,occasion:profile.occasion,offbeat:profile.offbeat,budgetPerDay:profile.budgetPerDay,currency:profile.currency},
    verification:'AI draft. Opening hours, availability and travel times have not been checked against live sources.'};
}
