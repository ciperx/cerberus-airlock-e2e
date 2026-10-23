import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHAMBERS, challengeFor } from '../src/reference.js';
import { runPipeline } from '../src/airlock.js';
import { buildCase, loadCases } from './helpers.js';
import { CHAMBER_ORDER, type ChamberName, type ReasonCode } from '../src/types.js';

/**
 * Mutation test: remove one chamber at a time from the pipeline and replay the
 * fixture table. For the suite to be worth anything, removing a chamber must
 * make at least one fixture observe something other than its expected reason.
 * A mutation that survives means the suite has a hole.
 */

const cases = loadCases();

for (const removed of CHAMBER_ORDER) {
  test(`mutation: removing the ${removed} chamber is caught by the suite`, () => {
    const survivors = DEFAULT_CHAMBERS.filter((c) => c.name !== removed);
    assert.equal(survivors.length, 4);

    const targeted = cases.filter((c) => c.chamber === removed);
    assert.ok(targeted.length >= 1, `no fixtures target the ${removed} chamber`);

    const survivorsCaught: string[] = [];
    for (const fixture of targeted) {
      const built = buildCase(fixture);
      let reason: ReasonCode | null;
      try {
        const result = runPipeline(survivors, built.request, {
          ...built.context,
          spentNonces: new Set<string>(),
        });
        reason = result.ok ? null : result.refusal.reason;
      } catch {
        reason = null;
      }
      if (reason !== built.expectedReason) survivorsCaught.push(fixture.id);
    }

    assert.ok(
      survivorsCaught.length >= 1,
      `mutation survived: removing ${removed} changed nothing for ${targeted.length} fixtures`,
    );
    assert.ok(
      survivorsCaught.length >= Math.ceil(targeted.length / 2),
      `mutation only weakly caught: ${survivorsCaught.length}/${targeted.length} fixtures noticed the removal of ${removed}`,
    );
  });
}

test('mutation: the unmodified pipeline satisfies every fixture expectation', () => {
  let checked = 0;
  for (const fixture of cases) {
    const built = buildCase(fixture);
    const result = runPipeline(DEFAULT_CHAMBERS, built.request, {
      ...built.context,
      spentNonces: new Set<string>(),
    });
    const reason = result.ok ? null : result.refusal.reason;
    assert.equal(reason, built.expectedReason, `baseline mismatch on ${fixture.id}`);
    checked += 1;
  }
  assert.ok(checked >= 20, `expected at least 20 fixtures, saw ${checked}`);
});

test('mutation: a no-op chamber inserted anywhere is caught by the order guard of a real airlock', async () => {
  const { Airlock } = await import('../src/airlock.js');
  const noop = {
    name: 'identity' as ChamberName,
    run: () => ({ ok: true as const }),
  };
  assert.throws(
    () => new Airlock([noop, ...DEFAULT_CHAMBERS.slice(0, 4)]),
    /chambers must be exactly/,
  );
});

test('mutation: the challenge binding cannot be bypassed by a stale valid challenge', () => {
  const fixture = cases.find((c) => c.id === 'happy-alpha-ledger-read');
  assert.ok(fixture);
  const built = buildCase(fixture);
  const replayContext = { ...built.context, expectedChallenge: challengeFor('req-another-request') };
  const result = runPipeline(DEFAULT_CHAMBERS, built.request, {
    ...replayContext,
    spentNonces: new Set<string>(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusal.reason, 'SOUL_CHALLENGE_MISMATCH');
});
