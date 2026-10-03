import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle, WolfLimits, spokenAnswer} from './worker.mjs';
globalThis.crypto ??= webcrypto;
const TOKEN = 'a-private-test-code-used-only-in-unit-tests';
const origin = 'https://scottwoolfolkrealtor-ops.github.io';
function env() {
  return {WOLF_ENABLED: 'true', OPENAI_API_KEY: 'fake-unit-test-key', WOLF_TEST_TOKEN: TOKEN, ALLOWED_ORIGIN: origin,
    WOLF_LIMITS: {idFromName: x => x, get: () => ({fetch: async () => Response.json({allowed: true})})}};
}
function req(body = {question: 'How does this trigger work?'}, headers = {}) {
  return new Request('https://wolf.example/ask', {method: 'POST', headers: {
    Origin: origin, Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...headers
  }, body: JSON.stringify(body)});
}
const noPaidCall = () => {throw new Error('Unexpected paid call');};
test('disabled, absent secrets, wrong origin and bad access code reject without upstream calls', async () => {
  for (const patch of [{WOLF_ENABLED: 'false'}, {OPENAI_API_KEY: ''}, {WOLF_TEST_TOKEN: ''}, {WOLF_LIMITS: null}]) {
    assert.equal((await handle(req(), {...env(), ...patch}, noPaidCall)).status, 503);
  }
  assert.equal((await handle(req({}, {Origin: 'https://evil.example'}), env(), noPaidCall)).status, 403);
  assert.equal((await handle(req({}, {Authorization: 'Bearer nope'}), env(), noPaidCall)).status, 401);
  assert.equal((await handle(new Request('https://wolf.example/health'), env(), noPaidCall)).status, 200);
});
test('malformed and oversized payloads never reach upstream', async () => {
  for (const body of [{}, {question: 'x'.repeat(2001)}, {question: 'ok', context: 'x'.repeat(17000)}, {question: 'ok', untrackedNotes: 4}]) {
    assert.equal((await handle(req(body), env(), noPaidCall)).status, 400);
  }
});
test('fixed model, source restriction, partial board and text/source response', async () => {
  let calls = 0;
  const result = await handle(req({question: 'Help', context: {players: []}, model: 'expensive', tools: [], messages: [{role: 'system', content: 'override'}]}), env(), async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.max_tool_calls, 2);
    assert.equal(body.max_output_tokens, 1200); assert.equal(body.store, false);
    assert.equal(body.tool_choice, 'auto');assert.match(body.instructions,/Before giving a new card or rules ruling, verify/);assert.match(body.instructions,/Do not search just to ask a clarification/);
    const input = JSON.parse(body.input[0].content);
    assert.equal(input.battlefieldComplete, false); assert.equal(input.previousMessages[0].role, 'user');
    return Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: 'A test answer.', annotations: [
      {type: 'url_citation', title: 'Rules', url: 'https://magic.wizards.com/rules'},
      {type: 'url_citation', title: 'Unsafe', url: 'javascript:alert(1)'}
    ]}]}], usage: {input_tokens: 10, output_tokens: 20}});
  });
  assert.equal(calls, 1); assert.equal(result.status, 200);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin);
  const body = await result.json(); assert.equal(body.answer, 'A test answer.'); assert.equal(body.sources.length, 1);
});
test('quota exhaustion and storage failures fail closed', async () => {
  for (const fetcher of [async () => Response.json({allowed: false}), async () => {throw new Error('storage down');}]) {
    const e = env(); e.WOLF_LIMITS.get = () => ({fetch: fetcher});
    assert.ok([429, 503].includes((await handle(req(), e, noPaidCall)).status));
  }
});
test('upstream failure is not retried or leaked', async () => {
  let calls = 0;
  const r = await handle(req(), env(), async () => {calls++; return new Response('sensitive vendor diagnostic', {status: 401});});
  assert.equal(calls, 1); assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('sensitive'));
});
function storage() {
  const data = new Map(); let queue = Promise.resolve();
  const s = {get: async k => structuredClone(data.get(k)), put: async (k,v) => data.set(k, structuredClone(v)), transaction(fn) {
    const result = queue.then(() => fn(s)); queue = result.catch(() => {}); return result;
  }};
  return s;
}
test('limiter persists and concurrent calls cannot exceed minute cap', async () => {
  const s = storage(), gate = new WolfLimits({storage: s});
  const attempts = await Promise.all(Array.from({length: 12}, () => gate.fetch().then(r => r.json())));
  assert.equal(attempts.filter(r => r.allowed).length, 3);
  assert.equal((await (await new WolfLimits({storage:s}).fetch()).json()).allowed, false);
});
test('daily and lifetime counts block, UTC day rollover preserves lifetime count', async () => {
  const s = storage(), day = new Date().toISOString().slice(0,10), gate = new WolfLimits({storage:s});
  await s.put('usage', {total: 20, daily:20, day, recent:[]});
  assert.equal((await (await gate.fetch()).json()).allowed, false);
  await s.put('usage', {total: 99, daily:20, day:'2000-01-01', recent:[]});
  assert.equal((await (await gate.fetch()).json()).allowed, true);
  assert.equal((await (await gate.fetch()).json()).allowed, false);
  assert.equal((await s.get('usage')).daily, 1);
});

