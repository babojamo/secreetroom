import { z } from 'zod';
export const JOBS = [
  'Arcanist',
  'Mentalist',
  'Forcemaster',
  'Seraph',
  'Crackshooter',
  'Harlequin',
  'Slayer',
  'Templar',
  'Psykeeper',
  'Ringmaster',
  'Ranger',
  'Blade',
  'Knight',
] as const;
export const ROLES = ['Tank', 'Support', 'AoE', 'DPS', 'Buff/DPS'] as const;
export type Role = (typeof ROLES)[number];
export const normalizeName = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase('en-US');
export const memberSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(60),
    job: z.enum(JOBS),
    level: z.coerce.number().int().min(1).max(999),
    primaryRole: z.enum(ROLES),
    roles: z.array(z.enum(ROLES)).min(1),
    status: z.enum(['ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED']).default('ACTIVE'),
    highDps: z.boolean().default(false),
    highAoe: z.boolean().default(false),
    core: z.boolean().default(false),
    available: z.boolean().default(true),
    dps: z.coerce.number().int().min(1).max(10).default(5),
    aoe: z.coerce.number().int().min(1).max(10).default(5),
    tank: z.coerce.number().int().min(1).max(10).default(5),
    support: z.coerce.number().int().min(1).max(10).default(5),
    equipment: z.string().max(4000).default(''),
    notes: z.string().max(4000).default(''),
  })
  .refine((m) => m.roles.includes(m.primaryRole), 'Primary role must be an eligible role.');
