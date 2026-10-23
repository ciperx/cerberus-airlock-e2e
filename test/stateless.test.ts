import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirlock, REFERENCE_REGISTRY } from '../src/reference.js';
import { issueSession } from '../src/chambers/session.js';
import { buildCase, loadCases, NOW } from './helpers.js';

const cases = loadCases();
const byId = (id: string) => {
  const found = cases.find((c) => c.id === id);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
};

test('a refusal does not poison the next request on the same airlock', () => {
  const airlock = createAirlock();
  const bad = buildCase(byId('intent-action-not-in-scope'));
  const refused = airlock.authorize(bad.request, bad.context);
  assert.equal(refused.ok, false);

  const good = buildCase(byId('happy-alpha-ledger-read'));
  const allowed = airlock.authorize(good.request, good.context);
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.deepEqual(allowed.trace.ran, ['identity', 'trust', 'intent', 'soul', 'session']);
});

test('a request refused at the session chamber spends no nonce', () => {
  const airlock = createAirlock();
  const expired = buildCase(byId('session-expired'));
  assert.equal(airlock.authorize(expired.request, expired.context).ok, false);
  assert.equal(airlock.spentNonceCount, 0);
});

test('a request refused at an early chamber leaves the replay ledger untouched', () => {
  const airlock = createAirlock();
  for (const id of ['identity-unknown-agent', 'trust-below-floor', 'soul-wrong-challenge']) {
    const built = buildCase(byId(id));
    assert.equal(airlock.authorize(built.request, built.context).ok, false);
  }
  assert.equal(airlock.spentNonceCount, 0);
});

test('the replay ledger records only successful authorisations', () => {
  const airlock = createAirlock();
  const good = buildCase(byId('happy-alpha-ledger-read'));
  assert.equal(airlock.authorize(good.request, good.context).ok, true);
  assert.equal(airlock.spentNonceCount, 1);
});

test('two airlock instances do not share replay state', () => {
  const built = buildCase(byId('happy-alpha-ledger-read'));
  const first = createAirlock();
  assert.equal(first.authorize(built.request, built.context).ok, true);

  const second = createAirlock();
  const result = second.authorize(built.request, built.context);
  assert.equal(result.ok, true, 'a second instance must not inherit the first instance spent nonces');
  assert.equal(second.spentNonceCount, 1);
});

test('distinct tokens are needed for distinct requests, and the ledger grows per authorisation', () => {
  const airlock = createAirlock();
  const base = buildCase(byId('happy-alpha-ledger-read'));

  const second = issueSession(
    REFERENCE_REGISTRY.sessionSecret,
    base.request.identity.agentId,
    base.request.intent,
    NOW + 30_000,
    'nonce-second',
  );
  const request = { ...base.request, requestId: 'req-second', session: { token: second.token } };
  assert.equal(airlock.authorize(base.request, base.context).ok, true);
  assert.equal(airlock.authorize(request, base.context).ok, true);
  assert.equal(airlock.spentNonceCount, 2);
});

test('reset clears the replay ledger without touching the registry', () => {
  const airlock = createAirlock();
  const built = buildCase(byId('happy-alpha-ledger-read'));
  assert.equal(airlock.authorize(built.request, built.context).ok, true);
  airlock.reset();
  assert.equal(airlock.spentNonceCount, 0);
  assert.equal(airlock.authorize(built.request, built.context).ok, true);
});

test('the same request refused twice reports the same reason both times', () => {
  const airlock = createAirlock();
  const built = buildCase(byId('trust-below-floor'));
  const first = airlock.authorize(built.request, built.context);
  const second = airlock.authorize(built.request, built.context);
  assert.equal(first.ok, false);
  assert.equal(second.ok, false);
  if (first.ok || second.ok) return;
  assert.equal(first.refusal.reason, second.refusal.reason);
  assert.equal(first.refusal.reason, 'TRUST_BELOW_FLOOR');
});
