export type Provider = 'gmail' | 'microsoft' | 'smtp';
export type InboxStatus = 'active' | 'quarantined' | 'paused';
export type TrustTier = 'new' | 'growth' | 'established';
export type WarmupActionKind = 'send' | 'open' | 'reply' | 'mark_important' | 'archive' | 'spam_rescue';
export type AdmissionDecision = 'accepted' | 'quarantined' | 'rejected';

export type Inbox = {
  id: string;
  email: string;
  domain: string;
  provider: Provider;
  dailyWarmupLimit: number;
  paused?: boolean;
};

export type Consent = {
  poolWarmup: boolean;
  spamRescue?: boolean;
  replySimulation?: boolean;
  dataProcessing?: boolean;
};

export type ReputationSignals = {
  spfPass: boolean;
  dkimPass: boolean;
  dmarcPass: boolean;
  mxValid: boolean;
  domainAgeDays: number;
  bounceRate: number;
  complaintRate: number;
  spamRate: number;
  replyRate: number;
  openRate: number;
  inboxPlacementRate: number;
  recentManualReview?: boolean;
};

export type PoolInbox = Inbox & {
  timezone: string;
  consent: Consent;
  status: InboxStatus;
  trustTier: TrustTier;
  signals: ReputationSignals;
  recentPairIds: string[];
};

export type PoolPolicy = {
  maxInboxActionsPerDay: number;
  maxDomainActionsPerDay: number;
  maxProviderSharePerBatch: number;
  maxPairActionsPerWeek: number;
  minAdmissionScore: number;
  quarantineScore: number;
  lowTrustIsolationScore: number;
  spamRescueRate: number;
  quietHours: { startHour: number; endHour: number };
};

export type WarmupJob = {
  from: Inbox;
  to: Inbox;
  subject: string;
  scheduledAt: Date;
};

export type AdmissionResult = {
  inboxId: string;
  decision: AdmissionDecision;
  score: number;
  reasons: string[];
};

export type MatchExplanation = {
  allowed: boolean;
  score: number;
  reasons: string[];
};

export type WarmupAction = {
  id: string;
  threadId: string;
  kind: WarmupActionKind;
  from: PoolInbox;
  to: PoolInbox;
  subject: string;
  scheduledAt: Date;
  reason: string;
};

export type SmartWarmupPlan = {
  admissions: AdmissionResult[];
  actions: WarmupAction[];
  audit: AuditEvent[];
};

export type AuditEvent = {
  inboxId: string;
  action: 'accept' | 'quarantine' | 'reject' | 'schedule' | 'pause';
  score?: number;
  reason: string;
  at: Date;
};

export function planWarmupJobs(inboxes: Inbox[], now = new Date()): WarmupJob[] {
  const active = inboxes.filter((inbox) => !inbox.paused && inbox.dailyWarmupLimit > 0);
  const jobs: WarmupJob[] = [];

  for (const from of active) {
    const candidates = active.filter((to) => to.id !== from.id && to.domain !== from.domain);
    const selected = candidates.slice(0, Math.min(from.dailyWarmupLimit, candidates.length));

    selected.forEach((to, index) => {
      jobs.push({
        from,
        to,
        subject: chooseSubject(from, to, index),
        scheduledAt: addMinutes(now, 30 + index * 90 + jitterMinutes(from.id, to.id)),
      });
    });
  }

  return jobs;
}

export function evaluateAdmission(inbox: PoolInbox, policy: PoolPolicy): AdmissionResult {
  let score = 100;
  const reasons: string[] = [];

  if (!inbox.consent.poolWarmup || !inbox.consent.dataProcessing) {
    score -= 60;
    reasons.push('missing required consent for pool warmup/data processing');
  }
  if (!inbox.signals.spfPass || !inbox.signals.dkimPass || !inbox.signals.dmarcPass || !inbox.signals.mxValid) {
    score -= 60;
    reasons.push('domain authentication is incomplete');
  }
  if (inbox.signals.domainAgeDays < 21) {
    score -= 15;
    reasons.push('domain is too new for public pool trust');
  }
  if (isRiskyAddress(inbox.email)) {
    score -= 12;
    reasons.push('role/catchall-style inbox increases pool abuse risk');
  }
  if (inbox.status === 'paused') {
    score -= 50;
    reasons.push('inbox is paused');
  }
  if (inbox.signals.bounceRate > 0.05) {
    score -= 30;
    reasons.push('bounce rate exceeds safety threshold');
  }
  if (inbox.signals.complaintRate > 0.01) {
    score -= 35;
    reasons.push('complaint rate exceeds safety threshold');
  }
  if (inbox.signals.spamRate > 0.1) {
    score -= 25;
    reasons.push('spam placement rate is unsafe');
  }
  if (inbox.signals.inboxPlacementRate < 0.7) {
    score -= 20;
    reasons.push('inbox placement rate is too low');
  }
  if (inbox.signals.replyRate > 0.15) score += 5;
  if (inbox.signals.openRate > 0.6) score += 5;
  if (inbox.signals.recentManualReview) score += 3;

  score = clamp(Math.round(score), 0, 100);
  const hasSevereBounceOrComplaint = inbox.signals.bounceRate > 0.05 || inbox.signals.complaintRate > 0.01;
  const hasUnsafePlacement = inbox.signals.spamRate > 0.1 || inbox.signals.inboxPlacementRate < 0.7;
  const scoreDecision: AdmissionDecision = score >= policy.minAdmissionScore ? 'accepted' : score >= policy.quarantineScore ? 'quarantined' : 'rejected';
  const decision: AdmissionDecision = hasSevereBounceOrComplaint ? 'rejected' : hasUnsafePlacement && scoreDecision === 'accepted' ? 'quarantined' : scoreDecision;
  if (reasons.length === 0) reasons.push('healthy authenticated consenting inbox');
  return { inboxId: inbox.id, decision, score, reasons };
}

