import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./wolf.js',import.meta.url),'utf8');
const accessSource=readFileSync(new URL('./private-access.js',import.meta.url),'utf8');
const ACCESS='private-code-only-for-voice-unit-tests';
const KEY='wolfLairPrivateAccess1';
function setup({saved=new Map(),fetcher,storageBlocked=false,storageDropsWrites=false,indexedDB,legacyMarkup=false,helperLoadFails=false,requiresSpeechGesture=false}={}){
 const nodes=new Map(),recognizers=[],timers=new Map(),spoken=[],greetings=[],calls=[],docEvents=new Map(),pageEvents=new Map();
 let gesture=false,unlocked=false;
 function userGesture(fn){gesture=true;try{return fn();}finally{gesture=false;}}
 let serial=0;const submissions=[],rowsByRecognition=new WeakMap();
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.handlers={};this.value='';this.checked=false;this.open=false;this.textContent='';this.attrs={};}
  set innerHTML(value){this.html=value;for(const m of value.matchAll(/id="([^"]+)"/g)){if(!nodes.has(m[1]))nodes.set(m[1],new Node(m[1]));}for(const m of value.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*\bchecked\b[^>]*>/g))get(m[1]).checked=true;if(value.includes('id="wolfAccessSettings"'))get('wolfAccessSettings').open=true;}
  appendChild(n){this.children.push(n);return n;}
  replaceChildren(){this.children=[];}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  cloneNode(){return new Node(this.tag);}
  insertAdjacentElement(position,n){if(n.className?.includes('wolfAccessNotice'))this.accessNotice=n;else this.status=n;}
  showModal(){this.open=true;}
  close(){this.open=false;if(this.handlers.close)this.handlers.close();}
  requestSubmit(){const pending=this.onsubmit({preventDefault(){}});submissions.push(pending);}
  focus(){}
 }
 const get=id=>nodes.get(id);
 const game=new Node('game'),tracker=new Node('tracker'),askGame=new Node('askGame'),askTracker=new Node('askTracker');
 const document={
  hidden:false,head:new Node('head'),body:new Node('body'),createElement:tag=>new Node(tag),
  getElementById:get,querySelector:sel=>sel==='.gameNavigation'?game:sel==='.trackerNavigation'?tracker:null,
  querySelectorAll:()=>[askGame,askTracker],addEventListener:(name,fn)=>docEvents.set(name,fn)
 };
 class Recognition{
  constructor(){recognizers.push(this);this.started=false;}
  start(){this.started=true;if(this.onstart)this.onstart();}
  abort(){this.aborted=true;}
 }
 const speech={autoStart:true,autoEndGreeting:true,cancelCount:0,resumeCount:0,paused:false,cancel(){this.cancelCount++;},resume(){this.resumeCount++;this.paused=false;},getVoices:()=>[],speak(u){
  const welcome=u.text==='Wolf is ready.';(welcome?greetings:spoken).push(u);
  if(requiresSpeechGesture&&!unlocked&&!gesture)return;
  if(gesture)unlocked=true;
  if(this.autoStart&&u.onstart)u.onstart();
  if(welcome&&this.autoEndGreeting&&u.onend)u.onend();
 }};
 const window={
  indexedDB,
  SpeechRecognition:Recognition,speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
  getWolfGameContext:()=>({selectedPlayerIndex:2,battlefieldComplete:false,players:[{index:0,name:'Scott',life:40,trackedCreatures:[]}]}),
  addEventListener:(name,fn)=>pageEvents.set(name,fn)
 };
 const context={
  window,document,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,
  localStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return saved.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');if(!storageDropsWrites)saved.set(k,v);},removeItem:k=>{if(storageBlocked)throw Error('blocked');saved.delete(k);}},
  fetch:async(url,init)=>{calls.push({url,init});return fetcher?fetcher(url,init):Response.json({answer:'A checked answer.',sources:[]});},
  setTimeout:(fn,delay)=>{let id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  AbortController,TextEncoder,URL,Set,Date,console
 };
 if(legacyMarkup){
  vm.runInNewContext(source,context);
  if(helperLoadFails)document.head.children[0].onerror();
  else{vm.runInNewContext(accessSource,context);document.head.children[0].onload();}
 }else{vm.runInNewContext(accessSource,context);vm.runInNewContext(source,context);}
 function runRestart(){for(const [id,t] of [...timers])if(t.delay===500){timers.delete(id);t.fn();}}
 const dialog=document.body.children[0];
 function result(words){const current=recognizers.at(-1),rows=rowsByRecognition.get(current)||[];const row=[{transcript:words}];row.isFinal=true;rows.push(row);rowsByRecognition.set(current,rows);current.onresult({resultIndex:rows.length-1,results:rows});}
 async function submit(){get('wolfQuestion').value='How do these counters work?';if(!get('wolfAccess').value)get('wolfAccess').value=ACCESS;return userGesture(()=>get('wolfQuestionForm').onsubmit({preventDefault(){}}));}
 function runAuto(){for(const [id,t] of [...timers])if(t.delay===1400){timers.delete(id);t.fn();}}
 const accessDialog=document.body.children[1];
 function saveVoice(code=ACCESS,remember=true){get('wolfVoiceAccessCode').value=code;get('wolfVoiceRemember').checked=remember;userGesture(()=>get('wolfVoiceAccessForm').onsubmit({preventDefault(){}}));}
 function runSpeechTimer(delay){for(const [id,t] of [...timers])if(t.delay===delay){timers.delete(id);t.fn();}}
 return {get,game,tracker,dialog,accessDialog,document,docEvents,pageEvents,askGame,recognizers,timers,speech,spoken,greetings,calls,result,submit,saveVoice,runRestart,runAuto,runSpeechTimer,submissions,wake:()=>userGesture(()=>game.children[0].onclick()),saved,access:window.WolfPrivateAccess};
}
test('valid code persists across visits, forget removes it and no listening starts by itself',async()=>{
 const x=setup();await x.submit();assert.equal(x.saved.get(KEY),ACCESS);
 const y=setup({saved:x.saved});assert.equal(y.get('wolfAccess').value,ACCESS);assert.equal(y.get('wolfAccessSettings').open,false);assert.equal(y.recognizers.length,0);
 y.get('wolfForget').onclick();assert.equal(x.saved.has(KEY),false);assert.equal(y.get('wolfAccess').value,'');
});
test('unchecking remember removes a saved code and does not save the next successful request',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.get('wolfRemember').checked=false;x.get('wolfRemember').onchange.call(x.get('wolfRemember'));await x.submit();assert.equal(x.saved.has(KEY),false);
});
test('first voice setup saves code before listening or making a paid request, and bypasses setup on return',()=>{
 const x=setup();assert.equal(x.dialog.open,false);x.wake();assert.equal(x.dialog.open,false);
 assert.equal(x.accessDialog.open,true);assert.equal(x.recognizers.length,0);assert.equal(x.calls.length,0);
 x.saveVoice();assert.equal(x.accessDialog.open,false);assert.equal(x.get('wolfVoiceAccessCode').value,'');assert.equal(x.saved.get(KEY),ACCESS);assert.equal(x.recognizers.length,1);assert.equal(x.calls.length,0);
 x.recognizers[0].onend();x.runRestart();assert.equal(x.recognizers.length,2);
 x.result('Hey Wolf how does landfall work');assert.equal(x.dialog.open,false);assert.equal(x.get('wolfQuestion').value,'how does landfall work');
 x.dialog.open=false;x.dialog.handlers.close();assert.equal(x.recognizers.at(-1).aborted,undefined);
 x.result('hey wolf another question');assert.equal(x.dialog.open,false);assert.equal(x.get('wolfQuestion').value,'another question');assert.equal(x.calls.length,0);
 const y=setup({saved:x.saved});y.wake();assert.equal(y.accessDialog.open,false);assert.equal(y.dialog.open,false);assert.equal(y.recognizers.length,1);
});
test('paid request and playback pause microphone, then listening resumes after playback',async()=>{
 let finish;const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>new Promise(resolve=>{finish=resolve;})});x.wake();x.result('Hey Wolf check my counters');
 x.get('wolfAutoRead').checked=true;const pending=x.submit();assert.equal(x.recognizers[0].aborted,true);assert.equal(x.game.children[0].attrs['aria-pressed'],'true');
 finish(Response.json({answer:'Counters double.',sources:[]}));await pending;assert.equal(x.spoken.length,1);
 x.runRestart();assert.equal(x.recognizers.length,1);
 x.spoken[0].onend();x.runRestart();assert.equal(x.recognizers.length,2);
 assert.equal(x.calls[0].init.headers.Authorization,'Bearer '+ACCESS);assert.ok(!x.calls[0].init.body.includes(ACCESS));
});
test('permission denial and repeated immediate disconnects stop retries',()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.recognizers[0].onerror({error:'not-allowed'});x.runRestart();assert.equal(x.recognizers.length,1);assert.equal(x.game.children[0].attrs['aria-pressed'],'false');
 const y=setup({saved:new Map([[KEY,ACCESS]])});y.wake();for(let i=0;i<3;i++){y.recognizers.at(-1).onend();y.runRestart();}assert.equal(y.recognizers.length,3);assert.equal(y.game.children[0].attrs['aria-pressed'],'false');
});
test('backgrounding stops microphone and cancels pending restarts',()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.document.hidden=true;x.docEvents.get('visibilitychange')();assert.equal(x.recognizers[0].aborted,true);x.runRestart();assert.equal(x.recognizers.length,1);assert.equal(x.game.children[0].attrs['aria-pressed'],'false');
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
 const y=setup();y.wake();y.runAuto();assert.equal(y.calls.length,0);assert.equal(y.recognizers.length,0);assert.equal(y.accessDialog.open,true);
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

test('voice answer stays on battlefield, uses active player and lights up for each phase',async()=>{
 let finish;const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>new Promise(resolve=>{finish=resolve;})});
 x.wake();assert.equal(x.game.children[0].attrs['data-state'],'listening');
 x.result('Hey Wolf does my Hydra double');assert.equal(x.dialog.open,false);
 x.runAuto();assert.equal(x.game.children[0].attrs['data-state'],'thinking');
 assert.equal(JSON.parse(x.calls[0].init.body).context.selectedPlayerIndex,2);
 finish(Response.json({answer:'Your counters double.',sources:[]}));await Promise.all(x.submissions);
 assert.equal(x.dialog.open,false);assert.equal(x.spoken.length,1);
 assert.equal(x.game.children[0].attrs['data-state'],'speaking');
 x.spoken[0].onend();x.runRestart();
 assert.equal(x.game.children[0].attrs['data-state'],'listening');
});
test('turning voice off while waiting suppresses the eventual spoken answer',async()=>{
 let finish;const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>new Promise(resolve=>{finish=resolve;})});
 x.wake();x.result('Hey Wolf check this play');x.runAuto();x.get('wolfStop').onclick();
 finish(Response.json({answer:'A delayed answer.',sources:[]}));await Promise.all(x.submissions);
 assert.equal(x.spoken.length,0);assert.equal(x.dialog.open,false);assert.equal(x.game.children[0].attrs['aria-pressed'],'false');
});
test('voice error is read aloud without opening chat',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>Response.json({error:'Private test limit reached'},{status:429})});
 x.wake();x.result('Hey Wolf check my trigger');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.dialog.open,false);assert.equal(x.spoken.length,1);assert.match(x.spoken[0].text,/limit reached/);
});

