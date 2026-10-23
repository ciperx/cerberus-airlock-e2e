import test from 'node:test';
import assert from 'node:assert/strict';
import { createAirlock } from '../src/reference.js';
import { buildCase, loadCases } from './helpers.js';

const cases = loadCases();
const groups = ['all', 'identity', 'trust', 'intent', 'soul', 'session'] as const;

for (const group of groups) {
  test(`fixture group: ${group}`, async (t) => {
    const groupCases = cases.filter((c) => c.chamber === group);
    assert.ok(groupCases.length > 0, `no fixtures declared for chamber ${group}`);

    for (const fixture of groupCases) {
      await t.test(fixture.id, () => {
        const built = buildCase(fixture);
        const airlock = createAirlock();
        const result = airlock.authorize(built.request, built.context);

        if (built.expectedReason === null) {
          assert.equal(result.ok, true, `expected authorisation, got refusal ${result.ok ? '' : result.refusal.reason}`);
          assert.equal(result.trace.ran.length, 5);
          assert.deepEqual(result.trace.skipped, []);
          assert.equal(result.authorization.agentId, fixture.agentId);
          assert.equal(result.authorization.requestId, built.request.requestId);
          return;
        }

        assert.equal(result.ok, false, `expected refusal ${built.expectedReason}, request was authorised`);
        assert.equal(result.refusal.reason, built.expectedReason);
        assert.equal(result.refusal.chamber, fixture.chamber === 'all' ? 'identity' : fixture.chamber);
        assert.equal(result.refusal.requestId, built.request.requestId);
        assert.ok(result.refusal.detail.length > 0, 'refusals must carry a human-readable detail');
      });
    }
  });
}

test('every chamber has at least one refusing fixture', () => {
  for (const chamber of ['identity', 'trust', 'intent', 'soul', 'session']) {
    const refusing = cases.filter((c) => c.chamber === chamber && c.expectedReason !== null);
    assert.ok(refusing.length >= 1, `chamber ${chamber} has no refusing fixture`);
  }
});

test('every refusal reason is exercised by a fixture', () => {
  const covered = new Set(cases.map((c) => c.expectedReason).filter((r): r is NonNullable<typeof r> => r !== null));
  const required = [
    'IDENTITY_MISSING_AGENT',
    'IDENTITY_UNKNOWN_AGENT',
    'IDENTITY_BAD_SIGNATURE',
    'IDENTITY_STALE_ATTESTATION',
    'TRUST_UNKNOWN_AGENT',
    'TRUST_BELOW_FLOOR',
    'TRUST_STALE_OBSERVATION',
    'INTENT_MISSING_ACTION',
    'INTENT_MISSING_RESOURCE',
    'INTENT_OUT_OF_SCOPE',
    'SOUL_UNKNOWN_KEY',
    'SOUL_CHALLENGE_MISMATCH',
    'SOUL_MISSING_RESPONSE',
    'SESSION_MISSING',
    'SESSION_MALFORMED',
    'SESSION_TAMPERED',
    'SESSION_EXPIRED',
    'SESSION_WRONG_AGENT',
    'SESSION_WRONG_INTENT',
  ];
  for (const reason of required) {
    assert.ok(covered.has(reason as never), `no fixture covers ${reason}`);
  }
});
