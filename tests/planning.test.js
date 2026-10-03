import test from 'node:test';
import assert from 'node:assert/strict';
import {readProfile,normalizePlaces,validateItinerary} from '../lib/planning.js';
import extract from '../api/extract.js';
import plan from '../api/plan.js';
import {geminiReply,suggestions} from './fixtures.js';
const base={destination:'Lisbon',days:2,intensity:'Medium',dayIntensity:['Low','High'],startTime:'10:00',walking:'Light',interests:['Nature'],notes:'Avoid steep walks'};
const selected=[{id:'p1',name:'Alfama',priority:'must'},{id:'p2',name:'Garden',priority:'optional'}];
const profile=()=>readProfile({...base,places:selected});
const draft=()=>geminiReply('Data\n'+JSON.stringify({preferences:profile(),places:selected}));
const invoke=async(handler,body,method='POST')=>{
 const result={statusCode:200,status(c){this.statusCode=c;return this;},json(value){this.body=value;return this;}};
 await handler({method,body},result);return result;
};
test('per-day intensity and accessibility preferences survive normalization',()=>{
 const p=profile();assert.deepEqual(p.dayIntensity,['Low','High']);assert.equal(p.walking,'Light');assert.equal(p.startTime,'10:00');
 assert.throws(()=>readProfile({...base,days:100}));assert.throws(()=>readProfile(null));assert.throws(()=>readProfile('{bad'));
 assert.equal(readProfile({destination:'Lisbon',pace:'Relaxed'}).intensity,'Low');
});
test('skips are removed, and malformed choices are rejected',()=>{
 assert.deepEqual(normalizePlaces([...selected,{id:'p3',name:'Skipped',priority:'skip'}]),selected.map(p=>({...p,area:'',category:''})));
 assert.throws(()=>normalizePlaces([{id:'a',name:''}]));assert.throws(()=>normalizePlaces([...selected,selected[0]]));
 assert.throws(()=>normalizePlaces([{name:'Skip',priority:'skip'}]));
});
test('must-sees cannot disappear or be replaced by hallucinated stops',()=>{
 const d=draft();d.days[0].stops=[];assert.throws(()=>validateItinerary(d,selected,profile()));
 const unknown=draft();unknown.days[0].stops[0].placeId='invented';assert.throws(()=>validateItinerary(unknown,selected,profile()));
 const repeated=draft();repeated.days[1].stops.push(repeated.days[0].stops[0]);assert.throws(()=>validateItinerary(repeated,selected,profile()));
});
test('optional omissions are explained and names come from user selections',()=>{
 const d=draft();d.days[1].stops=[];d.days[0].stops[0].name='Wrong name';
 const output=validateItinerary(d,selected,profile());
 assert.equal(output.days[0].stops[0].name,'Alfama');assert.equal(output.omitted[0].name,'Garden');assert.ok(output.omitted[0].reason);
 assert.deepEqual(output.preferences.dayIntensity,['Low','High']);assert.match(output.verification,/not been checked/);
});
test('invalid dates, early starts and reversed times are rejected',()=>{
 const d=draft();d.days[0].stops[0].time='09:00';assert.throws(()=>validateItinerary(d,selected,profile()));
 const wrongDay=draft();wrongDay.days[1].day=1;assert.throws(()=>validateItinerary(wrongDay,selected,profile()));
 const invalid=draft();invalid.days[0].stops[0].time='28:00';assert.throws(()=>validateItinerary(invalid,selected,profile()));
});
test('handler flow passes preferences to AI and stores validated choices',async(t)=>{
 const prior={key:process.env.GEMINI_API_KEY,url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY};
 process.env.GEMINI_API_KEY='test';process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='test-secret';
 t.after(()=>{for(const [key,value]of Object.entries({GEMINI_API_KEY:prior.key,SUPABASE_URL:prior.url,SUPABASE_SECRET_KEY:prior.secret})){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 let prompts=[],saved;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).endsWith('/rest/v1/trips')){saved=JSON.parse(options.body);return new Response(null,{status:201});}
  if(String(url).includes('/rest/v1/'))return new Response(null,{status:201,headers:{'content-range':'0-0/0'}});
  const request=JSON.parse(options.body),prompt=request.contents[0].parts.at(-1).text;prompts.push(prompt);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(geminiReply(prompt))}]}}]});
 });
 const found=await invoke(extract,{...base,email:'private@example.com'});assert.equal(found.statusCode,200);assert.equal(found.body.places.length,3);
 assert.match(prompts[0],/Nature/);assert.match(prompts[0],/Avoid steep walks/);assert.doesNotMatch(prompts[0],/private@example.com/);
 const result=await invoke(plan,{...base,email:'private@example.com',places:[...selected,{id:'p3',name:'Never include',priority:'skip'}]});
 assert.equal(result.statusCode,200);assert.equal(result.body.saved,true);assert.equal(saved.pace,'Medium');
 assert.deepEqual(saved.trip.preferences.dayIntensity,['Low','High']);assert.equal(saved.trip.choices.length,2);
 assert.doesNotMatch(prompts[1],/Never include|private@example.com/);
 assert.equal((await invoke(plan,base,'GET')).statusCode,405);
});
test('quota errors and malformed AI output are recoverable without leaking details',async(t)=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test';
 t.after(()=>{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;});
 t.mock.method(globalThis,'fetch',async()=>new Response('secret provider message',{status:429}));
 const quota=await invoke(extract,base);assert.equal(quota.statusCode,429);assert.doesNotMatch(quota.body.error,/secret/);
 globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'not json'}]}}]});
 assert.equal((await invoke(plan,{...base,places:selected})).statusCode,502);
});
test('storage failure still returns a usable draft',async(t)=>{
 const keys=['GEMINI_API_KEY','SUPABASE_URL','SUPABASE_SECRET_KEY'],before=keys.map(k=>process.env[k]);
 [process.env.GEMINI_API_KEY,process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY]=['test','https://example.invalid','test'];
 t.after(()=>keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];}));
 t.mock.method(globalThis,'fetch',async(url,options)=>String(url).includes('/rest/v1/')?new Response(null,{status:503}):Response.json({candidates:[{content:{parts:[{text:JSON.stringify(geminiReply(JSON.parse(options.body).contents[0].parts[0].text))}]}}]}));
 const result=await invoke(plan,{...base,places:selected});assert.equal(result.statusCode,200);assert.equal(result.body.saved,false);assert.ok(result.body.itinerary.days.length);
});