test('cancelling or leaving access setup blank never starts a microphone or opens chat',()=>{
 const x=setup();x.wake();x.saveVoice('   ');assert.equal(x.accessDialog.open,true);assert.match(x.get('wolfVoiceAccessStatus').textContent,/Enter/);
 assert.equal(x.recognizers.length,0);assert.equal(x.calls.length,0);
 x.get('wolfVoiceAccessCancel').onclick();assert.equal(x.accessDialog.open,false);assert.equal(x.dialog.open,false);assert.equal(x.saved.has(KEY),false);
});
test('voice setup can keep access for this visit without persisting it',()=>{
 const x=setup();x.wake();x.saveVoice(ACCESS,false);assert.equal(x.get('wolfAccess').value,ACCESS);assert.equal(x.saved.has(KEY),false);assert.equal(x.recognizers.length,1);
 x.get('wolfStop').onclick();x.wake();assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,2);
 const y=setup({saved:x.saved});y.wake();assert.equal(y.accessDialog.open,true);assert.equal(y.recognizers.length,0);
});
test('entering an access code in chat remembers it without requiring an answer',()=>{
 const x=setup();x.get('wolfAccess').value=ACCESS;x.get('wolfAccess').handlers.change.call(x.get('wolfAccess'));
 assert.equal(x.saved.get(KEY),ACCESS);assert.equal(x.calls.length,0);
 const y=setup({saved:x.saved});y.wake();assert.equal(y.accessDialog.open,false);assert.equal(y.recognizers.length,1);
});
test('voice finds a code saved by another page after the battlefield loaded',()=>{
 const saved=new Map(),x=setup({saved});saved.set(KEY,ACCESS);x.wake();
 assert.equal(x.get('wolfAccess').value,ACCESS);assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,1);
});
test('invalid code stops wake listening, removes credentials and offers setup on the next tap',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>Response.json({error:'Invalid access code'},{status:401})});
 x.wake();x.result('Hey Wolf check this play');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.saved.has(KEY),false);assert.equal(x.get('wolfAccess').value,'');assert.equal(x.dialog.open,false);
 x.spoken[0].onend();x.runRestart();assert.equal(x.recognizers.length,1);
 x.wake();assert.equal(x.accessDialog.open,true);assert.equal(x.calls.length,1);
});
test('blocked browser storage still allows voice with the code for this visit',async()=>{
 const x=setup({storageBlocked:true});x.wake();x.saveVoice();assert.equal(x.recognizers.length,1);assert.equal(x.accessDialog.open,false);
 x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);assert.equal(x.calls.length,1);assert.equal(x.spoken.length,1);
 assert.match(x.get('wolfStatus').textContent,/could not remember/);
});

