# Safety model

InboxTrust should default to protecting sender reputation, not maximizing send volume.

## Allowed network types

- Owned company inboxes
- Employee inboxes with explicit consent
- Client inboxes with written approval
- Partner inboxes that opted into warmup

## Disallowed network types

- Anonymous public pools
- Purchased inboxes with unknown provenance
- Accounts added without owner consent
- Any inbox used to evade spam controls or platform enforcement

## Required controls

- OAuth grants must be revocable
- Every inbox has a visible owner and consent record
- Every sent message has an audit log
- Per-inbox daily caps are enforced server-side
- Same-domain loops are avoided
- Bad signals pause sending automatically

## Pause signals

- SPF, DKIM, or DMARC failure
- Bounce rate above threshold
- Spam-folder placement spike
- Provider throttling
- Complaint signal
- User revokes consent
