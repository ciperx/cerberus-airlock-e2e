import type { AirlockRequest, Chamber, ChamberContext, AirlockResult, ChamberName, AirlockTrace, VerifiedSession } from './types.js';
import { CHAMBER_ORDER } from './types.js';

/**
 * Run a chamber list in the order given, stopping at the first refusal.
 * Exported so the mutation harness can drive a pipeline with a chamber removed
 * and prove that the suite notices. The Airlock class validates that only the
 * full five-chamber order is used on production paths.
 */
export function runPipeline(
  chambers: readonly Chamber[],
  request: AirlockRequest,
  ctx: ChamberContext,
): AirlockResult {
  const ran: ChamberName[] = [];
  let verified: VerifiedSession | undefined;

  for (let i = 0; i < chambers.length; i += 1) {
    const chamber = chambers[i]!;
    ran.push(chamber.name);
    const outcome = chamber.run(request, ctx);
    if (!outcome.ok) {
      const trace: AirlockTrace = { ran, skipped: CHAMBER_ORDER.slice(CHAMBER_ORDER.indexOf(chamber.name) + 1) };
      return {
        ok: false,
        refusal: {
          requestId: request.requestId,
          chamber: chamber.name,
          reason: outcome.reason,
          detail: outcome.detail,
        },
        trace,
      };
    }
    if (outcome.session) verified = outcome.session;
  }

  if (!verified) {
    throw new Error('pipeline completed without a verified session: the session chamber is missing');
  }

  return {
    ok: true,
    authorization: {
      requestId: request.requestId,
      agentId: request.identity.agentId,
      issuedAtMs: ctx.nowMs,
      session: verified,
    },
    trace: { ran, skipped: [] },
  };
}

/**
 * An airlock holds exactly one piece of mutable state: the set of spent
 * session nonces. Every other chamber is a pure function of the request and
 * the registry. `reset()` clears the replay ledger; a fresh instance starts
 * empty, so two instances never share state.
 */
export class Airlock {
  readonly #chambers: readonly Chamber[];
  readonly #spentNonces: Set<string> = new Set<string>();

  constructor(chambers: readonly Chamber[]) {
    const names = chambers.map((c) => c.name);
    const expected = [...CHAMBER_ORDER];
    if (names.length !== expected.length || names.some((name, i) => name !== expected[i])) {
      throw new Error(`chambers must be exactly [${expected.join(', ')}], got [${names.join(', ')}]`);
    }
    this.#chambers = [...chambers];
  }

  get spentNonceCount(): number {
    return this.#spentNonces.size;
  }

  reset(): void {
    this.#spentNonces.clear();
  }

  authorize(request: AirlockRequest, ctx: Omit<ChamberContext, 'spentNonces'>): AirlockResult {
    return runPipeline(this.#chambers, request, { ...ctx, spentNonces: this.#spentNonces });
  }
}
