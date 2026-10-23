import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirlock } from '../src/reference.js';
import { buildCase, loadCases } from './helpers.js';

const cases = loadCases();
const byId = (id: string) => {
  const found = cases.find((c) => c.id === id);
  assert.ok(found, `fixture ${id} missing`);
  return found;
};

test('a refusal at the identity chamber stops the chain immediately', () => {
  const built = buildCase(byId('identity-forged-signature'));
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.trace.ran, ['identity']);
  assert.deepEqual(result.trace.skipped, ['trust', 'intent', 'soul', 'session']);
});

test('a refusal at the trust chamber runs identity, then stops', () => {
  const built = buildCase(byId('trust-below-floor'));
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'TRUST_BELOW_FLOOR');
  assert.deepEqual(result.trace.ran, ['identity', 'trust']);
  assert.deepEqual(result.trace.skipped, ['intent', 'soul', 'session']);
});

test('a refusal at the intent chamber never reaches the SOUL handshake', () => {
  const built = buildCase(byId('intent-action-not-in-scope'));
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.trace.ran, ['identity', 'trust', 'intent']);
  assert.deepEqual(result.trace.skipped, ['soul', 'session']);
});

test('a refusal at the SOUL chamber never reaches the session chamber', () => {
  const built = buildCase(byId('soul-wrong-response'));
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.trace.ran, ['identity', 'trust', 'intent', 'soul']);
  assert.deepEqual(result.trace.skipped, ['session']);
});

test('an earlier refusal shadows every later fault in the same request', () => {
  const base = byId('identity-forged-signature');
  const alsoBroken = {
    ...base,
    trustScore: 10,
    action: 'delete',
    resource: 'admin',
    soulResponse: 'wrong' as const,
    sessionMode: 'expired' as const,
  };
  const built = buildCase(alsoBroken);
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'IDENTITY_BAD_SIGNATURE');
  assert.equal(result.trace.ran.length, 1);
});

test('a later refusal does not mask an earlier pass: trust failure reports trust, not session', () => {
  const built = buildCase({
    ...byId('trust-below-floor'),
    sessionMode: 'expired',
    soulResponse: 'wrong',
  });
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'TRUST_BELOW_FLOOR');
  assert.equal(result.refusal.chamber, 'trust');
});

test('the happy path runs exactly the five chambers in the documented order', () => {
  const built = buildCase(byId('happy-alpha-ledger-read'));
  const result = createAirlock().authorize(built.request, built.context);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.trace.ran, ['identity', 'trust', 'intent', 'soul', 'session']);
  assert.deepEqual(result.trace.skipped, []);
});

test('the Airlock refuses to be constructed with chambers out of order', async () => {
  const { identityChamber } = await import('../src/chambers/identity.js');
  const { sessionChamber } = await import('../src/chambers/session.js');
  const { trustChamber } = await import('../src/chambers/trust.js');
  const { intentChamber } = await import('../src/chambers/intent.js');
  const { soulChamber } = await import('../src/chambers/soul.js');
  assert.throws(
    () => createAirlock([sessionChamber, identityChamber, trustChamber, intentChamber, soulChamber]),
    /chambers must be exactly/,
  );
});

test('the Airlock refuses a chamber list with a chamber removed', async () => {
  const { identityChamber } = await import('../src/chambers/identity.js');
  const { trustChamber } = await import('../src/chambers/trust.js');
  const { intentChamber } = await import('../src/chambers/intent.js');
  const { soulChamber } = await import('../src/chambers/soul.js');
  assert.throws(
    () => createAirlock([identityChamber, trustChamber, intentChamber, soulChamber]),
    /chambers must be exactly/,
  );
});
