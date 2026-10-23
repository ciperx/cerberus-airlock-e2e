import { Reason, type Chamber, type ChamberContext, type ChamberOutcome, type AirlockRequest } from '../types.js';

export const INTENT_MAX_AGE_MS = 60_000;

export const intentChamber: Chamber = {
  name: 'intent',
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome {
    const claim = request.intent;
    if (!claim || typeof claim.action !== 'string' || claim.action.length === 0) {
      return { ok: false, reason: Reason.INTENT_MISSING_ACTION, detail: 'intent.action is empty' };
    }
    if (typeof claim.resource !== 'string' || claim.resource.length === 0) {
      return { ok: false, reason: Reason.INTENT_MISSING_RESOURCE, detail: 'intent.resource is empty' };
    }
    const age = ctx.nowMs - claim.requestedAtMs;
    if (!Number.isFinite(claim.requestedAtMs) || age > INTENT_MAX_AGE_MS || age < -INTENT_MAX_AGE_MS) {
      return { ok: false, reason: Reason.INTENT_OUT_OF_SCOPE, detail: `intent requested at ${claim.requestedAtMs}, outside ${INTENT_MAX_AGE_MS}ms freshness window` };
    }
    const allowed = ctx.registry.scopes[claim.resource];
    if (!allowed || !allowed.includes(claim.action)) {
      return { ok: false, reason: Reason.INTENT_OUT_OF_SCOPE, detail: `action ${claim.action} is not permitted on resource ${claim.resource}` };
    }
    return { ok: true };
  },
};