const testPageSource=readFileSync(new URL('../wolf-test.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function setupTestPage(saved,fetcher=()=>Response.json({answer:'A checked answer.',sources:[]}),{indexedDB,storageBlocked=false}={}){
 const nodes=new Map(['code','remember','forget','test','question','notes','send','accessStatus','status','answer','sources'].map(id=>[id,{value:'',textContent:'',checked:id==='remember',replaceChildren(){}}]));
 const context={
  window:{indexedDB,addEventListener(){}},
  document:{getElementById:id=>nodes.get(id)},
  localStorage:{getItem:k=>{if(storageBlocked)throw Error('blocked');return saved.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');saved.set(k,v);},removeItem:k=>{if(storageBlocked)throw Error('blocked');saved.delete(k);}},
  fetch:fetcher,AbortController,URL,Set,TypeError,setTimeout:()=>1,clearTimeout(){}
 };
 vm.runInNewContext(accessSource,context);vm.runInNewContext(testPageSource,context);
 return {get:id=>nodes.get(id),submit:()=>nodes.get('test').onsubmit({preventDefault(){}}),access:context.window.WolfPrivateAccess};
}
test('a successful remembered test-page answer supplies access to battlefield voice',async()=>{
 const saved=new Map(),page=setupTestPage(saved);page.get('code').value=ACCESS;page.get('question').value='How many counters?';await page.submit();
 const x=setup({saved});x.wake();assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,1);
 const revisit=setupTestPage(saved);assert.equal(revisit.get('code').value,ACCESS);
});
test('the test page respects forgetting and clears rejected credentials',async()=>{
 const saved=new Map([[KEY,ACCESS]]),page=setupTestPage(saved);page.get('remember').checked=false;page.get('remember').onchange.call(page.get('remember'));page.get('question').value='How many counters?';await page.submit();assert.equal(saved.has(KEY),false);
 saved.set(KEY,ACCESS);const rejected=setupTestPage(saved,()=>Response.json({error:'Invalid code'},{status:401}));rejected.get('question').value='How many counters?';await rejected.submit();assert.equal(saved.has(KEY),false);assert.equal(rejected.get('code').value,'');
});

test('voice activation prepares speech from the tap and waits for the greeting before listening',()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),requiresSpeechGesture:true});x.speech.autoEndGreeting=false;x.wake();
 assert.equal(x.greetings.length,1);assert.equal(x.greetings[0].text,'Wolf is ready.');assert.equal(x.game.children[0].attrs['data-state'],'speaking');assert.equal(x.recognizers.length,0);
 x.greetings[0].onend();assert.equal(x.recognizers.length,1);assert.equal(x.game.children[0].attrs['data-state'],'listening');assert.equal(x.calls.length,0);
});
test('an asynchronously received answer can speak after voice activation unlocks the engine',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),requiresSpeechGesture:true});x.wake();x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.spoken.length,1);assert.equal(x.game.children[0].attrs['data-state'],'speaking');assert.equal(x.dialog.open,false);assert.equal(x.calls.length,1);
});
test('saving the access code also prepares speech from that same user gesture',async()=>{
 const x=setup({requiresSpeechGesture:true});x.wake();x.saveVoice();x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.greetings.length,1);assert.equal(x.game.children[0].attrs['data-state'],'speaking');assert.equal(x.saved.get(KEY),ACCESS);
});
test('silent speech start recovers on the battlefield, and tapping replays without another paid request',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.speech.autoStart=false;x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.game.children[0].attrs['data-state'],'queued');assert.doesNotMatch(x.game.status.textContent,/Reading Wolf/);
 x.runSpeechTimer(4500);assert.equal(x.game.children[0].attrs['data-state'],'answer');assert.match(x.game.status.textContent,/answer is ready/);assert.equal(x.dialog.open,false);
 x.runRestart();assert.equal(x.recognizers.length,1);
 x.speech.autoStart=true;x.wake();assert.equal(x.spoken.length,2);assert.equal(x.spoken[1].text,x.spoken[0].text);assert.equal(x.calls.length,1);assert.equal(x.game.children[0].attrs['data-state'],'speaking');
 x.spoken[1].onend();x.runRestart();assert.equal(x.recognizers.length,2);assert.equal(x.dialog.open,false);
});
test('an end event without a start event does not pretend that audio played',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.speech.autoStart=false;x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);x.spoken[0].onend();
 assert.equal(x.game.children[0].attrs['data-state'],'answer');assert.match(x.game.status.textContent,/Tap Wolf/);x.runRestart();assert.equal(x.recognizers.length,1);
});
test('missing speech completion recovers and stale events cannot interrupt a replay',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 const staleEnd=x.spoken[0].onend;x.runSpeechTimer(10000);assert.equal(x.game.children[0].attrs['data-state'],'answer');x.wake();staleEnd();
 assert.equal(x.game.children[0].attrs['data-state'],'speaking');assert.equal(x.calls.length,1);
 x.spoken[1].onend();x.runRestart();assert.equal(x.recognizers.length,2);
});
test('replacing speech waits for cancellation to settle before queuing the new utterance',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.speech.autoEndGreeting=false;x.wake();await x.submit();
 assert.equal(x.spoken.length,0);assert.equal(x.speech.cancelCount,1);x.runSpeechTimer(150);assert.equal(x.spoken.length,1);assert.equal(x.game.children[0].attrs['data-state'],'speaking');
});
test('turning voice off cancels a delayed speech replacement',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.speech.autoEndGreeting=false;x.wake();await x.submit();x.get('wolfStop').onclick();x.runSpeechTimer(150);
 assert.equal(x.spoken.length,0);assert.equal(x.game.children[0].attrs['data-state'],'off');
});
test('a paused synthesis engine resumes before speaking and an idle engine is not canceled',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]])});x.wake();x.speech.paused=true;x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.speech.resumeCount,1);assert.equal(x.speech.cancelCount,0);assert.equal(x.game.children[0].attrs['data-state'],'speaking');
});
test('a backend error remains visible when error playback cannot start',async()=>{
 const x=setup({saved:new Map([[KEY,ACCESS]]),fetcher:()=>Response.json({error:'Private test limit reached'},{status:429})});x.wake();x.speech.autoStart=false;x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);x.runSpeechTimer(4500);
 assert.match(x.game.status.textContent,/Private test limit reached/);assert.equal(x.dialog.open,false);assert.equal(x.calls.length,1);
});
test('both voice buttons use the original wolf-head asset',()=>{
 const x=setup();for(const nav of [x.game,x.tracker]){const icon=nav.children[0].children[0];assert.equal(icon.textContent,'');assert.equal(icon.children[0].src,'./wolf/wolf-head.svg?v=9');}
});

