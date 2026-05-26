import { planWarmupJobs, type Inbox } from './scheduler.js';

const demoInboxes: Inbox[] = [
  { id: 'inbox_1', email: 'founder@example-a.com', domain: 'example-a.com', provider: 'gmail', dailyWarmupLimit: 2 },
  { id: 'inbox_2', email: 'ops@example-b.com', domain: 'example-b.com', provider: 'microsoft', dailyWarmupLimit: 2 },
  { id: 'inbox_3', email: 'sales@example-c.com', domain: 'example-c.com', provider: 'gmail', dailyWarmupLimit: 2 },
];

const jobs = planWarmupJobs(demoInboxes);
console.table(jobs.map((job) => ({ from: job.from.email, to: job.to.email, subject: job.subject, scheduledAt: job.scheduledAt.toISOString() })));
