import {
  evaluateAdmission,
  planSmartWarmup,
  recommendSafetyActions,
  type PoolInbox,
  type PoolPolicy,
  type ReputationSignals,
} from './scheduler.js';

const policy: PoolPolicy = {
  maxInboxActionsPerDay: 6,
  maxDomainActionsPerDay: 12,
  maxProviderSharePerBatch: 0.7,
  maxPairActionsPerWeek: 3,
  minAdmissionScore: 70,
  quarantineScore: 55,
  lowTrustIsolationScore: 65,
  spamRescueRate: 0.15,
  quietHours: { startHour: 21, endHour: 7 },
};

const healthy: ReputationSignals = {
  spfPass: true,
  dkimPass: true,
  dmarcPass: true,
  mxValid: true,
  domainAgeDays: 240,
  bounceRate: 0.008,
  complaintRate: 0.001,
  spamRate: 0.012,
  replyRate: 0.22,
  openRate: 0.71,
  inboxPlacementRate: 0.95,
  recentManualReview: true,
};

const inboxes: PoolInbox[] = [
  makeInbox('sree', 'sree@example-a.com', 'gmail', 'established', healthy),
  makeInbox('ops', 'ops@example-b.com', 'microsoft', 'growth', { ...healthy, replyRate: 0.18 }),
  makeInbox('founder', 'founder@example-c.com', 'gmail', 'growth', { ...healthy, spamRate: 0.18 }),
  makeInbox('risky', 'admin@new-domain.test', 'smtp', 'new', {
    ...healthy,
    dkimPass: false,
    dmarcPass: false,
    domainAgeDays: 5,
    bounceRate: 0.08,
    complaintRate: 0.02,
    inboxPlacementRate: 0.58,
  }),
];

const now = new Date('2026-01-01T14:00:00Z');
const plan = planSmartWarmup(inboxes, policy, now);

console.log('\nAdmission decisions');
console.table(plan.admissions.map((admission) => ({ inbox: admission.inboxId, decision: admission.decision, score: admission.score, reasons: admission.reasons.join('; ') })));

console.log('\nNext warmup actions');
console.table(plan.actions.slice(0, 20).map((action) => ({
  at: action.scheduledAt.toISOString(),
  kind: action.kind,
  from: action.from.email,
  to: action.to.email,
  subject: action.subject,
})));

console.log('\nSafety recommendations');
console.table(recommendSafetyActions(inboxes, policy, now).map((event) => ({ inbox: event.inboxId, action: event.action, score: event.score, reason: event.reason })));

function makeInbox(id: string, email: string, provider: PoolInbox['provider'], trustTier: PoolInbox['trustTier'], signals: ReputationSignals): PoolInbox {
  return {
    id,
    email,
    domain: email.split('@')[1],
    provider,
    timezone: 'America/Chicago',
    consent: { poolWarmup: true, spamRescue: true, replySimulation: true, dataProcessing: true },
    status: 'active',
    trustTier,
    dailyWarmupLimit: 3,
    signals,
    recentPairIds: [],
  };
}