export function explainMatch(from: PoolInbox, to: PoolInbox, policy: PoolPolicy): MatchExplanation {
  const reasons: string[] = [];
  if (from.id === to.id) return { allowed: false, score: 0, reasons: ['cannot match inbox with itself'] };
  if (from.domain === to.domain) return { allowed: false, score: 0, reasons: ['same domain pairing is blocked'] };
  if (from.status !== 'active' || to.status !== 'active') return { allowed: false, score: 0, reasons: ['both inboxes must be active'] };

  const fromAdmission = evaluateAdmission(from, policy);
  const toAdmission = evaluateAdmission(to, policy);
  if (fromAdmission.score < policy.lowTrustIsolationScore && toAdmission.score >= policy.minAdmissionScore) {
    return { allowed: false, score: 0, reasons: ['low-trust sender cannot touch high-trust receiver'] };
  }

  let score = 50;
  reasons.push('different domains');

  if (from.provider !== to.provider) {
    score += 12;
    reasons.push('cross-provider diversity');
  }

  const tierGap = Math.abs(tierValue(from.trustTier) - tierValue(to.trustTier));
  if (tierGap <= 1) {
    score += 18;
    reasons.push('compatible trust tiers');
  } else {
    score -= 25;
    reasons.push('trust tier gap is large');
  }

  const pairId = pairKey(from.id, to.id);
  const recentUses = from.recentPairIds.filter((id) => id === pairId).length + to.recentPairIds.filter((id) => id === pairId).length;
  if (recentUses >= policy.maxPairActionsPerWeek) {
    return { allowed: false, score: 0, reasons: ['pair was used too often recently'] };
  }
  if (recentUses === 0) {
    score += 10;
    reasons.push('fresh pair');
  } else {
    score -= recentUses * 8;
    reasons.push('recent pair reuse penalty');
  }

  score += Math.round((fromAdmission.score + toAdmission.score - 140) / 6);
  return { allowed: score > 0, score: clamp(score, 0, 100), reasons };
}

export function planSmartWarmup(inboxes: PoolInbox[], policy: PoolPolicy, now = new Date()): SmartWarmupPlan {
  const admissions = inboxes.map((inbox) => evaluateAdmission(inbox, policy));
  const byId = new Map(admissions.map((admission) => [admission.inboxId, admission]));
  const audit: AuditEvent[] = admissions.map((admission) => ({
    inboxId: admission.inboxId,
    action: admission.decision === 'accepted' ? 'accept' : admission.decision === 'quarantined' ? 'quarantine' : 'reject',
    score: admission.score,
    reason: admission.reasons.join('; '),
    at: now,
  }));

  const active = inboxes.filter((inbox) => inbox.status === 'active' && byId.get(inbox.id)?.decision === 'accepted');
  const sentByInbox = new Map<string, number>();
  const sentByDomain = new Map<string, number>();
  const providerCounts = new Map<Provider, number>();
  const actions: WarmupAction[] = [];

  const matches = active.flatMap((from) =>
    active
      .filter((to) => to.id !== from.id)
      .map((to) => ({ from, to, explanation: explainMatch(from, to, policy) }))
      .filter((match) => match.explanation.allowed),
  ).sort((a, b) => b.explanation.score - a.explanation.score || pairKey(a.from.id, a.to.id).localeCompare(pairKey(b.from.id, b.to.id)));

  for (const match of matches) {
    const inboxCount = sentByInbox.get(match.from.id) ?? 0;
    const domainCount = sentByDomain.get(match.from.domain) ?? 0;
    if (inboxCount >= Math.min(match.from.dailyWarmupLimit, policy.maxInboxActionsPerDay)) continue;
    if (domainCount >= policy.maxDomainActionsPerDay) continue;
    if (wouldExceedProviderShare(providerCounts, match.from.provider, active.length * policy.maxInboxActionsPerDay, policy)) continue;

    const threadIndex = actions.filter((action) => action.kind === 'send').length;
    const threadActions = buildThreadActions(match.from, match.to, threadIndex, now, policy, match.explanation.reasons.join(', '));
    actions.push(...threadActions);
    sentByInbox.set(match.from.id, inboxCount + 1);
    sentByDomain.set(match.from.domain, domainCount + 1);
    providerCounts.set(match.from.provider, (providerCounts.get(match.from.provider) ?? 0) + 1);
    audit.push({ inboxId: match.from.id, action: 'schedule', score: match.explanation.score, reason: `matched ${match.to.id}: ${match.explanation.reasons.join(', ')}`, at: now });
  }

  return { admissions, actions: actions.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()), audit };
}

