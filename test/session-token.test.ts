import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirlock, REFERENCE_REGISTRY, challengeFor } from '../src/reference.js';
import { issueSession } from '../src/chambers/session.js';
import { b64urlEncode } from '../src/crypto.js';
import { buildCase, loadCases, NOW } from './helpers.js';
import type { AirlockRequest, ChamberContext } from '../src/types.js';

const cases = loadCases();
const happy = () => {
  const found = cases.find((c) => c.id === 'happy-alpha-ledger-read');
  if (!found) throw new Error('happy path fixture missing');
  return found;
};

function requestWithToken(token: string | null, now = NOW): { request: AirlockRequest; context: Omit<ChamberContext, 'spentNonces'> } {
  const built = buildCase(happy(), now);
  const request: AirlockRequest = { ...built.request, session: token === null ? null : { token } };
  return { request, context: built.context };
}

function issue(expiresAtMs: number, agentId = 'agent.alpha', nonce = 'nonce-fixture-1'): string {
  const built = buildCase(happy(), NOW);
  return issueSession(REFERENCE_REGISTRY.sessionSecret, agentId, built.request.intent, expiresAtMs, nonce).token;
}

test('a token that expires exactly now is refused', () => {
  const { request, context } = requestWithToken(issue(NOW));
  const result = createAirlock().authorize(request, context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_EXPIRED');
});

test('a token with one millisecond of life left is accepted', () => {
  const { request, context } = requestWithToken(issue(NOW + 1));
  const result = createAirlock().authorize(request, context);
  assert.equal(result.ok, true);
});

test('a token signed with a different secret is refused as tampered', () => {
  const built = buildCase(happy());
  const foreign = issueSession('another-secret', 'agent.alpha', built.request.intent, NOW + 60_000, 'n1').token;
  const { request, context } = requestWithToken(foreign);
  const result = createAirlock().authorize(request, context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_TAMPERED');
});

test('editing the payload after signing is refused as tampered, not as wrong agent', () => {
  const built = buildCase(happy());
  const issued = issueSession(REFERENCE_REGISTRY.sessionSecret, 'agent.alpha', built.request.intent, NOW + 60_000, 'n2');
  const [body, sig] = issued.token.split('.') as [string, string];
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
  payload.agentId = 'agent.beta';
  const forgedBody = b64urlEncode(JSON.stringify(payload));
  const result = createAirlock().authorize(
    { ...built.request, session: { token: `${forgedBody}.${sig}` } },
    built.context,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_TAMPERED');
});

test('a token issued to another agent is refused even with a valid signature', () => {
  const { request, context } = requestWithToken(issue(NOW + 60_000, 'agent.beta', 'n3'));
  const result = createAirlock().authorize(request, context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_WRONG_AGENT');
});

test('a token bound to another intent is refused', () => {
  const built = buildCase(happy());
  const other = issueSession(
    REFERENCE_REGISTRY.sessionSecret,
    'agent.alpha',
    { action: 'write', resource: 'vault', requestedAtMs: NOW - 1_000 },
    NOW + 60_000,
    'n4',
  ).token;
  const result = createAirlock().authorize({ ...built.request, session: { token: other } }, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_WRONG_INTENT');
});

test('a replayed token is refused on the second use', () => {
  const { request, context } = requestWithToken(issue(NOW + 60_000, 'agent.alpha', 'nonce-replay'));
  const airlock = createAirlock();
  assert.equal(airlock.authorize(request, context).ok, true);
  const second = airlock.authorize(request, context);
  assert.equal(second.ok, false);
  if (second.ok) return;
  assert.equal(second.refusal.reason, 'SESSION_REPLAYED');
});

test('a token with an empty string is refused as missing', () => {
  const built = buildCase(happy());
  const result = createAirlock().authorize({ ...built.request, session: { token: '' } }, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_MISSING');
});

test('a token whose payload is not JSON is refused as malformed', () => {
  const built = buildCase(happy());
  const token = `${b64urlEncode('this is not json')}.c2lnbmF0dXJl`;
  const result = createAirlock().authorize({ ...built.request, session: { token } }, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_MALFORMED');
});

test('a token with the wrong number of parts is refused as malformed', () => {
  const built = buildCase(happy());
  const result = createAirlock().authorize({ ...built.request, session: { token: 'abc' } }, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SESSION_MALFORMED');
});
