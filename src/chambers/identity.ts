import { hmacHex, safeEqual } from '../crypto.js';
import { Reason, type Chamber, type ChamberContext, type ChamberOutcome, type AirlockRequest } from '../types.js';

/** Attestations older than this are refused. */
export const IDENTITY_MAX_AGE_MS = 120_000;

export const identityChamber: Chamber = {
  name: 'identity',
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome {
    const claim = request.identity;
    if (!claim || typeof claim.agentId !== 'string' || claim.agentId.length === 0) {
      return { ok: false, reason: Reason.IDENTITY_MISSING_AGENT, detail: 'identity.agentId is empty' };
    }
    const agent = ctx.registry.agents[claim.agentId];
    if (!agent) {
      return { ok: false, reason: Reason.IDENTITY_UNKNOWN_AGENT, detail: `agent ${claim.agentId} is not registered` };
    }
    const age = ctx.nowMs - claim.issuedAtMs;
    if (!Number.isFinite(claim.issuedAtMs) || age > IDENTITY_MAX_AGE_MS) {
      return { ok: false, reason: Reason.IDENTITY_STALE_ATTESTATION, detail: `attestation age ${age}ms exceeds ${IDENTITY_MAX_AGE_MS}ms` };
    }
    if (age < -IDENTITY_MAX_AGE_MS) {
      return { ok: false, reason: Reason.IDENTITY_STALE_ATTESTATION, detail: `attestation issued in the future by ${-age}ms` };
    }
    const expected = hmacHex(ctx.registry.registrySecret, `${claim.agentId}:${claim.issuedAtMs}`);
    if (typeof claim.signature !== 'string' || !safeEqual(claim.signature, expected)) {
      return { ok: false, reason: Reason.IDENTITY_BAD_SIGNATURE, detail: 'attestation signature does not verify' };
    }
    return { ok: true };
  },
};
