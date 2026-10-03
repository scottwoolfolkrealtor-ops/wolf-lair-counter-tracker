import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handle, WolfLimits} from './worker.mjs';
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
    assert.equal(body.max_output_tokens, 2000); assert.equal(body.store, false);
    assert.equal(body.tool_choice, 'required');
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
