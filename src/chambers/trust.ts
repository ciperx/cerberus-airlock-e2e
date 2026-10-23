import { Reason, type Chamber, type ChamberContext, type ChamberOutcome, type AirlockRequest } from '../types.js';

export const TRUST_DEFAULT_FLOOR = 700;
export const TRUST_MAX_OBSERVATION_AGE_MS = 300_000;

export const trustChamber: Chamber = {
  name: 'trust',
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome {
    const claim = request.trust;
    const agent = ctx.registry.agents[request.identity?.agentId ?? ''];
    if (!agent) {
      return { ok: false, reason: Reason.TRUST_UNKNOWN_AGENT, detail: 'no trust record: agent is not registered' };
    }
    if (!claim || claim.agentId !== request.identity.agentId) {
      return { ok: false, reason: Reason.TRUST_UNKNOWN_AGENT, detail: 'trust claim is missing or names another agent' };
    }
    const age = ctx.nowMs - claim.observedAtMs;
    if (!Number.isFinite(claim.observedAtMs) || age > TRUST_MAX_OBSERVATION_AGE_MS || age < -TRUST_MAX_OBSERVATION_AGE_MS) {
      return { ok: false, reason: Reason.TRUST_STALE_OBSERVATION, detail: `trust observation age ${age}ms outside window` };
    }
    const floor = agent.trustFloor ?? TRUST_DEFAULT_FLOOR;
    if (!Number.isInteger(claim.score) || claim.score < floor) {
      return { ok: false, reason: Reason.TRUST_BELOW_FLOOR, detail: `score ${claim.score} is below floor ${floor}` };
    }
    return { ok: true };
  },
};
