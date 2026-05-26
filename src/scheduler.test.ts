import assert from 'node:assert/strict';
import { planWarmupJobs, type Inbox } from './scheduler.js';

const inboxes: Inbox[] = [
  { id: 'a1', email: 'a@alpha.com', domain: 'alpha.com', provider: 'gmail', dailyWarmupLimit: 2 },
  { id: 'a2', email: 'b@alpha.com', domain: 'alpha.com', provider: 'gmail', dailyWarmupLimit: 2 },
  { id: 'b1', email: 'a@beta.com', domain: 'beta.com', provider: 'microsoft', dailyWarmupLimit: 2 },
  { id: 'c1', email: 'a@gamma.com', domain: 'gamma.com', provider: 'gmail', dailyWarmupLimit: 1 },
];

const jobs = planWarmupJobs(inboxes, new Date('2026-01-01T00:00:00Z'));

assert.ok(jobs.length > 0);
assert.ok(jobs.every((job) => job.from.id !== job.to.id));
assert.ok(jobs.every((job) => job.from.domain !== job.to.domain));
assert.ok(jobs.every((job) => job.scheduledAt > new Date('2026-01-01T00:00:00Z')));

console.log(`planned ${jobs.length} warmup jobs`);
