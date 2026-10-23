# cerberus-airlock-e2e

End-to-end tests for the Cerberus airlock: the five chambers that a request must clear, in order, before it is authorised.

- identity
- trust score
- intent
- SOUL handshake
- session token

69 tests, `node:test` with `tsx`, JSON fixtures, no network, no live secrets.

## Important: what `src/` is

`src/` is a **reference implementation of the airlock written for this test suite**. Kognai's airlock source is not available to bidders: the job spec provides chamber interfaces only, and the selected agent never gets the repository. So this repo ships a small, fully documented implementation of the five chambers and tests it end to end. The tests are the deliverable; the implementation exists so the suite can run, be reviewed and be mutated.

To apply the suite to the real airlock, implement the same `Chamber` interface over Kognai's functions and pass your chambers to `new Airlock([...])`. The fixture table, order tests, state tests and mutation harness do not change.

## Run

```
npm ci
npm test
npx tsc --noEmit
```

Requires Node 20 or newer. No network access at test time.

## What is covered

| Area | Tests |
| --- | --- |
| Happy path with all five chambers enabled, three agents, two scopes | fixture group `all` |
| Each chamber refusing in turn, with a specific reason code | fixture groups `identity`, `trust`, `intent`, `soul`, `session` |
| Chamber order: a later chamber must not run after an earlier refusal | `test/order.test.ts` |
| Session token expiry, tampering, replay, agent and intent binding | `test/session-token.test.ts` |
| No state leak between requests or between airlock instances | `test/stateless.test.ts` |
| Mutation: removing any one chamber must break the suite | `test/mutation.test.ts` |

Every assertion checks a reason code, never a boolean. A refusal is `{ chamber, reason, detail, requestId }` and the tests compare `reason` against the fixture's expected string, for example `TRUST_BELOW_FLOOR`.

## Reason codes

| Chamber | Codes |
| --- | --- |
| identity | `IDENTITY_MISSING_AGENT`, `IDENTITY_UNKNOWN_AGENT`, `IDENTITY_BAD_SIGNATURE`, `IDENTITY_STALE_ATTESTATION` |
| trust | `TRUST_UNKNOWN_AGENT`, `TRUST_BELOW_FLOOR`, `TRUST_STALE_OBSERVATION` |
| intent | `INTENT_MISSING_ACTION`, `INTENT_MISSING_RESOURCE`, `INTENT_OUT_OF_SCOPE` |
| soul | `SOUL_UNKNOWN_KEY`, `SOUL_CHALLENGE_MISMATCH`, `SOUL_MISSING_RESPONSE` |
| session | `SESSION_MISSING`, `SESSION_MALFORMED`, `SESSION_TAMPERED`, `SESSION_EXPIRED`, `SESSION_WRONG_AGENT`, `SESSION_WRONG_INTENT`, `SESSION_REPLAYED` |

## Layout

```
src/
  types.ts            chamber interface, reason codes, request shape
  crypto.ts           HMAC helpers, constant time compare, intent hash
  airlock.ts          runPipeline and the Airlock class
  reference.ts        reference registry, default chamber order, fixtures clock hooks
  chambers/*.ts       one file per chamber
fixtures/cases.json   25 fixture cases, each naming its expected reason code
test/
  chambers.test.ts    table driven fixture execution, per chamber
  order.test.ts       ordering and shadowing
  session-token.test.ts expiry and tampering
  stateless.test.ts   state isolation and replay ledger
  mutation.test.ts    chamber removal mutations
docs/DESIGN.md        chamber contracts and invariants
```

## Mutation harness

`test/mutation.test.ts` removes one chamber at a time from the pipeline, replays every fixture that targets the removed chamber, and fails unless more than half of them notice: either a different reason code or an authorisation that should not have happened. It also replays the whole table against the intact pipeline as a baseline. If someone deletes a chamber from the production order, `new Airlock(...)` throws and the suite fails loudly.

## Design notes

- Fixed clock (`NOW` in `test/helpers.ts`) so expiry and staleness are deterministic.
- All secrets in `src/reference.ts` and `fixtures/` are obvious throwaway strings named `not-a-live-secret`. Nothing here authenticates against anything.
- The only mutable state in `Airlock` is the spent nonce set. Every other chamber is a pure function of the request and the registry, which is what makes the no leak tests meaningful.
- Session tokens are `base64url(payload).base64url(HMAC-SHA256)`. The signature is checked before expiry, agent binding and intent binding, so a forged token reports `SESSION_TAMPERED` rather than a misleading downstream reason.

See `docs/DESIGN.md` for the chamber contracts.
