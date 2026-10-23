import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hmacHex } from '../src/crypto.js';
import { issueSession } from '../src/chambers/session.js';
import { REFERENCE_REGISTRY, challengeFor } from '../src/reference.js';
import type { AirlockRequest, ChamberContext, ReasonCode } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
export const CASES_PATH = join(here, '..', 'fixtures', 'cases.json');

/** Fixed clock so expiry and staleness are deterministic. */
export const NOW = 1_760_000_000_000;

export interface FixtureCase {
  id: string;
  chamber: string;
  agentId: string;
  action: string;
  resource: string;
  trustScore: number;
  expectedReason: ReasonCode | null;
  identitySignature?: 'valid' | 'forged';
  identityOffsetMs?: number;
  trustAgentId?: string;
  trustOffsetMs?: number;
  intentOffsetMs?: number;
  soulFingerprint?: string;
  soulChallenge?: string;
  soulResponse?: 'valid' | 'wrong' | 'empty';
  sessionMode?: 'valid' | 'missing' | 'malformed' | 'tampered' | 'expired' | 'wrong-agent' | 'wrong-intent';
}

export interface BuiltCase {
  request: AirlockRequest;
  context: Omit<ChamberContext, 'spentNonces'>;
  expectedReason: ReasonCode | null;
}

export function loadCases(): FixtureCase[] {
  const raw = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as { cases: FixtureCase[] };
  return raw.cases;
}

function tamper(token: string): string {
  const [body, sig] = token.split('.') as [string, string];
  const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
  return `${body}.${flipped}`;
}

export function buildCase(fixture: FixtureCase, now: number = NOW): BuiltCase {
  const requestId = `req-${fixture.id}`;
  const agentId = fixture.agentId;
  const agent = REFERENCE_REGISTRY.agents[agentId];
  const issuedAtMs = now + (fixture.identityOffsetMs ?? -1_000);
  const signature =
    fixture.identitySignature === 'forged'
      ? hmacHex('attacker-secret', `${agentId}:${issuedAtMs}`)
      : hmacHex(REFERENCE_REGISTRY.registrySecret, `${agentId}:${issuedAtMs}`);

  const challenge = fixture.soulChallenge ?? challengeFor(requestId);
  const soulKey = agent?.soulKeyHex ?? 'unknown-key';
  const response =
    fixture.soulResponse === 'empty'
      ? ''
      : fixture.soulResponse === 'wrong'
        ? hmacHex('wrong-key', `${challenge}:${agentId}`)
        : hmacHex(soulKey, `${challenge}:${agentId}`);

  const intent = {
    action: fixture.action,
    resource: fixture.resource,
    requestedAtMs: now + (fixture.intentOffsetMs ?? -1_000),
  };

  const mode = fixture.sessionMode ?? 'valid';
  let session: AirlockRequest['session'] = null;
  if (mode !== 'missing') {
    if (mode === 'malformed') {
      session = { token: 'not-a-valid-token' };
    } else {
      const expiresAtMs = mode === 'expired' ? now - 1_000 : now + 60_000;
      const issued = issueSession(
        REFERENCE_REGISTRY.sessionSecret,
        mode === 'wrong-agent' ? 'agent.beta' : agentId,
        mode === 'wrong-intent' ? { action: 'write', resource: 'vault', requestedAtMs: now - 1_000 } : intent,
        expiresAtMs,
        randomUUID(),
      );
      session = { token: mode === 'tampered' ? tamper(issued.token) : issued.token };
    }
  }

  const request: AirlockRequest = {
    requestId,
    identity: { agentId, signature, issuedAtMs },
    trust: {
      agentId: fixture.trustAgentId ?? agentId,
      score: fixture.trustScore,
      observedAtMs: now + (fixture.trustOffsetMs ?? -1_000),
    },
    intent,
    soul: {
      challenge,
      response,
      publicKeyFingerprint: fixture.soulFingerprint ?? agent?.fingerprint ?? 'fp-unknown',
    },
    session,
  };

  return {
    request,
    context: { nowMs: now, registry: REFERENCE_REGISTRY, expectedChallenge: challengeFor(requestId) },
    expectedReason: fixture.expectedReason ?? null,
  };
}
