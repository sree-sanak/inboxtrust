import * as assert from 'node:assert/strict';
import {
  evaluateAdmission,
  explainMatch,
  planSmartWarmup,
  recommendSafetyActions,
  type PoolInbox,
  type PoolPolicy,
  type ReputationSignals,
} from './scheduler.js';

const policy: PoolPolicy = {
  maxInboxActionsPerDay: 6,
  maxDomainActionsPerDay: 8,
  maxProviderSharePerBatch: 0.7,
  maxPairActionsPerWeek: 3,
  minAdmissionScore: 70,
  quarantineScore: 55,
  lowTrustIsolationScore: 65,
  spamRescueRate: 0.15,
  quietHours: { startHour: 21, endHour: 7 },
};

const healthySignals: ReputationSignals = {
  spfPass: true,
  dkimPass: true,
  dmarcPass: true,
  mxValid: true,
  domainAgeDays: 180,
  bounceRate: 0.01,
  complaintRate: 0.001,
  spamRate: 0.01,
  replyRate: 0.21,
  openRate: 0.73,
  inboxPlacementRate: 0.94,
  recentManualReview: true,
};

function inbox(overrides: Partial<PoolInbox>): PoolInbox {
  const email = overrides.email ?? `${overrides.id ?? 'i'}@${overrides.domain ?? 'example.com'}`;
  const domain = overrides.domain ?? email.split('@')[1];
  return {
    id: overrides.id ?? email,
    email,
    domain,
    provider: overrides.provider ?? 'gmail',
    timezone: overrides.timezone ?? 'America/Chicago',
    consent: overrides.consent ?? { poolWarmup: true, spamRescue: true, replySimulation: true, dataProcessing: true },
    status: overrides.status ?? 'active',
    trustTier: overrides.trustTier ?? 'growth',
    dailyWarmupLimit: overrides.dailyWarmupLimit ?? 3,
    signals: overrides.signals ?? healthySignals,
    recentPairIds: overrides.recentPairIds ?? [],
  };
}

const alpha = inbox({ id: 'alpha-1', email: 'founder@alpha.com', domain: 'alpha.com', provider: 'gmail', trustTier: 'established' });
const alphaPeer = inbox({ id: 'alpha-2', email: 'ops@alpha.com', domain: 'alpha.com', provider: 'microsoft' });
const beta = inbox({ id: 'beta-1', email: 'sales@beta.io', domain: 'beta.io', provider: 'microsoft', trustTier: 'growth' });
const gamma = inbox({ id: 'gamma-1', email: 'hello@gamma.ai', domain: 'gamma.ai', provider: 'gmail', trustTier: 'new' });
const delta = inbox({ id: 'delta-1', email: 'team@delta.dev', domain: 'delta.dev', provider: 'smtp', trustTier: 'growth' });

assert.equal(evaluateAdmission(alpha, policy).decision, 'accepted');

const noConsent = evaluateAdmission(inbox({ id: 'no-consent', consent: { poolWarmup: false, spamRescue: true, replySimulation: true, dataProcessing: true } }), policy);
assert.equal(noConsent.decision, 'rejected');
assert.ok(noConsent.reasons.some((reason) => reason.includes('consent')));

const unauthenticated = evaluateAdmission(inbox({ id: 'bad-auth', signals: { ...healthySignals, dkimPass: false, dmarcPass: false } }), policy);
assert.equal(unauthenticated.decision, 'rejected');
assert.ok(unauthenticated.score < policy.minAdmissionScore);

const risky = inbox({ id: 'risky', email: 'risky@risk.test', domain: 'risk.test', signals: { ...healthySignals, bounceRate: 0.09, complaintRate: 0.03, spamRate: 0.18, inboxPlacementRate: 0.5 } });
const riskDecision = evaluateAdmission(risky, policy);
assert.equal(riskDecision.decision, 'rejected');
assert.ok(riskDecision.reasons.some((reason) => reason.includes('bounce') || reason.includes('complaint') || reason.includes('spam')));

const planned = planSmartWarmup([alpha, alphaPeer, beta, gamma, delta], policy, new Date('2026-01-01T13:00:00Z'));
assert.ok(planned.actions.length > 0);
assert.ok(planned.actions.every((action) => action.from.domain !== action.to.domain));
assert.ok(planned.actions.every((action) => action.scheduledAt >= new Date('2026-01-01T13:00:00Z')));

const byInbox = new Map<string, number>();
const byDomain = new Map<string, number>();
for (const action of planned.actions.filter((action) => action.kind === 'send')) {
  byInbox.set(action.from.id, (byInbox.get(action.from.id) ?? 0) + 1);
  byDomain.set(action.from.domain, (byDomain.get(action.from.domain) ?? 0) + 1);
}
assert.ok(Array.from(byInbox.values()).every((count) => count <= policy.maxInboxActionsPerDay));
assert.ok(Array.from(byDomain.values()).every((count) => count <= policy.maxDomainActionsPerDay));

const threadIds = new Set(planned.actions.map((action) => action.threadId));
assert.ok(threadIds.size > 0);
for (const threadId of Array.from(threadIds)) {
  const thread = planned.actions.filter((action) => action.threadId === threadId);
  assert.ok(thread.some((action) => action.kind === 'send'));
  assert.ok(thread.some((action) => action.kind === 'open'));
  assert.ok(thread.some((action) => action.kind === 'reply'));
}
assert.ok(planned.actions.some((action) => action.kind === 'mark_important' || action.kind === 'archive'));

const explanation = explainMatch(alpha, beta, policy);
assert.ok(explanation.score > 0);
assert.ok(explanation.reasons.some((reason) => reason.includes('different domains')));
assert.ok(explanation.reasons.some((reason) => reason.includes('compatible trust')));

const sameDomainExplanation = explainMatch(alpha, alphaPeer, policy);
assert.equal(sameDomainExplanation.allowed, false);
assert.ok(sameDomainExplanation.reasons.some((reason) => reason.includes('same domain')));

const recommendations = recommendSafetyActions([alpha, risky], policy);
assert.ok(recommendations.some((event) => event.inboxId === risky.id && event.action === 'pause'));
assert.ok(recommendations.some((event) => event.inboxId === risky.id && event.reason.includes('risk')));

console.log(`planned ${planned.actions.length} smart warmup actions across ${threadIds.size} threads`);
