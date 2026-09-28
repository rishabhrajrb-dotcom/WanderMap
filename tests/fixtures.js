export const suggestions = [
 {id:'p1',name:'Alfama',category:'Culture',area:'Lisbon',offers:'Wander through narrow lanes and discover small squares.',why:'Adds an unhurried neighbourhood walk between bigger sights.',tradeoff:'Steep streets and cobblestones can make walking tiring.',duration:'1–2 hours, estimated',highlightReason:'A distinctive introduction to the old city.',fromNotes:false},
 {id:'p2',name:'Jardim da Estrela',category:'Nature',area:'Estrela',offers:'Take a quiet break among gardens and shaded paths.',why:'Leaves space to recharge during a fuller day.',tradeoff:'Allow extra travel time if you are exploring the eastern side of the city.',duration:'45–60 minutes, estimated',highlightReason:'',fromNotes:false},
 {id:'p3',name:'Museu Nacional do Azulejo',category:'Culture',area:'Madre de Deus',offers:'Explore Portuguese tile design and its history.',why:'Adds a focused cultural experience to your city walks.',tradeoff:'Check opening days and allow time to reach the museum.',duration:'1–2 hours, estimated',highlightReason:'A focused look at a characteristic Portuguese art form.',fromNotes:false}
];
export function geminiReply(prompt) {
 const input=JSON.parse(prompt.split('\n').find(line=>line.startsWith('{')));
 if(!input.preferences)return {places:suggestions};
 const {preferences:p,places}=input;
 return {title:p.destination+', at your own pace',days:Array.from({length:p.days},(_,i)=>({
  day:i+1,theme:i===0?'Explore, then slow down':'A little room to wander',
  guidance:'Leave a lunch break and free time between activities. Confirm all travel times.',
  stops:places.filter((_,j)=>j%p.days===i).map((place,j)=>({
   placeId:place.id,time:String(Number(p.startTime.slice(0,2))+j*2).padStart(2,'0')+':'+p.startTime.slice(3),
   whatToDo:'Take time to explore this place.',why:'Fits your chosen interests.',duration:'About one hour, estimated',
   travelToNext:'Allow travel time; check directions before leaving.'
  }))
 })),omitted:[],review:{verdict:'A flexible starting point.',fix:'Check opening hours and commute details before travel.'}};
}
