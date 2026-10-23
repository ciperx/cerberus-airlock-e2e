import { Reason, type Chamber, type ChamberContext, type ChamberOutcome, type AirlockRequest, type VerifiedSession } from '../types.js';
import { b64urlDecode, b64urlEncode, hmacBase64Url, intentHash, safeEqual } from '../crypto.js';

export const SESSION_TTL_MS = 60_000;

interface SessionPayload {
  v: 1;
  agentId: string;
  intentHash: string;
  exp: number;
  nonce: string;
}

export interface IssuedSession {
  token: string;
  payload: SessionPayload;
}

/**
 * Issue a session token bound to one agent, one intent and one expiry instant.
 * A fresh nonce makes every issuance single use.
 */
export function issueSession(
  secret: string,
  agentId: string,
  intent: { action: string; resource: string; requestedAtMs: number },
  expiresAtMs: number,
  nonce: string,
): IssuedSession {
  const payload: SessionPayload = {
    v: 1,
    agentId,
    intentHash: intentHash(intent.action, intent.resource, intent.requestedAtMs),
    exp: expiresAtMs,
    nonce,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = hmacBase64Url(secret, body);
  return { token: `${body}.${sig}`, payload };
}

function decode(token: string): { payload: SessionPayload; body: string; sig: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  if (!body || !sig) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (parsed.v !== 1 || typeof parsed.agentId !== 'string' || typeof parsed.exp !== 'number' || typeof parsed.nonce !== 'string') {
      return null;
    }
    return { payload: parsed, body, sig };
  } catch {
    return null;
  }
}

/** Verify a token without spending it. Exported so tests can inspect outcomes. */
export function verifySession(
  token: string,
  request: AirlockRequest,
  ctx: ChamberContext,
): { ok: true; session: VerifiedSession } | { ok: false; reason: typeof Reason[keyof typeof Reason]; detail: string } {
  if (!token) {
    return { ok: false, reason: Reason.SESSION_MISSING, detail: 'session token is empty' };
  }
  const decoded = decode(token);
  if (!decoded) {
    return { ok: false, reason: Reason.SESSION_MALFORMED, detail: 'session token is not a two-part base64url payload' };
  }
  const expectedSig = hmacBase64Url(ctx.registry.sessionSecret, decoded.body);
  if (!safeEqual(decoded.sig, expectedSig)) {
    return { ok: false, reason: Reason.SESSION_TAMPERED, detail: 'session token signature does not verify' };
  }
  if (decoded.payload.exp <= ctx.nowMs) {
    return { ok: false, reason: Reason.SESSION_EXPIRED, detail: `session expired at ${decoded.payload.exp}, now ${ctx.nowMs}` };
  }
  if (decoded.payload.agentId !== request.identity?.agentId) {
    return { ok: false, reason: Reason.SESSION_WRONG_AGENT, detail: 'session was issued to another agent' };
  }
  const expectedIntent = intentHash(request.intent.action, request.intent.resource, request.intent.requestedAtMs);
  if (!safeEqual(decoded.payload.intentHash, expectedIntent)) {
    return { ok: false, reason: Reason.SESSION_WRONG_INTENT, detail: 'session was issued for a different intent' };
  }
  if (ctx.spentNonces.has(decoded.payload.nonce)) {
    return { ok: false, reason: Reason.SESSION_REPLAYED, detail: `nonce ${decoded.payload.nonce} was already spent` };
  }
  return {
    ok: true,
    session: {
      agentId: decoded.payload.agentId,
      intentHash: decoded.payload.intentHash,
      expiresAtMs: decoded.payload.exp,
      nonce: decoded.payload.nonce,
    },
  };
}

export const sessionChamber: Chamber = {
  name: 'session',
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome {
    const token = request.session?.token ?? '';
    const verdict = verifySession(token, request, ctx);
    if (!verdict.ok) return verdict;
    ctx.spentNonces.add(verdict.session.nonce);
    return { ok: true, session: verdict.session };
  },
};
