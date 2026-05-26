export type Inbox = {
  id: string;
  email: string;
  domain: string;
  provider: 'gmail' | 'microsoft' | 'smtp';
  dailyWarmupLimit: number;
  paused?: boolean;
};

export type WarmupJob = {
  from: Inbox;
  to: Inbox;
  subject: string;
  scheduledAt: Date;
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

function chooseSubject(from: Inbox, to: Inbox, index: number): string {
  const subjects = [
    'quick check-in',
    'notes from today',
    'small update',
    'following up here',
    'sync note',
  ];
  return subjects[(from.email.length + to.email.length + index) % subjects.length];
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function jitterMinutes(a: string, b: string): number {
  const seed = `${a}:${b}`.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % 37;
}
