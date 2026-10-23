import { hmacHex, safeEqual } from '../crypto.js';
import { Reason, type Chamber, type ChamberContext, type ChamberOutcome, type AirlockRequest } from '../types.js';

/**
 * SOUL handshake: the agent proves possession of the key whose fingerprint the
 * registry already knows, by answering the airlock's per-request challenge.
 */
export const soulChamber: Chamber = {
  name: 'soul',
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome {
    const claim = request.soul;
    const agentId = request.identity?.agentId ?? '';
    const agent = ctx.registry.agents[agentId];
    if (!agent) {
      return { ok: false, reason: Reason.SOUL_UNKNOWN_KEY, detail: 'no SOUL key registered for agent' };
    }
    if (!claim || typeof claim.publicKeyFingerprint !== 'string' || claim.publicKeyFingerprint !== agent.fingerprint) {
      return { ok: false, reason: Reason.SOUL_UNKNOWN_KEY, detail: 'SOUL key fingerprint is not the registered one' };
    }
    if (typeof claim.response !== 'string' || claim.response.length === 0) {
      return { ok: false, reason: Reason.SOUL_MISSING_RESPONSE, detail: 'handshake response is empty' };
    }
    const expected = hmacHex(agent.soulKeyHex, `${claim.challenge}:${agentId}`);
    const challengeOk = claim.challenge === ctx.expectedChallenge;
    const responseOk = safeEqual(claim.response, expected);
    if (!challengeOk || !responseOk) {
      const detail = !challengeOk
        ? 'challenge does not match the one issued for this request'
        : 'handshake response does not verify against the registered SOUL key';
      return { ok: false, reason: Reason.SOUL_CHALLENGE_MISMATCH, detail };
    }
    return { ok: true };
  },
};
