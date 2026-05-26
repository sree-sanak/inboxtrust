# InboxTrust

InboxTrust is open-source infrastructure for a **smart, consent-based public email warmup pool**.

The goal is to let operators connect real Gmail, Microsoft 365, and InboxKit-managed inboxes, pass safety checks, and participate in a reputation-aware warmup network that protects the whole pool instead of blindly generating fake activity.

## Vision

Most warmup tools sell access to opaque pools. Those pools can be poisoned by bad actors, abused senders, and low-quality inboxes. InboxTrust is designed around the opposite model:

- explicit participant consent
- OAuth/managed-infra integrations only, never mailbox passwords
- admission scoring before any inbox can join the pool
- trust-tier matching so risky accounts cannot poison healthy ones
- explainable scheduling and audit logs
- hard caps by inbox, domain, provider, and pair reuse
- automatic quarantine/pause recommendations when signals degrade

Use it for your own inbox fleet first. Then grow into a public pool with safety gates strong enough that good participants want to stay.

## Current core

The MVP now includes a deterministic TypeScript warmup intelligence engine:

- `evaluateAdmission()` — accepts, quarantines, or rejects inboxes using consent, DNS/auth, domain age, bounce, complaint, spam, open, reply, and placement signals.
- `explainMatch()` — scores pair compatibility and explains why a match is allowed or blocked.
- `planSmartWarmup()` — creates multi-step warmup threads with send, open, reply, mark-important, archive, and spam-rescue actions.
- `recommendSafetyActions()` — recommends pause/quarantine events for risky inboxes.

## Example

```bash
npm install
npm run dev
npm test
npm run lint
```

`npm run dev` prints:

- admission decisions
- upcoming scheduled warmup actions
- safety recommendations

## Public pool safety model

InboxTrust should treat the public pool like shared infrastructure:

1. **Admission gate** — no consent, no DNS auth, high bounces, high complaints, high spam placement, or very young domains are rejected or quarantined.
2. **Trust tiers** — new, growth, and established inboxes are matched carefully. Low-trust accounts do not get to touch high-trust accounts.
3. **Load balancing** — send volume is capped by inbox/domain/provider and pair reuse is limited.
4. **Human-like sequencing** — every planned thread has a realistic lifecycle rather than single isolated sends.
5. **Auditability** — every accept/reject/schedule/pause decision has a reason.
6. **Auto-pause** — risky signals pause participation before they damage everyone else.

## InboxKit integration path

InboxKit is the intended infrastructure layer for buying/provisioning inboxes, domains, warmup settings, inbox placement, DNS, and InfraGuard checks.

Planned integration:

- import InboxKit mailbox/domain inventory
- map InboxKit warmup and health signals into `ReputationSignals`
- use InboxKit DNS/InfraGuard data for admission scoring
- create InboxTrust pool records from InboxKit-managed inboxes
- keep live send/receive mutations behind explicit approval and policy gates

The Hermes MCP server is configured as `inboxkit`, but OAuth still needs browser authorization before tools are available in future sessions.

## Architecture

```text
InboxKit / Gmail / Microsoft OAuth
        |
        v
InboxTrust admission + trust graph
        |
        +--> reputation scoring
        +--> match explanation
        +--> cap enforcement
        +--> warmup action planner
        +--> safety recommendations
        |
        v
Job queue + provider adapters + dashboard
```

## Roadmap

- [x] Deterministic smart scheduler core
- [x] Admission/risk scoring
- [x] Trust-aware matching explanations
- [x] Multi-step warmup actions
- [x] Safety recommendation engine
- [ ] Persistent Postgres schema
- [ ] InboxKit MCP-backed importer
- [ ] Gmail OAuth execution adapter
- [ ] Microsoft Graph execution adapter
- [ ] Dashboard for pool health and audit trail
- [ ] Admin approval workflow for public-pool applicants

## What it is not

InboxTrust is not a spam disguise tool. It should reject participants that create risk for the pool and should never bypass provider rules, consent, or safety caps.

## License

MIT