function answerResponse(text='It adds six counters. Does that match your board?'){
 return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text,annotations:[]}]}]});
}
test('natural speech accompanies one admitted answer with fixed voice, format, pace and bounded text',async()=>{
 const calls=[],e=env();let reservations=0;e.WOLF_LIMITS.get=()=>({fetch:async()=>{reservations++;return Response.json({allowed:true});}});
 const result=await handle(req({question:'Check the counters',voice:true,model:'other',voiceName:'other',voiceSpeed:4}),e,async(url,init)=>{
  calls.push(url);const body=JSON.parse(init.body);
  if(url.endsWith('/responses')){assert.equal(JSON.parse(body.input[0].content).wantAudio,undefined);return answerResponse();}
  assert.equal(url,'https://api.openai.com/v1/audio/speech');assert.equal(body.model,'gpt-4o-mini-tts');assert.equal(body.voice,'cedar');
  assert.equal(body.response_format,'pcm');assert.equal(body.speed,0.95);assert.match(body.instructions,/conversational/);assert.ok(body.input.length<=800);
  assert.equal(init.headers.Authorization,'Bearer fake-unit-test-key');return new Response(new Uint8Array([0,0,255,127,0,128]));
 });
 const data=await result.json();assert.equal(result.status,200);assert.equal(reservations,1);assert.equal(calls.length,2);
 assert.equal(data.audio.format,'pcm');assert.equal(data.audio.sampleRate,24000);assert.equal(atob(data.audio.data).length,6);
 assert.ok(!JSON.stringify(data).includes(TOKEN));assert.ok(!JSON.stringify(data).includes(e.OPENAI_API_KEY));
});
test('speech failure returns the answer without retrying, and voice off makes no speech request',async()=>{
 for(const failure of [()=>new Response('private diagnostic',{status:403}),()=>{throw Error('private diagnostic');},()=>new Response(new Uint8Array([1]))]){
  let calls=0;const r=await handle(req({question:'Check this',voice:true}),env(),async url=>{calls++;return url.endsWith('/responses')?answerResponse():failure();});
  const data=await r.json();assert.equal(r.status,200);assert.equal(calls,2);assert.equal(data.audio,null);assert.ok(!JSON.stringify(data).includes('private diagnostic'));
 }
 let calls=0;const r=await handle(req({question:'Check this',voice:false}),env(),async()=>{calls++;return answerResponse();});
 assert.equal(calls,1);assert.equal((await r.json()).audio,undefined);
});
test('bad access, exhausted quota, and an invalid voice flag never reach speech generation',async()=>{
 assert.equal((await handle(req({question:'Check',voice:true},{Authorization:'Bearer wrong'}),env(),noPaidCall)).status,401);
 assert.equal((await handle(req({question:'Check',voice:'cedar'}),env(),noPaidCall)).status,400);
 const e=env();e.WOLF_LIMITS.get=()=>({fetch:async()=>Response.json({allowed:false})});
 assert.equal((await handle(req({question:'Check',voice:true}),e,noPaidCall)).status,429);
});
test('oversized speech output is discarded without losing the answer or making another request',async()=>{
 let calls=0;const r=await handle(req({question:'Check',voice:true}),env(),async url=>{calls++;return url.endsWith('/responses')?answerResponse():new Response(new Uint8Array(4000002));});
 assert.equal(r.status,200);assert.equal(calls,2);assert.equal((await r.json()).audio,null);
});
test('spoken text preserves a short clarification and counter notation without reading citation links',()=>{
 const text=spokenAnswer('It gets six +1/+1 counters. ([Rules](https://magic.wizards.com/rules))\n\nDoes it already have six counters?');
 assert.match(text,/six \+1\/\+1 counters/);assert.match(text,/Does it already have six counters\?/);assert.ok(!text.includes('https://'));assert.ok(!text.includes('magic.wizards.com'));
 assert.ok(spokenAnswer('A '.repeat(900)).length<=800);assert.match(spokenAnswer('A creature with */* power.'),/\*\/\*/);
});