// Exercise asynchronous transaction completion and aborts without a paid endpoint.
function indexedDatabase({code,blocked=false,abortWrites=false}={}){
 const records=new Map(code?[[KEY,code]]:[]),operations=[];
 const factory={open(){
  const request={};
  queueMicrotask(()=>{
   if(blocked){request.onblocked?.();return;}
   const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
    assert.equal(name,'credentials');const tx={};
    tx.objectStore=()=>({
     get(key){const r={};queueMicrotask(()=>{r.result=records.get(key);r.onsuccess?.();});return r;},
     put(value,key){operations.push('put');queueMicrotask(()=>{if(abortWrites)tx.onabort?.();else{records.set(key,value);tx.oncomplete?.();}});},
     delete(key){operations.push('delete');queueMicrotask(()=>{if(abortWrites)tx.onabort?.();else{records.delete(key);tx.oncomplete?.();}});}
    });return tx;
   }};
   request.result=db;request.onsuccess?.();
  });return request;
 }};
 return {factory,records,operations};
}
const settleAccess=()=>new Promise(resolve=>setImmediate(resolve));

test('a cleared password field cannot lose access during the current visit',async()=>{
 const x=setup({storageBlocked:true});x.wake();x.saveVoice();x.get('wolfStop').onclick();
 x.get('wolfAccess').value='';x.get('wolfAccess').handlers.change.call(x.get('wolfAccess'));x.wake();assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,2);
 x.result('Hey Wolf check my counters');x.runAuto();await Promise.all(x.submissions);
 assert.equal(x.calls.length,1);assert.equal(x.calls[0].init.headers.Authorization,'Bearer '+ACCESS);
});
test('a save that silently drops the value shows a warning on the battlefield',()=>{
 const x=setup({storageDropsWrites:true});x.wake();x.saveVoice();assert.equal(x.saved.has(KEY),false);
 assert.equal(x.access.state().status,'visit');assert.equal(x.game.accessNotice.hidden,false);
 assert.match(x.game.accessNotice.textContent,/could not remember/);assert.equal(x.recognizers.length,1);
});
test('the persistent backup restores voice access when ordinary saving is blocked',async()=>{
 const db=indexedDatabase(),x=setup({storageBlocked:true,indexedDB:db.factory});await x.access.ready;
 x.wake();x.saveVoice();assert.equal(x.access.state().status,'saving');assert.equal(x.calls.length,0);
 await settleAccess();assert.equal(db.records.get(KEY),ACCESS);assert.equal(x.access.state().status,'saved');
 assert.match(x.game.accessNotice.textContent,/saved in this browser/);
 const y=setup({storageBlocked:true,indexedDB:db.factory});await y.access.ready;y.wake();
 assert.equal(y.accessDialog.open,false);assert.equal(y.recognizers.length,1);assert.equal(y.calls.length,0);
});
test('an icon tap waits for restoration before offering setup and keeps speech activation on a tap',async()=>{
 const db=indexedDatabase({code:ACCESS}),x=setup({indexedDB:db.factory,requiresSpeechGesture:true});x.wake();
 assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,0);assert.match(x.game.status.textContent,/Restoring/);
 await x.access.ready;await settleAccess();assert.equal(x.accessDialog.open,false);assert.match(x.game.status.textContent,/Tap Wolf to listen/);
 x.wake();assert.equal(x.greetings.length,1);assert.equal(x.recognizers.length,1);assert.equal(x.calls.length,0);
});
test('an initial restoration with no code offers setup, but backgrounding cancels it',async()=>{
 const db=indexedDatabase(),x=setup({indexedDB:db.factory});x.wake();await x.access.ready;await settleAccess();
 assert.equal(x.accessDialog.open,true);assert.equal(x.recognizers.length,0);assert.equal(x.calls.length,0);
 const y=setup({indexedDB:db.factory});y.wake();y.document.hidden=true;y.docEvents.get('visibilitychange')();
 await y.access.ready;await settleAccess();assert.equal(y.accessDialog.open,false);assert.equal(y.recognizers.length,0);
});
test('blocked or aborted backup saving never claims the code was remembered',async()=>{
 for(const db of [indexedDatabase({blocked:true}),indexedDatabase({abortWrites:true})]){
  const x=setup({storageBlocked:true,indexedDB:db.factory});await x.access.ready;x.wake();x.saveVoice();await settleAccess();
  assert.equal(x.access.state().status,'visit');assert.match(x.game.accessNotice.textContent,/could not remember/);
  x.get('wolfAccess').value='';x.get('wolfStop').onclick();x.wake();assert.equal(x.accessDialog.open,false);
 }
});
test('late restoration cannot replace a newly entered code',async()=>{
 const db=indexedDatabase({code:'older-private-test-code'}),x=setup({indexedDB:db.factory});x.saveVoice(ACCESS);
 await x.access.ready;await settleAccess();assert.equal(x.access.get(),ACCESS);assert.equal(db.records.get(KEY),ACCESS);
});
test('forgetting while a backup save is pending removes every saved copy',async()=>{
 const db=indexedDatabase(),x=setup({indexedDB:db.factory});x.saveVoice();x.get('wolfForget').onclick();
 await x.access.ready;await settleAccess();assert.equal(x.access.get(),'');assert.equal(x.saved.has(KEY),false);assert.equal(db.records.has(KEY),false);
 const y=setup({saved:x.saved,indexedDB:db.factory});await y.access.ready;y.wake();assert.equal(y.accessDialog.open,true);
});
test('disabling remember removes the persistent backup and retains access only for this visit',async()=>{
 const db=indexedDatabase({code:ACCESS}),x=setup({indexedDB:db.factory});await x.access.ready;
 x.get('wolfRemember').checked=false;x.get('wolfRemember').onchange.call(x.get('wolfRemember'));await settleAccess();
 assert.equal(x.access.get(),ACCESS);assert.equal(x.saved.has(KEY),false);assert.equal(db.records.has(KEY),false);
 const y=setup({indexedDB:db.factory});await y.access.ready;y.wake();assert.equal(y.accessDialog.open,true);
});
test('rejected access is removed from the backup and cannot return after a reload',async()=>{
 const db=indexedDatabase({code:ACCESS}),x=setup({indexedDB:db.factory,fetcher:()=>Response.json({error:'Invalid code'},{status:401})});
 await x.access.ready;x.wake();x.result('Hey Wolf check this play');x.runAuto();await Promise.all(x.submissions);await settleAccess();
 assert.equal(x.calls.length,1);assert.equal(x.access.get(),'');assert.equal(x.saved.has(KEY),false);assert.equal(db.records.has(KEY),false);
 const y=setup({saved:x.saved,indexedDB:db.factory});await y.access.ready;y.wake();assert.equal(y.accessDialog.open,true);
});
test('access entered on the test page is backed up before any answer and shared with the battlefield',async()=>{
 const db=indexedDatabase(),saved=new Map(),page=setupTestPage(saved,undefined,{indexedDB:db.factory,storageBlocked:true});
 await page.access.ready;page.get('code').value=ACCESS;page.get('code').onchange.call(page.get('code'));await settleAccess();
 assert.equal(db.records.get(KEY),ACCESS);assert.match(page.get('accessStatus').textContent,/saved/);
 const x=setup({storageBlocked:true,indexedDB:db.factory});await x.access.ready;x.wake();assert.equal(x.accessDialog.open,false);assert.equal(x.calls.length,0);
});
test('forgetting from another page clears the active access and persistent backup',async()=>{
 const db=indexedDatabase({code:ACCESS}),x=setup({saved:new Map([[KEY,ACCESS]]),indexedDB:db.factory});await x.access.ready;
 x.pageEvents.get('storage')({key:KEY,newValue:null});await settleAccess();assert.equal(x.access.get(),'');assert.equal(db.records.has(KEY),false);
 assert.equal(x.get('wolfAccess').value,'');x.wake();assert.equal(x.accessDialog.open,true);assert.equal(x.calls.length,0);
});
test('an older cached page loads the access helper before initializing voice',()=>{
 const x=setup({legacyMarkup:true,saved:new Map([[KEY,ACCESS]])});
 assert.equal(x.document.head.children.length,1);assert.equal(x.document.head.children[0].src,'./wolf/private-access.js?v=10');
 x.wake();assert.equal(x.accessDialog.open,false);assert.equal(x.recognizers.length,1);assert.equal(x.calls.length,0);
});
test('a missing access helper displays a recovery message without starting voice or an API request',()=>{
 const x=setup({legacyMarkup:true,helperLoadFails:true});assert.match(x.game.status.textContent,/Refresh/);
 assert.equal(x.recognizers.length,0);assert.equal(x.calls.length,0);assert.equal(x.document.body.children.length,0);
});
test('test-page password clearing keeps saved access, and explicit forgetting removes it',async()=>{
 const saved=new Map([[KEY,ACCESS]]),db=indexedDatabase({code:ACCESS}),page=setupTestPage(saved,undefined,{indexedDB:db.factory});
 await page.access.ready;page.get('code').value='';page.get('code').onchange.call(page.get('code'));
 assert.equal(page.access.get(),ACCESS);assert.equal(saved.get(KEY),ACCESS);
 page.get('forget').onclick();await settleAccess();assert.equal(page.access.get(),'');assert.equal(saved.has(KEY),false);assert.equal(db.records.has(KEY),false);
});
