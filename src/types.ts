/**
 * Cerberus airlock reference implementation: shared types.
 *
 * The airlock is a chain of five chambers. A request must clear each chamber
 * in a fixed order before it is authorised. The first refusing chamber stops
 * the chain and its reason code is reported; later chambers must not run.
 */

/** Stable, machine-readable refusal reasons. Tests assert these, never booleans. */
export const Reason = {
  IDENTITY_MISSING_AGENT: 'IDENTITY_MISSING_AGENT',
  IDENTITY_UNKNOWN_AGENT: 'IDENTITY_UNKNOWN_AGENT',
  IDENTITY_BAD_SIGNATURE: 'IDENTITY_BAD_SIGNATURE',
  IDENTITY_STALE_ATTESTATION: 'IDENTITY_STALE_ATTESTATION',
  TRUST_UNKNOWN_AGENT: 'TRUST_UNKNOWN_AGENT',
  TRUST_BELOW_FLOOR: 'TRUST_BELOW_FLOOR',
  TRUST_STALE_OBSERVATION: 'TRUST_STALE_OBSERVATION',
  INTENT_MISSING_ACTION: 'INTENT_MISSING_ACTION',
  INTENT_OUT_OF_SCOPE: 'INTENT_OUT_OF_SCOPE',
  INTENT_MISSING_RESOURCE: 'INTENT_MISSING_RESOURCE',
  SOUL_UNKNOWN_KEY: 'SOUL_UNKNOWN_KEY',
  SOUL_CHALLENGE_MISMATCH: 'SOUL_CHALLENGE_MISMATCH',
  SOUL_MISSING_RESPONSE: 'SOUL_MISSING_RESPONSE',
  SESSION_MISSING: 'SESSION_MISSING',
  SESSION_MALFORMED: 'SESSION_MALFORMED',
  SESSION_TAMPERED: 'SESSION_TAMPERED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_WRONG_AGENT: 'SESSION_WRONG_AGENT',
  SESSION_WRONG_INTENT: 'SESSION_WRONG_INTENT',
  SESSION_REPLAYED: 'SESSION_REPLAYED',
} as const;

export type ReasonCode = (typeof Reason)[keyof typeof Reason];

export type ChamberName =
  | 'identity'
  | 'trust'
  | 'intent'
  | 'soul'
  | 'session';

export const CHAMBER_ORDER: readonly ChamberName[] = [
  'identity',
  'trust',
  'intent',
  'soul',
  'session',
] as const;

export interface IdentityClaim {
  agentId: string;
  /** HMAC-SHA256 over `${agentId}:${issuedAtMs}` keyed by the registry secret. */
  signature: string;
  issuedAtMs: number;
}

export interface TrustClaim {
  agentId: string;
  /** Integer 0..1000. */
  score: number;
  observedAtMs: number;
}

export interface IntentClaim {
  action: string;
  resource: string;
  requestedAtMs: number;
}

export interface SoulClaim {
  /** Server-issued challenge, bound to the agent and request. */
  challenge: string;
  /** HMAC-SHA256 over `${challenge}:${agentId}` keyed by the agent's SOUL key. */
  response: string;
  /** Fingerprint of the agent's SOUL key, must be pre-registered. */
  publicKeyFingerprint: string;
}

export interface SessionClaim {
  /** `base64url(payload).base64url(hmac)` issued by a previous authorisation. */
  token: string;
}

export interface AirlockRequest {
  requestId: string;
  identity: IdentityClaim;
  trust: TrustClaim;
  intent: IntentClaim;
  soul: SoulClaim;
  session: SessionClaim | null;
}

export interface VerifiedSession {
  agentId: string;
  intentHash: string;
  expiresAtMs: number;
  nonce: string;
}

export interface Registry {
  /** Agents permitted to present identity claims. */
  agents: Record<string, { soulKeyHex: string; fingerprint: string; trustFloor?: number }>;
  /** resource -> actions the airlock will accept. */
  scopes: Record<string, string[]>;
  /** Registry HMAC secret used to verify identity attestations. */
  registrySecret: string;
  /** Session signing secret. */
  sessionSecret: string;
}

export interface ChamberContext {
  nowMs: number;
  registry: Registry;
  /** Challenge issued by the airlock for this request. */
  expectedChallenge: string;
  /** Session nonces already spent, keyed by nonce. */
  spentNonces: Set<string>;
}

export type ChamberOutcome =
  | { ok: true; session?: VerifiedSession }
  | { ok: false; reason: ReasonCode; detail: string };

export interface Chamber {
  name: ChamberName;
  run(request: AirlockRequest, ctx: ChamberContext): ChamberOutcome;
}

export interface Authorization {
  requestId: string;
  agentId: string;
  issuedAtMs: number;
  session: VerifiedSession;
}

export interface Refusal {
  requestId: string;
  chamber: ChamberName;
  reason: ReasonCode;
  detail: string;
}

export interface AirlockTrace {
  /** Chambers that actually executed, in order. */
  ran: ChamberName[];
  /** Chambers never reached because an earlier one refused. */
  skipped: ChamberName[];
}

export type AirlockResult =
  | { ok: true; authorization: Authorization; trace: AirlockTrace }
  | { ok: false; refusal: Refusal; trace: AirlockTrace };
