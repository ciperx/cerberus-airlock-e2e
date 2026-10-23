import { Airlock } from './airlock.js';
import { identityChamber } from './chambers/identity.js';
import { trustChamber } from './chambers/trust.js';
import { intentChamber } from './chambers/intent.js';
import { soulChamber } from './chambers/soul.js';
import { sessionChamber } from './chambers/session.js';
import type { Registry, Chamber } from './types.js';

export const DEFAULT_CHAMBERS = [identityChamber, trustChamber, intentChamber, soulChamber, sessionChamber] as const;

/** The reference registry used by the fixtures under fixtures/. */
export const REFERENCE_REGISTRY: Registry = {
  registrySecret: 'registry-secret-not-a-live-secret',
  sessionSecret: 'session-secret-not-a-live-secret',
  agents: {
    'agent.alpha': { soulKeyHex: 'soul-key-alpha-not-a-live-secret', fingerprint: 'fp-alpha', trustFloor: 700 },
    'agent.beta': { soulKeyHex: 'soul-key-beta-not-a-live-secret', fingerprint: 'fp-beta', trustFloor: 700 },
    'agent.gamma': { soulKeyHex: 'soul-key-gamma-not-a-live-secret', fingerprint: 'fp-gamma', trustFloor: 850 },
  },
  scopes: {
    ledger: ['read'],
    vault: ['read', 'write'],
    admin: [],
  },
};

export function createAirlock(chambers: readonly Chamber[] = DEFAULT_CHAMBERS): Airlock {
  return new Airlock(chambers);
}

export function challengeFor(requestId: string): string {
  return `chal-${requestId}`;
}
