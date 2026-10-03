const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const interests = [
 ['Food','Street-food discoveries, markets and memorable meals.'],
 ['Nature','Scenic walks, green spaces and time outdoors.'],
 ['Culture','Architecture, history and stories behind a place.'],
 ['Adventure','Active experiences, trails and a little challenge.'],
 ['Nightlife','Evening energy, live music and late-night spots.'],
 ['Slow travel','Neighbourhood wandering, cafés and room to pause.']
];
const intensityOptions = [['Low','Unhurried, with room to linger.'],['Medium','A little exploring, a little breathing room.'],['High','Fuller days, with breaks built in.']];
let activeInterests = new Set(['Food','Culture']), intensity = 'Medium', dayIntensity = ['Medium','Medium'];
let places = [], filter = 'all', busy = false, revision = 0, recommendationProfile = '', itinerary = null;
const error = (id,message) => { $(id).textContent = message; $(id).hidden = !message; };
function profile() {
 return {destination:$('destination').value.trim(),days:Number($('days').value),party:$('party').value,budget:$('budget').value,
  interests:[...activeInterests],intensity,dayIntensity:[...dayIntensity],walking:$('walking').value,startTime:$('startTime').value,
  notes:$('notes').value.trim(),source:$('source').value.trim()};
}
function markChanged() {
 revision++; error('buildError','');
 if (itinerary) $('stalePlan').hidden = false;
 $('staleChoices').hidden = !places.length || recommendationProfile === JSON.stringify(profile());
 updateSummary();
}
function renderInterests() {
 $('interests').innerHTML = interests.map(([name,description]) => `<button type="button" class="interest" data-interest="${name}" aria-pressed="${activeInterests.has(name)}"><b>${name}</b><span>${description}</span></button>`).join('');
}
function renderIntensity() {
 $('intensity').innerHTML = intensityOptions.map(([name,description]) => `<button type="button" class="intensity" data-intensity="${name}" aria-pressed="${name===intensity}"><strong>${name}</strong><span>${description}</span></button>`).join('');
 $('dayIntensity').innerHTML = dayIntensity.map((level,i) => `<div><label for="day-${i}">Day ${i+1}</label><select id="day-${i}" data-day="${i}">${intensityOptions.map(([name]) => `<option${name===level?' selected':''}>${name}</option>`).join('')}</select></div>`).join('');
}
$('interests').addEventListener('click',e => {
 const button = e.target.closest('[data-interest]'); if (!button || busy) return;
 const name = button.dataset.interest; activeInterests.has(name) ? activeInterests.delete(name) : activeInterests.add(name);
 button.setAttribute('aria-pressed',String(activeInterests.has(name))); markChanged();
});
$('intensity').addEventListener('click',e => {
 const button = e.target.closest('[data-intensity]'); if (!button || busy) return;
 intensity = button.dataset.intensity; dayIntensity = dayIntensity.map(() => intensity); renderIntensity(); markChanged();
});
$('dayIntensity').addEventListener('change',e => { dayIntensity[Number(e.target.dataset.day)] = e.target.value; markChanged(); });
$('days').addEventListener('change',() => {
 dayIntensity = Array.from({length:Number($('days').value)},(_,i) => dayIntensity[i] || intensity); renderIntensity(); markChanged();
});
['destination','party','budget','startTime','walking','notes','source'].forEach(id => $(id).addEventListener('input',markChanged));
function updateSummary() {
 const included = places.filter(p => p.priority !== 'skip'), must = included.filter(p => p.priority === 'must').length;
 $('selectionSummary').textContent = `${must} must-see · ${included.length-must} optional · ${places.length-included.length} skipped`;
 $('tripSummary').textContent = $('destination').value.trim() ? `${$('destination').value.trim()} · ${$('days').value} day(s) · ${dayIntensity.join(' / ')} intensity` : 'Start with a destination. We’ll help you find your rhythm.';
 $('build').disabled = busy || !included.length;
}
function setBusy(value) {
 busy = value; $('profileFields').disabled = value;
 $('curation').querySelectorAll('button,input,select').forEach(el => el.disabled = value); updateSummary();
}
async function post(url,payload) {
 const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});
 let data; try { data = await response.json(); } catch { throw new Error('The server did not return a complete answer. Please try again.'); }
 if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
 return data;
}
function message(e) { return e.name === 'TimeoutError' ? 'This is taking longer than expected. Your choices are still here; try again.' : e.message; }
$('discoverForm').addEventListener('submit',async e => {
 e.preventDefault(); if (busy) return;
 const payload = profile(), snapshot = JSON.stringify(payload);
 setBusy(true); error('discoverError',''); $('discoverStatus').textContent = 'Finding places that fit your interests…';
 try {
  const data = await post('/api/extract',payload);
  if (!Array.isArray(data.places) || !data.places.length) throw new Error('No suggestions found. Try adding a few notes.');
  places = data.places.map(p => ({...p,priority:'optional'})); filter = 'all'; recommendationProfile = snapshot;
  itinerary = null; $('itinerary').hidden = true; $('curation').hidden = false; $('staleChoices').hidden = true;
  $('curationTitle').textContent = `Your ${data.destination} possibilities`; $('discover').textContent = 'Refresh my suggestions ↻';
  renderPlaces(); $('curation').focus(); $('curation').scrollIntoView({block:'start'});
 } catch(e) { error('discoverError',message(e)); }
 finally { $('discoverStatus').textContent = ''; setBusy(false); }
});
function renderPlaces() {
 const categories = [...new Set(places.map(p => p.category))];
 const filters = [['all','All places'],['highlights','Not to miss'],...categories.map(c => [`category:${c}`,c])];
 $('filters').innerHTML = filters.map(([key,label]) => `<button type="button" class="filter" data-filter="${esc(key)}" aria-pressed="${filter===key}">${esc(label)}</button>`).join('');
 const visible = places.filter(p => filter==='all' || (filter==='highlights' ? p.highlightReason : filter===`category:${p.category}`));
 $('emptyFilter').hidden = visible.length > 0;
 $('places').innerHTML = visible.map(p => `<article class="place-card ${p.priority==='skip'?'skipped':''}">
  <div class="place-top"><span class="tag">${esc(p.category)}</span>${p.highlightReason?'<span class="tag gold">Not to miss · suggested</span>':''}</div>
  <h3>${esc(p.name)}</h3><p class="place-meta">${esc([p.area,p.duration].filter(Boolean).join(' · '))}</p>
  <p>${esc(p.offers || 'Your own addition to the trip. Confirm its location and details before visiting.')}</p>
  ${p.why?`<p class="benefit"><strong>Why it fits your trip</strong><br>${esc(p.why)}</p>`:''}
  ${p.highlightReason?`<p><strong>What makes it stand out</strong><br>${esc(p.highlightReason)}</p>`:''}
  ${p.tradeoff?`<p class="tradeoff"><strong>Worth considering</strong><br>${esc(p.tradeoff)}</p>`:''}
  <p class="place-meta">${p.evidence==='user-added'?'Added by you':'AI suggestion · details need checking'}</p>
  <div class="choice-controls" role="group" aria-label="Choose priority for ${esc(p.name)}">${[['must','★ Must-see'],['optional','Optional'],['skip','Skip']].map(([key,label]) => `<button type="button" data-place="${esc(p.id)}" data-priority="${key}" aria-pressed="${p.priority===key}">${label}</button>`).join('')}</div>
 </article>`).join('');
 updateSummary();
}
$('filters').addEventListener('click',e => {
 const b=e.target.closest('[data-filter]'); if(!b || busy)return; filter=b.dataset.filter; renderPlaces();
 const next=[...$('filters').querySelectorAll('button')].find(b=>b.dataset.filter===filter); next?.focus();
});
$('places').addEventListener('click',e => {
 const b=e.target.closest('[data-place]'); if(!b || busy)return;
 const p=places.find(p=>p.id===b.dataset.place); if(!p)return; p.priority=b.dataset.priority;
 markChanged(); renderPlaces();
 [...$('places').querySelectorAll('button')].find(x=>x.dataset.place===p.id && x.dataset.priority===p.priority)?.focus();
});
$('addPlace').addEventListener('click',() => {
 if(busy)return; const name=$('customName').value.trim(),area=$('customArea').value.trim();
 error('customError','');
 if(!name)return error('customError','Add the place’s name first.');
 if(places.length>=30)return error('customError','You can curate up to 30 places for this trip.');
 if(places.some(p=>p.name.toLowerCase()===name.toLowerCase()))return error('customError','That place is already in your options.');
 places.push({id:`custom-${crypto.randomUUID()}`,name,area,category:'Your additions',priority:'optional',evidence:'user-added'});
 $('customName').value='';$('customArea').value=''; filter='all'; markChanged();renderPlaces();
});
$('build').addEventListener('click',async () => {
 if(busy)return;
 if(!$('discoverForm').reportValidity())return;
 if(recommendationProfile && profile().destination.toLowerCase() !== JSON.parse(recommendationProfile).destination.toLowerCase())return error('buildError','Your destination changed. Find fresh suggestions before building this trip.');
 const payload={...profile(),places:places.filter(p=>p.priority!=='skip')}, version=revision;
 if(!payload.places.length)return error('buildError','Pick at least one place.');
 setBusy(true);error('buildError','');$('buildStatus').textContent='Shaping your days around your choices…';
 try {
  const data=await post('/api/plan',payload);
  if(!data.itinerary || !Array.isArray(data.itinerary.days))throw new Error('The itinerary was incomplete. Please try again.');
  itinerary=data.itinerary; renderItinerary(data.saved);$('itinerary').hidden=false;$('stalePlan').hidden=version===revision;
  $('itinerary').focus();$('itinerary').scrollIntoView({block:'start'});
 }catch(e){error('buildError',message(e));}
 finally{$('buildStatus').textContent='';setBusy(false);}
});
function renderItinerary(saved) {
 $('tripTitle').textContent=itinerary.title;
 $('draftNotice').textContent=itinerary.verification;
 $('daysOut').innerHTML=itinerary.days.map(d=>`<section class="day"><span class="tag">Day ${esc(d.day)} · ${esc(d.intensity)} intensity</span><h3>${esc(d.theme)}</h3><p class="small muted">${esc(d.guidance)}</p>
 ${d.stops.map((s,i)=>`<div class="stop"><span class="time">${esc(s.time)}</span><div><strong>${esc(s.name)}</strong> ${s.priority==='must'?'<span class="tag">Your must-see</span>':''}<p>${esc(s.whatToDo)}</p><p>${esc(s.why)}</p><p>${esc(s.duration)}</p></div></div>${i<d.stops.length-1 && s.travelToNext?`<div class="travel">↳ Estimate · ${esc(s.travelToNext)}</div>`:''}`).join('')}</section>`).join('');
 $('alternatives').innerHTML=itinerary.omitted?.length ? `<h3>Keep these as alternatives</h3>${itinerary.omitted.map(p=>`<div class="alternative"><strong>${esc(p.name)}</strong><br>${esc(p.reason)}</div>`).join('')}` : '';
 $('review').innerHTML=`<strong>A little planning guidance</strong><p>${esc(itinerary.review?.verdict)}</p><p>${esc(itinerary.review?.fix)}</p>`;
 $('saveStatus').textContent=saved?'A copy of this draft was saved. Keep this page open to continue editing.':'Your draft is ready on this page. A server copy was not saved; keep the page open.';
}
$('editChoices').addEventListener('click',()=>{$('curation').focus();$('curation').scrollIntoView({block:'start'});});
renderInterests();renderIntensity();updateSummary();