export type Member = z.infer<typeof memberSchema> & { id: string };
export const assignmentSchema = z.object({
  memberId: z.string(),
  party: z.number().int().min(0).max(2),
  slot: z.number().int().min(0).max(7),
  role: z.enum(ROLES),
  locked: z.boolean().default(false),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export type HistoryRun = {
  id: string;
  group: string;
  scheduledAt: string;
  finalizedAt: string | null;
  duration: number | null;
  ranking: number | null;
  drops: string;
  notes: string;
  attendance: {
    memberId: string;
    present: boolean;
    party: number;
    role: string;
    snapshot: { name: string; job: string; level: number };
  }[];
};
export type Run = {
  id: string;
  group: 'RANKING' | 'DROP';
  scheduledAt: string;
  status: string;
  target: number;
  allowOverlap: boolean;
  exclusions: string[];
  assignments: Assignment[];
  availability: { memberId: string; available: boolean }[];
};
export type Weights = { performance: number; fairness: number; core: number; balance: number };
export const defaultWeights: Weights = { performance: 6, fairness: 3, core: 2, balance: 5 };
export type State = {
  user: { email: string; role: string };
  revision: number;
  members: Member[];
  runs: Run[];
  history: HistoryRun[];
  settings: { weights: Weights; icons: Record<string, string> };
  audits: { id: string; action: string; actor: string; createdAt: string }[];
};
export function participation(memberId: string, history: HistoryRun[]) {
  const runs = [...history]
    .filter((r) => r.finalizedAt)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const dates = [...new Set(runs.map((r) => r.scheduledAt))];
  const joined = (date: string) =>
    runs.some(
      (r) =>
        r.scheduledAt === date && r.attendance.some((a) => a.memberId === memberId && a.present),
    );
  let missed = 0,
    consecutive = 0;
  for (const date of dates) {
    if (joined(date)) break;
    missed++;
  }
  for (const date of dates) {
    if (!joined(date)) break;
    consecutive++;
  }
  const attended = runs.filter((r) =>
    r.attendance.some((a) => a.memberId === memberId && a.present),
  );
  return {
    total: attended.length,
    missed,
    consecutive,
    last: attended[0]?.scheduledAt ?? null,
    previous: dates.length > 0 && joined(dates[0]),
    priority: missed * 3 + Math.max(0, 3 - consecutive),
  };
}
export function defaultRole(job: string): Role {
  return ['Templar', 'Knight'].includes(job)
    ? 'Tank'
    : ['Seraph', 'Ringmaster'].includes(job)
      ? 'Support'
      : job === 'Forcemaster'
        ? 'Buff/DPS'
        : ['Arcanist', 'Mentalist', 'Psykeeper', 'Ranger'].includes(job)
          ? 'AoE'
          : 'DPS';
}
export function eligibleMembers(members: Member[], run: Run, other: Run[]) {
  const conflicts = new Set(
    other
      .filter(
        (r) =>
          r.id !== run.id &&
          r.status !== 'COMPLETED' &&
          Math.abs(Date.parse(r.scheduledAt) - Date.parse(run.scheduledAt)) < 2 * 3600000 &&
          !(r.allowOverlap && run.allowOverlap),
      )
      .flatMap((r) => r.assignments.map((a) => a.memberId)),
  );
  return members.filter(
    (m) =>
      m.status === 'ACTIVE' &&
      (run.availability.find((a) => a.memberId === m.id)?.available ?? m.available) &&
      !run.exclusions.includes(m.id) &&
      !conflicts.has(m.id),
  );
}
export function validateLineup(
  assignments: Assignment[],
  run: Run,
  members: Member[],
  other: Run[] = [],
  complete = false,
  previous: Assignment[] = run.assignments,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>(),
    slots = new Set<string>();
  const eligible = new Set(eligibleMembers(members, run, other).map((m) => m.id));
  for (const a of assignments) {
    const m = members.find((m) => m.id === a.memberId);
    const key = `${a.party}:${a.slot}`;
    if (ids.has(a.memberId)) errors.push('A character may only appear once per run.');
    if (slots.has(key)) errors.push('Two characters occupy the same slot.');
    ids.add(a.memberId);
    slots.add(key);
    if (!m || !eligible.has(a.memberId))
      errors.push(
        `${m?.name ?? a.memberId} is unavailable, excluded, archived, or assigned to an overlapping run.`,
      );
    if (m && !m.roles.includes(a.role)) errors.push(`${m.name} is not eligible for ${a.role}.`);
    if (a.party < 0 || a.party > 2 || a.slot < 0 || a.slot > 7)
      errors.push('Party or slot is out of bounds.');
  }
  for (const a of previous.filter((a) => a.locked))
    if (
      !assignments.some(
        (b) =>
          b.memberId === a.memberId &&
          b.party === a.party &&
          b.slot === a.slot &&
          b.role === a.role,
      )
    )
      errors.push('Unlock a position before moving or replacing it.');
  for (let p = 0; p < 3; p++) {
    const party = assignments.filter((a) => a.party === p);
    if (party.length > 8) errors.push('A party cannot exceed eight members.');
    if (complete && run.group === 'RANKING') {
      if (party.length !== 8) errors.push(`Party ${p + 1} needs eight members.`);
      for (const role of ['Tank', 'Support'])
        if (!party.some((a) => a.role === role))
          errors.push(`Party ${p + 1} needs an eligible ${role}.`);
    }
  }
  if (complete && assignments.length !== (run.group === 'RANKING' ? 24 : run.target))
    errors.push(
      `This run requires exactly ${run.group === 'RANKING' ? 24 : run.target} participants.`,
    );
  return [...new Set(errors)];
}
export function warnings(assignments: Assignment[], members: Member[]): string[] {
  const result: string[] = [];
  for (let p = 0; p < 3; p++) {
    const party = assignments.filter((a) => a.party === p);
    if (!party.length) continue;
    for (const role of ['Tank', 'Support'])
      if (!party.some((a) => a.role === role))
        result.push(`Party ${p + 1}: missing ${role.toLowerCase()}.`);
    if (
      party.length === 8 &&
      !party.some(
        (a) =>
          members.find((m) => m.id === a.memberId)?.job === 'Forcemaster' && a.role === 'Buff/DPS',
      )
    )
      result.push(`Party ${p + 1}: no Forcemaster buff; flexible DPS used.`);
    if (party.length === 8 && party.filter((a) => a.role === 'AoE').length < 2)
      result.push(`Party ${p + 1}: fewer than two dedicated AoE members.`);
  }
  return result;
}
