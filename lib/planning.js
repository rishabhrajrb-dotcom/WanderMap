export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const text = (v, max = 800) => typeof v === 'string' ? v.trim().slice(0, max) : '';
export const levels = ['Low', 'Medium', 'High'];
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
    party: text(b.party,40) || 'Friends', budget:text(b.budget,40) || 'Mid-range',
    interests: Array.isArray(b.interests) ? b.interests.filter(v => typeof v === 'string').slice(0,8).map(v => text(v,80)) : [],
    notes:text(b.notes,1500), source:text(b.source,6000),
    startTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime) ? b.startTime : '09:00',
    walking:['Light','Moderate','Lots'].includes(b.walking) ? b.walking : 'Moderate',
    email:text(b.email,254), places:b.places
  };
}
export function normalizePlaces(places) {
  if (!Array.isArray(places) || !places.length || places.length > 30) throw new RequestError('Choose between 1 and 30 places.');
  const result = places.map((p,i) => ({
    id:text(p?.id,80) || `p${i+1}`, name:text(p?.name,160), area:text(p?.area,160), category:text(p?.category,60),
    priority:['must','optional','skip'].includes(p?.priority) ? p.priority : 'optional'
  })).filter(p => p.priority !== 'skip');
  if (!result.length || result.some(p => !p.name)) throw new RequestError('Pick at least one named place.');
  if (new Set(result.map(p => p.id)).size !== result.length) throw new RequestError('Each place needs a unique identifier.');
  return result;
}
export async function generate(parts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new RequestError('Trip planning is not configured yet. Please try again later.',503);
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify({contents:[{parts}],generationConfig:{temperature:0.4,responseMimeType:'application/json'}}),
      signal:AbortSignal.timeout(45000)
    });
  } catch { throw new RequestError('The planner took too long to respond. Please try again.',504); }
  if (response.status === 429) throw new RequestError('The planner is busy or its allowance is used up. Your choices are safe on this page; try again later.',429);
  if (!response.ok) throw new RequestError('Could not generate suggestions. If you used a video, try its caption or your own notes.',502);
  try {
    const data = await response.json(), candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error();
    const content = candidate?.content?.parts?.filter(p => !p.thought && p.text).map(p => p.text).join('') || '';
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g,'').trim());
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
        why:text(stop.why),whatToDo:text(stop.whatToDo),duration:text(stop.duration,80),travelToNext:text(stop.travelToNext,250)};
    });
    return {day:i+1,intensity:profile.dayIntensity[i],theme:text(day.theme,150),guidance:text(day.guidance),stops};
  });
  if (!used.size || places.some(p => p.priority === 'must' && !used.has(p.id))) fail();
  const omitted = places.filter(p => !used.has(p.id)).map(p => {
    const detail = Array.isArray(raw.omitted) ? raw.omitted.find(o => o?.placeId === p.id) : null;
    return {placeId:p.id,name:p.name,reason:text(detail?.reason) || 'Kept as an alternative to leave more room in your days.'};
  });
  return {title:text(raw.title,180) || `${profile.destination}, your way`,days,omitted,
    review:{verdict:text(raw.review?.verdict),fix:text(raw.review?.fix)},
    preferences:{intensity:profile.intensity,dayIntensity:profile.dayIntensity,walking:profile.walking,startTime:profile.startTime},
    verification:'AI draft. Opening hours, availability and travel times have not been checked against live sources.'};
}
