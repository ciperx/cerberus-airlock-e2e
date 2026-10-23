# Chamber contracts

The airlock runs a fixed list of chambers. Each chamber is a pure function of the request and the shared context, except the session chamber, which appends to the replay ledger on success. The first refusal ends the run, and `trace.ran` / `trace.skipped` record exactly what executed.

## Request

```
AirlockRequest {
  requestId
  identity  { agentId, signature, issuedAtMs }
  trust     { agentId, score, observedAtMs }
  intent    { action, resource, requestedAtMs }
  soul      { challenge, response, publicKeyFingerprint }
  session   { token } | null
}
```

## 1. identity

Checks, in this order:

1. `agentId` is non empty: `IDENTITY_MISSING_AGENT`
2. the agent exists in the registry: `IDENTITY_UNKNOWN_AGENT`
3. the attestation is no older than 120 s and not from the future: `IDENTITY_STALE_ATTESTATION`
4. `HMAC(registrySecret, agentId + ":" + issuedAtMs)` matches `signature` in constant time: `IDENTITY_BAD_SIGNATURE`

Signature is checked after the age checks so a stale but valid attestation is reported as stale, not forged.

## 2. trust

1. a trust record exists for the agent and the claim names the same agent: `TRUST_UNKNOWN_AGENT`
2. the observation is within 300 s either side of now: `TRUST_STALE_OBSERVATION`
3. the integer score is at or above the agent's floor, default 700: `TRUST_BELOW_FLOOR`

`agent.gamma` has a raised floor of 850 in the reference registry, which gives the fixtures a per agent floor case.

## 3. intent

1. `action` is non empty: `INTENT_MISSING_ACTION`
2. `resource` is non empty: `INTENT_MISSING_RESOURCE`
3. the request is no older than 60 s: `INTENT_OUT_OF_SCOPE`
4. `registry.scopes[resource]` lists `action`: `INTENT_OUT_OF_SCOPE`

A stale intent reuses `INTENT_OUT_OF_SCOPE` rather than a separate code because the airlock treats freshness as part of scope. If you disagree, add `INTENT_STALE_REQUEST` to `Reason` and one fixture; the suite will pick it up.

## 4. SOUL handshake

1. the agent has a registered SOUL key and the presented fingerprint is that key: `SOUL_UNKNOWN_KEY`
2. a response is present: `SOUL_MISSING_RESPONSE`
3. the challenge equals the one the airlock issued for this request id, and `HMAC(soulKey, challenge + ":" + agentId)` matches: `SOUL_CHALLENGE_MISMATCH`

The challenge is bound to the request id, so a recorded handshake from an earlier request cannot be replayed. `test/mutation.test.ts` proves this binding by swapping `expectedChallenge`.

## 5. session

Token format: `base64url(payload) + "." + base64url(HMAC_SHA256(sessionSecret, base64url(payload)))`, payload `{ v: 1, agentId, intentHash, exp, nonce }`.

Checks, in this order:

1. token is non empty: `SESSION_MISSING`
2. token splits into exactly two non empty parts and the payload parses with `v: 1`: `SESSION_MALFORMED`
3. signature matches in constant time: `SESSION_TAMPERED`
4. `exp > now`: `SESSION_EXPIRED` (expiry at exactly now is refused)
5. `payload.agentId` equals the request agent: `SESSION_WRONG_AGENT`
6. `payload.intentHash` equals `HMAC(intent domain, action|resource|requestedAtMs)`: `SESSION_WRONG_INTENT`
7. the nonce is not in the spent set: `SESSION_REPLAYED`

On success the nonce is spent. Nothing else in the airlock is stateful, so a failed request cannot influence a later one. `reset()` clears the ledger, which is what `test/stateless.test.ts` uses to re-authorise the same token.

## Invariants the tests rely on

1. Order is fixed and validated: `new Airlock` rejects any list that is not exactly identity, trust, intent, soul, session.
2. A refusal carries a reason code, a chamber name, a request id and a non empty detail.
3. Earlier chambers always win: a request broken at identity and at session reports identity.
4. Skipped chambers are listed, not inferred: `trace.skipped` is the tail of the canonical order after the refusing chamber.
5. Success spends exactly one nonce.
