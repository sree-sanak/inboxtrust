# InboxTrust

Open-source infrastructure for running a consent-based private email warmup network and deliverability dashboard.

InboxTrust is designed for teams that own or explicitly manage a small fleet of inboxes and want safer reputation maintenance without renting a black-box public warmup pool.

## What it does

- Maintains light warmup activity between approved inboxes
- Schedules realistic, low-volume email threads
- Tracks sender health, bounce signals, and domain authentication
- Enforces per-inbox and per-domain safety caps
- Pauses risky inboxes before they damage reputation

## What it is not

InboxTrust is **not** an open public warmup pool and should not be used to disguise spam. Public pools attract abusive senders and can poison every participant's reputation. The intended model is a closed, consent-based network of owned, team, or client-approved inboxes.

## MVP architecture

```text
Gmail/O365 OAuth accounts
        |
        v
InboxTrust API + scheduler
        |
        +--> Warmup planner
        +--> Trust graph
        +--> Safety/rate limits
        +--> Reputation checks
        |
        v
Postgres + job queue
```

## Core safety defaults

- OAuth only, no mailbox passwords
- Explicit inbox consent before participation
- 2-5 warmup threads per inbox per day by default
- No same-domain loop spam
- Auto-pause on bounce, complaint, spam-folder, or auth issues
- Human-readable audit log for every action

## Roadmap

- [ ] Gmail OAuth connector
- [ ] Microsoft 365 OAuth connector
- [ ] Trust graph and scheduling engine
- [ ] Warmup thread templates
- [ ] DNS/authentication checks: SPF, DKIM, DMARC, MX
- [ ] Google Postmaster import
- [ ] Microsoft SNDS/JMRP import
- [ ] Inbox placement seed tests
- [ ] Dashboard

## Development

```bash
npm install
npm run dev
npm test
```

## License

MIT
