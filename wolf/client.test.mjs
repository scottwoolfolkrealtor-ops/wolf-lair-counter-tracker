import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./wolf.js',import.meta.url),'utf8');
const ACCESS='private-code-only-for-voice-unit-tests';
const KEY='wolfLairPrivateAccess1';
function setup({saved=new Map(),fetcher,storageBlocked=false}={}){
 const nodes=new Map(),recognizers=[],timers=new Map(),spoken=[],calls=[],docEvents=new Map(),pageEvents=new Map();
 let serial=0;const submissions=[],rowsByRecognition=new WeakMap();
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.value='';this.checked=false;this.open=false;this.textContent='';this.attrs={};}
  set innerHTML(value){this.html=value;for(const m of value.matchAll(/id="([^"]+)"/g)){if(!nodes.has(m[1]))nodes.set(m[1],new Node(m[1]));}get('wolfRemember').checked=true;get('wolfAutoSend').checked=true;get('wolfAccessSettings').open=true;}
  appendChild(n){this.children.push(n);return n;}
  replaceChildren(){this.children=[];}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  cloneNode(){return new Node(this.tag);}
  insertAdjacentElement(position,n){this.status=n;}
  showModal(){this.open=true;}
  requestSubmit(){const pending=this.onsubmit({preventDefault(){}});submissions.push(pending);}
  focus(){}
 }
 const get=id=>nodes.get(id);
 const game=new Node('game'),tracker=new Node('tracker'),askGame=new Node('askGame'),askTracker=new Node('askTracker');
 const document={
  hidden:false,body:new Node('body'),createElement:tag=>new Node(tag),
  getElementById:get,querySelector:sel=>sel==='.gameNavigation'?game:sel==='.trackerNavigation'?tracker:null,
  querySelectorAll:()=>[askGame,askTracker],addEventListener:(name,fn)=>docEvents.set(name,fn)
 };
 class Recognition{
  constructor(){recognizers.push(this);this.started=false;}
  start(){this.started=true;if(this.onstart)this.onstart();}
  abort(){this.aborted=true;}
 }
 const speech={cancel(){},getVoices:()=>[],speak:u=>spoken.push(u)};
 const window={
  SpeechRecognition:Recognition,speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  getWolfGameContext:()=>({selectedPlayerIndex:0,battlefieldComplete:false,players:[{index:0,name:'Scott',life:40,trackedCreatures:[]}]}),
  addEventListener:(name,fn)=>pageEvents.set(name,fn)
 };
 const context={
  window,document,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,
  localStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return saved.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');saved.set(k,v);},removeItem:k=>{if(storageBlocked)throw Error('blocked');saved.delete(k);}},
  fetch:async(url,init)=>{calls.push({url,init});return fetcher?fetcher(url,init):Response.json({answer:'A checked answer.',sources:[]});},
  setTimeout:(fn,delay)=>{let id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  AbortController,TextEncoder,URL,Set,Date,console
 };
 vm.runInNewContext(source,context);
 function runRestart(){for(const [id,t] of [...timers])if(t.delay===500){timers.delete(id);t.fn();}}
 const dialog=document.body.children[0];
 function result(words){const current=recognizers.at(-1),rows=rowsByRecognition.get(current)||[];const row=[{transcript:words}];row.isFinal=true;rows.push(row);rowsByRecognition.set(current,rows);current.onresult({resultIndex:rows.length-1,results:rows});}
 async function submit(){get('wolfQuestion').value='How do these counters work?';if(!get('wolfAccess').value)get('wolfAccess').value=ACCESS;return get('wolfQuestionForm').onsubmit({preventDefault(){}});}
 function runAuto(){for(const [id,t] of [...timers])if(t.delay===1400){timers.delete(id);t.fn();}}
 return {get,game,tracker,dialog,document,docEvents,pageEvents,askGame,recognizers,timers,spoken,calls,result,submit,runRestart,runAuto,submissions,wake:()=>game.children[0].onclick(),saved};
}
test('valid code persists across visits, forget removes it and no listening starts by itself',async()=>{
 const x=setup();await x.submit();assert.equal(x.saved.get(KEY),ACCESS);
 const y=setup({saved:x.saved});assert.equal(y.get('wolfAccess').value,ACCESS);assert.equal(y.get('wolfAccessSettings').open,false);assert.equal(y.recognizers.length,0);
 y.get('wolfForget').onclick();assert.equal(x.saved.has(KEY),false);assert.equal(y.get('wolfAccess').value,'');
});
test('unchecking remember removes a saved code and does not save the next successful request',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.get('wolfRemember').checked=false;x.get('wolfRemember').onchange.call(x.get('wolfRemember'));await x.submit();assert.equal(x.saved.has(KEY),false);
});
test('wake phrase opens chat from battlefield and survives close without a saved code',()=>{
 const x=setup();assert.equal(x.dialog.open,false);x.wake();assert.equal(x.dialog.open,false);
 x.recognizers[0].onend();x.runRestart();assert.equal(x.recognizers.length,2);
 x.result('Hey Wolf how does landfall work');assert.equal(x.dialog.open,true);assert.equal(x.get('wolfQuestion').value,'how does landfall work');
 x.dialog.open=false;x.dialog.handlers.close();assert.equal(x.recognizers.at(-1).aborted,undefined);
 x.result('hey wolf another question');assert.equal(x.dialog.open,true);assert.equal(x.get('wolfQuestion').value,'another question');assert.equal(x.calls.length,0);
});
test('paid request and playback pause microphone, then listening resumes after playback',async()=>{
 let finish;const x=setup({fetcher:()=>new Promise(resolve=>{finish=resolve;})});x.wake();x.result('Hey Wolf check my counters');
 x.get('wolfAutoRead').checked=true;const pending=x.submit();assert.equal(x.recognizers[0].aborted,true);assert.equal(x.game.children[0].textContent,'Disable Hey Wolf');
 finish(Response.json({answer:'Counters double.',sources:[]}));await pending;assert.equal(x.spoken.length,1);
 x.runRestart();assert.equal(x.recognizers.length,1);
 x.spoken[0].onend();x.runRestart();assert.equal(x.recognizers.length,2);
 assert.equal(x.calls[0].init.headers.Authorization,'Bearer '+ACCESS);assert.ok(!x.calls[0].init.body.includes(ACCESS));
});
test('permission denial and repeated immediate disconnects stop retries',()=>{
 const x=setup();x.wake();x.recognizers[0].onerror({error:'not-allowed'});x.runRestart();assert.equal(x.recognizers.length,1);assert.equal(x.game.children[0].textContent,'Enable Hey Wolf');
 const y=setup();y.wake();for(let i=0;i<3;i++){y.recognizers.at(-1).onend();y.runRestart();}assert.equal(y.recognizers.length,3);assert.equal(y.game.children[0].textContent,'Enable Hey Wolf');
});
test('backgrounding stops microphone and cancels pending restarts',()=>{
 const x=setup();x.wake();x.document.hidden=true;x.docEvents.get('visibilitychange')();assert.equal(x.recognizers[0].aborted,true);x.runRestart();assert.equal(x.recognizers.length,1);assert.equal(x.game.children[0].textContent,'Enable Hey Wolf');
});
test('invalid saved credential is removed; blocked storage does not block chat',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>Response.json({error:'Invalid code'},{status:401})});await x.submit();assert.equal(x.saved.has(KEY),false);assert.equal(x.get('wolfAccessSettings').open,true);
 const y=setup({storageBlocked:true});await y.submit();assert.match(y.get('wolfStatus').textContent,/could not remember/);assert.equal(y.calls.length,1);
});


