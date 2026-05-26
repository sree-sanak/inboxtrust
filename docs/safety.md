# InboxTrust safety model

InboxTrust is designed for a public warmup pool where the main product advantage is **not** volume. It is trust, filtering, and reputation protection.

## Safety principles

1. **Consent first** — every inbox must explicitly opt into pool warmup, reply simulation, spam rescue, and data processing scopes as needed.
2. **No passwords** — use OAuth or managed providers such as InboxKit. Do not store mailbox passwords.
3. **Reject risky infrastructure** — incomplete SPF/DKIM/DMARC/MX, very new domains, high bounce rates, high complaint rates, or poor inbox placement should block or quarantine admission.
4. **Protect high-trust accounts** — new or degraded inboxes should not be matched into established accounts until their metrics improve.
5. **Cap everything** — enforce limits by inbox, domain, provider, and pair reuse.
6. **Explain every decision** — each admission, match, schedule, quarantine, and pause action should produce an audit reason.
7. **Pause before damage spreads** — declining placement, spam placement spikes, bounces, and complaints should pause participation automatically.

## Public pool admission states

- **Accepted** — authenticated, consenting, healthy inbox; eligible for matching.
- **Quarantined** — borderline score; can be monitored or manually reviewed, but should not affect strong inboxes.
- **Rejected** — missing consent, failed authentication, unsafe complaint/bounce/spam metrics, or otherwise high risk.

## Matching rules

- Never match an inbox to itself.
- Never match same-domain pairs.
- Prefer cross-provider diversity when safe.
- Prefer similar or adjacent trust tiers.
- Penalize recent pair reuse.
- Block low-trust senders from high-trust receivers.

## Warmup action lifecycle

A planned warmup thread can include:

1. `send`
2. `spam_rescue` when the receiver has consented and the spam-rate signal warrants it
3. `open`
4. `reply`
5. `mark_important`
6. `archive`

Provider adapters should execute these only after policy checks and user authorization.

## InboxKit role

InboxKit should supply managed inbox/domain inventory and health signals:

- mailbox metadata
- domain DNS/auth status
- warmup settings
- inbox placement checks
- InfraGuard/domain health
- billing/provisioning for owned inboxes

InboxTrust should consume those signals for scoring and scheduling. It should not perform live mutations through InboxKit until the operator explicitly enables execution.
