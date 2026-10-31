import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup() {
  const intervals=new Map(), timers=new Map(), events=[], sources=[];let seq=0,requests=0;
  class Source { constructor(url){this.url=url;this.handlers={};sources.push(this);} addEventListener(name,cb){this.handlers[name]=cb;} close(){this.closed=true;} }
  const context={console:{info(){},warn(){}},URL,AbortController,
    window:{location:{hostname:'dashboard.example',href:'https://dashboard.example/'}},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},EventSource:Source,
    setInterval(cb){const id=++seq;intervals.set(id,cb);return id;},clearInterval(id){intervals.delete(id);},
    setTimeout(cb){const id=++seq;timers.set(id,cb);return id;},clearTimeout(id){timers.delete(id);},
    fetch:async()=>{requests++;throw new Error('offline');}};
  const source=fs.readFileSync(new URL('../src/services/api.js',import.meta.url),'utf8')
    .replace('import.meta.env.VITE_API_BASE_URL',"'https://majismart-api.onrender.com/api'")
    .replace('export const api =','globalThis.api =');
  vm.runInNewContext(source,context);
  return {context,intervals,timers,sources,events,requests:()=>requests};
}
test('SSE failure activates polling, reconnect catches up and cleanup closes timers',()=>{
 const h=setup();const statuses=[];
 const off=h.context.api.subscribeRealtime((event,data)=>h.events.push([event,data]),{onStatus:s=>statuses.push(s)});
 assert.equal(h.sources[0].url,'https://majismart-api.onrender.com/api/realtime/stream');
 h.sources[0].onerror();assert.equal(statuses.at(-1),'polling');assert.equal(h.sources[0].closed,true);
 for(const cb of h.intervals.values())cb();assert.equal(h.events.at(-1)[0],'SYNC');
 const retry=[...h.timers.values()][0];h.timers.clear();retry();
 h.sources[1].onopen();assert.equal(statuses.at(-1),'live');assert.equal(h.intervals.size,0);assert.equal(h.events.at(-1)[0],'SYNC');
 h.sources[1].handlers.NEW_READING({data:JSON.stringify({data:{simulated:true}})});
 assert.equal(h.events.at(-1)[1].simulated,true);
 off();assert.equal(h.sources[1].closed,true);assert.equal(h.intervals.size,0);assert.equal(h.timers.size,0);
});
test('failed mutations are never silently retried',async()=>{
 const h=setup();const res=await h.context.api.post('/reports',{title:'TEST ONLY'});
 assert.equal(res.success,false);assert.equal(h.requests(),1);assert.equal(h.timers.size,0);
});