export function recommendSafetyActions(inboxes: PoolInbox[], policy: PoolPolicy, now = new Date()): AuditEvent[] {
  return inboxes.flatMap<AuditEvent>((inbox) => {
    const admission = evaluateAdmission(inbox, policy);
    const severe = inbox.signals.bounceRate > 0.05 || inbox.signals.complaintRate > 0.01 || inbox.signals.spamRate > 0.1 || inbox.signals.inboxPlacementRate < 0.7;
    if (severe || admission.score < policy.quarantineScore) {
      return [{ inboxId: inbox.id, action: 'pause' as const, score: admission.score, reason: `risk pause: ${admission.reasons.join('; ')}`, at: now }];
    }
    if (admission.decision === 'quarantined') {
      return [{ inboxId: inbox.id, action: 'quarantine' as const, score: admission.score, reason: admission.reasons.join('; '), at: now }];
    }
    return [];
  });
}

function buildThreadActions(from: PoolInbox, to: PoolInbox, index: number, now: Date, policy: PoolPolicy, reason: string): WarmupAction[] {
  const threadId = `thread_${from.id}_${to.id}_${index}`;
  const subject = chooseSubject(from, to, index);
  const start = nextSafeTime(addMinutes(now, 37 + index * 53 + jitterMinutes(from.id, to.id)), policy);
  const base = { threadId, from, to, subject, reason };
  const actions: WarmupAction[] = [
    { ...base, id: `${threadId}_send`, kind: 'send', scheduledAt: start },
    { ...base, id: `${threadId}_open`, kind: 'open', from: to, to: from, scheduledAt: addMinutes(start, 17 + (index % 11)) },
    { ...base, id: `${threadId}_reply`, kind: 'reply', from: to, to: from, scheduledAt: addMinutes(start, 75 + (index % 23)) },
    { ...base, id: `${threadId}_important`, kind: 'mark_important', from: to, to: from, scheduledAt: addMinutes(start, 84 + (index % 17)) },
    { ...base, id: `${threadId}_archive`, kind: 'archive', from: to, to: from, scheduledAt: addMinutes(start, 120 + (index % 29)) },
  ];
  if (to.consent.spamRescue && to.signals.spamRate > policy.spamRescueRate) {
    actions.splice(1, 0, { ...base, id: `${threadId}_spam_rescue`, kind: 'spam_rescue', from: to, to: from, scheduledAt: addMinutes(start, 13) });
  }
  return actions;
}

function wouldExceedProviderShare(providerCounts: Map<Provider, number>, provider: Provider, maxPossible: number, policy: PoolPolicy): boolean {
  const total = Array.from(providerCounts.values()).reduce((sum, count) => sum + count, 0);
  if (total < 3) return false;
  const nextProviderCount = (providerCounts.get(provider) ?? 0) + 1;
  const nextTotal = Math.min(total + 1, Math.max(1, maxPossible));
  return nextProviderCount / nextTotal > policy.maxProviderSharePerBatch;
}

function chooseSubject(from: Inbox, to: Inbox, index: number): string {
  const subjects = ['quick check-in', 'notes from today', 'small update', 'following up here', 'sync note'];
  return subjects[(from.email.length + to.email.length + index) % subjects.length];
}

function nextSafeTime(date: Date, policy: PoolPolicy): Date {
  const hour = date.getHours();
  const { startHour, endHour } = policy.quietHours;
  const inQuietHours = startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
  if (!inQuietHours) return date;
  const next = new Date(date);
  next.setHours(endHour, 12 + (date.getMinutes() % 37), 0, 0);
  if (hour >= startHour) next.setDate(next.getDate() + 1);
  return next;
}

function isRiskyAddress(email: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  return ['admin', 'info', 'support', 'sales', 'hello', 'contact', 'team'].includes(local);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function jitterMinutes(a: string, b: string): number {
  const seed = `${a}:${b}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % 37;
}

function tierValue(tier: TrustTier): number {
  return tier === 'new' ? 1 : tier === 'growth' ? 2 : 3;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
