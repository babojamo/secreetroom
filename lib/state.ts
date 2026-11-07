import { db } from './db';
import { Member, Run, State, defaultWeights } from './domain';
export async function getState(user: {
  email: string;
  role: string;
  guildId: string;
}): Promise<State> {
  const guild = await db.guild.findUniqueOrThrow({
    where: { id: user.guildId },
    include: {
      members: { include: { roles: true, ratings: true }, orderBy: { name: 'asc' } },
      classes: true,
      events: {
        include: {
          runs: {
            include: {
              parties: { include: { assignments: true } },
              attendance: true,
              availability: true,
            },
          },
        },
        orderBy: { scheduledAt: 'desc' },
      },
      audits: { include: { actor: true }, orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  const members: Member[] = guild.members.map((m) => ({
    id: m.id,
    name: m.name,
    job: m.job as Member['job'],
    level: m.level,
    primaryRole: m.primaryRole as Member['primaryRole'],
    roles: m.roles.map((r) => r.role as Member['primaryRole']),
    status: m.status as Member['status'],
    highDps: m.highDps,
    highAoe: m.highAoe,
    core: m.core,
    available: m.available,
    equipment: m.equipment,
    notes: m.notes,
    dps: m.ratings?.dps ?? 5,
    aoe: m.ratings?.aoe ?? 5,
    tank: m.ratings?.tank ?? 5,
    support: m.ratings?.support ?? 5,
  }));
  const all = guild.events.flatMap((e) =>
    e.runs.map((r) => ({ ...r, scheduledAt: e.scheduledAt.toISOString() })),
  );
  const runs: Run[] = all
    .filter((r) => r.status !== 'COMPLETED')
    .map((r) => ({
      id: r.id,
      group: r.group as Run['group'],
      scheduledAt: r.scheduledAt,
      status: r.status,
      target: r.target,
      allowOverlap: r.allowOverlap,
      exclusions: r.exclusions,
      availability: r.availability.map((a) => ({ memberId: a.memberId, available: a.available })),
      assignments: r.parties.flatMap((p) =>
        p.assignments.map((a) => ({
          memberId: a.memberId,
          party: p.number,
          slot: a.slot,
          role: a.role as Member['primaryRole'],
          locked: a.locked,
        })),
      ),
    }));
  const settings = guild.settings as Partial<State['settings']>;
  return {
    user: { email: user.email, role: user.role },
    revision: guild.revision,
    members,
    runs,
    history: all
      .filter((r) => r.finalizedAt)
      .map((r) => ({
        id: r.id,
        group: r.group,
        scheduledAt: r.scheduledAt,
        finalizedAt: r.finalizedAt!.toISOString(),
        duration: r.duration,
        ranking: r.ranking,
        drops: r.drops,
        notes: r.notes,
        attendance: r.attendance.map((a) => ({
          memberId: a.memberId,
          present: a.present,
          party: a.party,
          role: a.role,
          snapshot: a.snapshot as { name: string; job: string; level: number },
        })),
      })),
    settings: {
      weights: settings.weights ?? defaultWeights,
      icons: Object.fromEntries(guild.classes.filter((c) => c.icon).map((c) => [c.name, c.icon!])),
    },
    audits: guild.audits.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actor.email,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
