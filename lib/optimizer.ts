import {
  Assignment,
  Member,
  Run,
  HistoryRun,
  Weights,
  defaultWeights,
  eligibleMembers,
  participation,
  validateLineup,
  warnings,
  Role,
} from './domain';
export function generateLineup(
  run: Run,
  members: Member[],
  history: HistoryRun[],
  other: Run[] = [],
  weights: Weights = defaultWeights,
): { assignments: Assignment[]; warnings: string[] } {
  const target = run.group === 'RANKING' ? 24 : run.target;
  if (!Number.isInteger(target) || target < 1 || target > 24)
    throw new Error('Choose between 1 and 24 participants.');
  const pool = eligibleMembers(members, run, other).sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length < target)
    throw new Error(
      `Need ${target} eligible members; only ${pool.length} are available. Import members, update availability, or resolve overlapping assignments.`,
    );
  const assignments = run.assignments.filter((a) => a.locked).map((a) => ({ ...a }));
  const initialErrors = validateLineup(assignments, { ...run, assignments }, members, other, false);
  if (initialErrors.length) throw new Error(initialErrors.join(' '));
  if (assignments.length > target)
    throw new Error('More locked members than the requested participant count.');
  const used = new Set(assignments.map((a) => a.memberId));
  const stats = new Map(pool.map((m) => [m.id, participation(m.id, history)]));
  const rating = (m: Member, r: Role) =>
    r === 'Tank'
      ? m.tank
      : r === 'Support'
        ? m.support
        : r === 'AoE'
          ? m.aoe
          : r === 'Buff/DPS'
            ? (m.dps + m.support) / 2
            : m.dps;
  const strength = (m: Member) => m.dps + m.aoe * 0.65 + (m.highDps ? 3 : 0) + (m.highAoe ? 2 : 0);
  const partyStrength = (p: number) =>
    assignments
      .filter((a) => a.party === p)
      .reduce((n, a) => n + strength(pool.find((m) => m.id === a.memberId)!), 0);
  const rank = (m: Member, r: Role, p: number) =>
    rating(m, r) * weights.performance +
    (m.highDps && r === 'DPS' ? weights.performance * 2 : 0) +
    (m.highAoe && r === 'AoE' ? weights.performance * 2 : 0) +
    (m.core ? weights.core * (r === 'Tank' || r === 'Support' ? 3 : 1) : 0) +
    (stats.get(m.id)!.priority - stats.get(m.id)!.consecutive) *
      weights.fairness *
      (run.group === 'DROP' ? 3 : 1) +
    m.level * 0.005 -
    partyStrength(p) * weights.balance * 0.08 -
    (run.group === 'DROP' &&
    other.some((o) => o.group === 'RANKING' && o.assignments.some((a) => a.memberId === m.id))
      ? weights.fairness * 10
      : 0);
  const capacity = [0, 1, 2].map((p) =>
    run.group === 'RANKING' ? 8 : Math.max(0, Math.min(8, target - p * 8)),
  );
  for (const a of assignments)
    if (a.slot >= capacity[a.party])
      throw new Error('A locked slot lies outside the Drop Run participant count.');
  const add = (m: Member, role: Role, p: number) => {
    const slot = Array.from({ length: capacity[p] }, (_, i) => i).find(
      (i) => !assignments.some((a) => a.party === p && a.slot === i),
    );
    if (slot === undefined)
      throw new Error(`Party ${p + 1} has no room for required roles. Unlock or move a member.`);
    assignments.push({ memberId: m.id, role, party: p, slot, locked: false });
    used.add(m.id);
  };
  // Bipartite matching finds scarce Tank/Support coverage without greedy multi-role traps.
  const needs: { party: number; role: Role }[] = [];
  for (let p = 0; p < 3; p++)
    if (capacity[p])
      for (const role of ['Tank', 'Support'] as Role[])
        if (!assignments.some((a) => a.party === p && a.role === role))
          needs.push({ party: p, role });
  if (run.group === 'RANKING') {
    const matched = new Map<string, number>();
    const visit = (i: number, seen: Set<string>): boolean => {
      const need = needs[i];
      const candidates = pool
        .filter((m) => !used.has(m.id) && m.roles.includes(need.role))
        .sort(
          (a, b) =>
            rank(b, need.role, need.party) - rank(a, need.role, need.party) ||
            a.id.localeCompare(b.id),
        );
      for (const m of candidates) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const old = matched.get(m.id);
        if (old === undefined || visit(old, seen)) {
          matched.set(m.id, i);
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < needs.length; i++)
      if (!visit(i, new Set()))
        throw new Error(
          `Cannot cover three Tanks and three Supports with distinct eligible members. Add role capabilities, update availability, or unlock critical slots.`,
        );
    const perParty = [0, 1, 2].map(
      (p) =>
        assignments.filter((a) => a.party === p).length +
        [...matched.values()].filter((i) => needs[i].party === p).length,
    );
    if (perParty.some((n) => n > 8))
      throw new Error('Locked slots leave insufficient space for Tank and Support coverage.');
    for (const [id, i] of matched)
      add(
        pool.find((m) => m.id === id)!,
        needs[i].role,
        needs[i].party,
      );
  } else
    for (const need of needs) {
      if (assignments.filter((a) => a.party === need.party).length >= capacity[need.party])
        continue;
      const m = pool
        .filter((m) => !used.has(m.id) && m.roles.includes(need.role))
        .sort(
          (a, b) =>
            rank(b, need.role, need.party) - rank(a, need.role, need.party) ||
            a.id.localeCompare(b.id),
        )[0];
      if (m) add(m, need.role, need.party);
    }
  // Fill soft-role targets, always balancing the least powerful party first.
  while (assignments.length < target) {
    const parties = [0, 1, 2]
      .filter((p) => assignments.filter((a) => a.party === p).length < capacity[p])
      .sort((a, b) => partyStrength(a) - partyStrength(b) || a - b);
    const p = parties[0];
    const party = assignments.filter((a) => a.party === p);
    const desired: Role[] = [];
    if (!party.some((a) => a.role === 'Buff/DPS')) desired.push('Buff/DPS');
    if (party.filter((a) => a.role === 'AoE').length < 2) desired.push('AoE');
    desired.push('DPS');
    let choices = pool
      .filter((m) => !used.has(m.id))
      .flatMap((m) =>
        m.roles.map((role) => ({
          m,
          role,
          value:
            rank(m, role, p) +
            (desired.includes(role) ? weights.performance * (role === 'DPS' ? 1 : 4) : 0) +
            (role === 'Buff/DPS' &&
            m.job === 'Forcemaster' &&
            !party.some((a) => a.role === 'Buff/DPS')
              ? weights.performance * 3
              : 0),
        })),
      );
    choices = choices.sort(
      (a, b) => b.value - a.value || a.m.id.localeCompare(b.m.id) || a.role.localeCompare(b.role),
    );
    const best = choices[0];
    if (!best) throw new Error('Insufficient eligible role capabilities.');
    add(best.m, best.role, p);
  }
  const errors = validateLineup(assignments, run, members, other, true);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    assignments: assignments.sort((a, b) => a.party - b.party || a.slot - b.slot),
    warnings: warnings(assignments, members),
  };
}