test('spoken wake question sends after pause once, even if recognition ends first',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf how many counters');
 assert.equal(x.calls.length,0);
 const rec=x.recognizers.at(-1);rec.onend();x.runRestart();assert.equal(x.recognizers.length,1);
 x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.calls.length,1);assert.equal(JSON.parse(x.calls[0].init.body).question,'how many counters');
 assert.match(x.get('wolfStatus').textContent,/Answer received/);assert.equal(x.spoken.length,1);
 x.runAuto();assert.equal(x.calls.length,1);
});
test('wake phrase without a question or without a code never sends',()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf');x.runAuto();assert.equal(x.calls.length,0);
 const y=setup();y.wake();y.result('Hey Wolf how many counters');y.runAuto();assert.equal(y.calls.length,0);assert.match(y.get('wolfStatus').textContent,/private access code/);
});
test('interim speech delays sending and final speech includes the continuation',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf does this trigger');
 const rec=x.recognizers.at(-1);const interim=[{transcript:'when my token enters'}];interim.isFinal=false;
 rec.onresult({resultIndex:1,results:[[{transcript:'Hey Wolf does this trigger'}],interim]});x.runAuto();assert.equal(x.calls.length,0);
 x.result('when my token enters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.calls.length,1);assert.equal(JSON.parse(x.calls[0].init.body).question,'does this trigger when my token enters');
});
test('typing, disabling automatic send or stopping voice cancels a queued spoken question',()=>{
 for(const action of ['edit','disable','stop']){
  const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf how many counters');
  if(action==='edit')x.get('wolfQuestion').handlers.input();
  if(action==='disable'){x.get('wolfAutoSend').checked=false;x.get('wolfAutoSend').onchange.call(x.get('wolfAutoSend'));}
  if(action==='stop')x.get('wolfStop').onclick();
  x.runAuto();assert.equal(x.calls.length,0);
 }
});
test('backend limit error is visible, preserves question and is not retried',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>Response.json({error:'Private test limit reached'},{status:429})});
 x.wake();x.result('Hey Wolf how many counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.calls.length,1);assert.match(x.get('wolfStatus').textContent,/limit reached/);assert.equal(x.get('wolfQuestion').value,'how many counters');
 x.runRestart();x.runAuto();assert.equal(x.calls.length,1);
});

test('a question spoken after a separate wake phrase survives a recognition restart',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf');
 x.recognizers.at(-1).onend();x.runRestart();x.result('does Railway Brawler count tokens');
 x.runAuto();await Promise.all(x.submissions);assert.equal(x.calls.length,1);
 assert.equal(JSON.parse(x.calls[0].init.body).question,'does Railway Brawler count tokens');
});
test('closing chat cancels a queued automatic question',()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf how many counters');
 x.dialog.open=false;x.dialog.handlers.close();x.runAuto();assert.equal(x.calls.length,0);
});
