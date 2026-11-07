import { describe, it, expect } from 'vitest';
import { generateLineup } from '../lib/optimizer';
import {
  memberSchema,
  normalizeName,
  participation,
  validateLineup,
  defaultWeights,
  type Member,
  type Run,
  type Role,
  type HistoryRun,
} from '../lib/domain';
function member(i: number, role: Role = 'DPS', extra: Partial<Member> = {}): Member {
  return memberSchema.parse({
    id: `m-${i}`,
    name: `TEST-${i}`,
    job:
      role === 'Tank'
        ? 'Templar'
        : role === 'Support'
          ? 'Seraph'
          : role === 'AoE'
            ? 'Arcanist'
            : role === 'Buff/DPS'
              ? 'Forcemaster'
              : 'Slayer',
    level: 150,
    primaryRole: role,
    roles: [role],
    ...extra,
  }) as Member;
}
function roster(): Member[] {
  return Array.from({ length: 40 }, (_, i) =>
    member(i, i < 4 ? 'Tank' : i < 8 ? 'Support' : i < 16 ? 'AoE' : i < 20 ? 'Buff/DPS' : 'DPS'),
  );
}
function run(extra: Partial<Run> = {}): Run {
  return {
    id: 'r1',
    group: 'RANKING',
    scheduledAt: '2026-11-08T14:00:00.000Z',
    status: 'DRAFT',
    target: 24,
    allowOverlap: false,
    exclusions: [],
    availability: [],
    assignments: [],
    ...extra,
  };
}
describe('deterministic constrained roster generation', () => {
  it('selects exactly 24 unique eligible members in three eight-player parties', () => {
    const m = roster(),
      r = run();
    const result = generateLineup(r, m, []);
    expect(result.assignments).toHaveLength(24);
    expect(new Set(result.assignments.map((a) => a.memberId)).size).toBe(24);
    expect(validateLineup(result.assignments, r, m, [], true)).toEqual([]);
    for (let p = 0; p < 3; p++) {
      const party = result.assignments.filter((a) => a.party === p);
      expect(party).toHaveLength(8);
      expect(party.some((a) => a.role === 'Tank')).toBe(true);
      expect(party.some((a) => a.role === 'Support')).toBe(true);
      expect(party.filter((a) => a.role === 'AoE').length).toBeGreaterThanOrEqual(2);
      expect(party.some((a) => a.role === 'Buff/DPS')).toBe(true);
    }
  });
  it('is reproducible regardless of input order', () => {
    const m = roster(),
      r = run();
    expect(generateLineup(r, m, [])).toEqual(generateLineup(r, [...m].reverse(), []));
  });
  it('explains shortages without imaginary members', () => {
    expect(() => generateLineup(run(), roster().slice(0, 20), [])).toThrow('only 20');
    expect(() =>
      generateLineup(
        run(),
        roster().filter((m) => m.primaryRole !== 'Tank'),
        [],
      ),
    ).toThrow('Tanks');
  });
  it('excludes unavailable, inactive, excluded and archived members', () => {
    const m = roster();
    m[25].available = false;
    m[26].status = 'INACTIVE';
    m[27].status = 'ARCHIVED';
    const r = run({ exclusions: ['m-28'], availability: [{ memberId: 'm-29', available: false }] });
    const ids = generateLineup(r, m, []).assignments.map((a) => a.memberId);
    for (const n of [25, 26, 27, 28, 29]) expect(ids).not.toContain(`m-${n}`);
  });
  it('allows a per-run availability override without overriding inactive status', () => {
    const m = roster();
    m[0].available = false;
    const lock = { memberId: 'm-0', party: 0, slot: 0, role: 'Tank' as Role, locked: true };
    expect(() =>
      generateLineup(
        run({ assignments: [lock], availability: [{ memberId: 'm-0', available: true }] }),
        m,
        [],
      ),
    ).not.toThrow();
    m[0].status = 'INACTIVE';
    expect(() =>
      generateLineup(
        run({ assignments: [lock], availability: [{ memberId: 'm-0', available: true }] }),
        m,
        [],
      ),
    ).toThrow('unavailable');
  });
  it('preserves exact locked party, position and role', () => {
    const lock = { memberId: 'm-24', party: 2, slot: 7, role: 'DPS' as Role, locked: true };
    const result = generateLineup(run({ assignments: [lock] }), roster(), []);
    expect(result.assignments).toContainEqual(lock);
  });
  it('rejects an unavailable lock', () => {
    const m = roster();
    m[0].available = false;
    expect(() =>
      generateLineup(
        run({
          assignments: [{ memberId: m[0].id, party: 0, slot: 0, role: 'Tank', locked: true }],
        }),
        m,
        [],
      ),
    ).toThrow('unavailable');
  });
  it('uses matching to avoid consuming scarce multi-role characters', () => {
    const m = roster().filter((m) => !['Tank', 'Support'].includes(m.primaryRole));
    m.push(
      member(100, 'Tank', { roles: ['Tank', 'Support'] }),
      member(101, 'Tank'),
      member(102, 'Tank'),
      member(103, 'Support'),
      member(104, 'Support'),
      member(105, 'Support'),
    );
    expect(validateLineup(generateLineup(run(), m, []).assignments, run(), m, [], true)).toEqual(
      [],
    );
  });
  it('rejects locked parties that leave no room for critical roles', () => {
    const locks = Array.from({ length: 8 }, (_, slot) => ({
      memberId: `m-${24 + slot}`,
      party: 0,
      slot,
      role: 'DPS' as Role,
      locked: true,
    }));
    expect(() => generateLineup(run({ assignments: locks }), roster(), [])).toThrow('space');
  });
  it.each([1, 2, 7, 8, 9, 16, 17, 23, 24])('supports Drop Run target %i', (target) => {
    const r = run({ group: 'DROP', target });
    const a = generateLineup(r, roster(), []).assignments;
    expect(a).toHaveLength(target);
    for (let p = 0; p < 3; p++)
      expect(a.filter((x) => x.party === p).length).toBeLessThanOrEqual(8);
    expect(validateLineup(a, r, roster(), [], true)).toEqual([]);
  });
  it('does not require a full party or dedicated roles for drop runs', () => {
    const m = [member(1), member(2)];
    expect(generateLineup(run({ group: 'DROP', target: 2 }), m, []).assignments).toHaveLength(2);
  });
  it('prevents overlap by default; both runs must opt in', () => {
    const other = run({
      id: 'other',
      assignments: [{ memberId: 'm-0', party: 0, slot: 0, role: 'Tank', locked: false }],
    });
    expect(
      generateLineup(run(), roster(), [], [other]).assignments.map((a) => a.memberId),
    ).not.toContain('m-0');
    const r = run({ allowOverlap: true });
    other.allowOverlap = true;
    r.assignments = [{ memberId: 'm-0', party: 0, slot: 0, role: 'Tank', locked: true }];
    expect(generateLineup(r, roster(), [], [other]).assignments.map((a) => a.memberId)).toContain(
      'm-0',
    );
  });
});
describe('shared manual and AI validation', () => {
  it('rejects duplicates, occupied slots and ineligible roles', () => {
    const m = roster(),
      r = run();
    const a = generateLineup(r, m, []).assignments;
    expect(validateLineup([...a, a[0]], r, m)).toContain(
      'A character may only appear once per run.',
    );
    expect(validateLineup([{ ...a[0], role: 'Support' }], r, m).join()).toContain('not eligible');
  });
  it('rejects incomplete ranking finalization', () => {
    expect(validateLineup([], run(), roster(), [], true).join()).toContain('exactly 24');
  });
  it('validates swaps and replacement with no duplicates', () => {
    const m = roster(),
      r = run(),
      a = generateLineup(r, m, []).assignments;
    const dps = a.filter((a) => a.role === 'DPS');
    expect(dps.length).toBeGreaterThan(1);
    const [x, y] = dps;
    const swapped = a.map((b) =>
      b === x
        ? { ...b, party: y.party, slot: y.slot }
        : b === y
          ? { ...b, party: x.party, slot: x.slot }
          : b,
    );
    expect(validateLineup(swapped, r, m, [], true)).toEqual([]);
    const reserve = m.find((m) => m.roles.includes('DPS') && !a.some((a) => a.memberId === m.id))!;
    expect(
      validateLineup(
        a.map((b) => (b === x ? { ...b, memberId: reserve.id } : b)),
        r,
        m,
        [],
        true,
      ),
    ).toEqual([]);
  });
  it('rejects AI or manual movement of locked members', () => {
    const m = roster();
    const lock = { memberId: 'm-0', party: 0, slot: 0, role: 'Tank' as Role, locked: true };
    const r = run({ assignments: [lock] });
    expect(validateLineup([{ ...lock, party: 1 }], r, m)).toContain(
      'Unlock a position before moving or replacing it.',
    );
  });
});
describe('confirmed attendance and rotation', () => {
  const h = (id: string, date: string, ids: string[]): HistoryRun => ({
    id,
    group: 'RANKING',
    scheduledAt: date,
    finalizedAt: date,
    duration: null,
    ranking: null,
    drops: '',
    notes: '',
    attendance: ids.map((memberId) => ({
      memberId,
      present: true,
      party: 0,
      role: 'DPS',
      snapshot: { name: memberId, job: 'Slayer', level: 150 },
    })),
  });
  it('uses actual attendance, merges simultaneous groups for missed-run counting', () => {
    const history = [
      h('1', '2026-11-01T14:00:00Z', ['a']),
      h('2', '2026-11-01T14:00:00Z', ['b']),
      h('3', '2026-10-25T14:00:00Z', ['a']),
    ];
    expect(participation('a', history)).toMatchObject({
      total: 2,
      missed: 0,
      consecutive: 2,
      previous: true,
    });
    expect(participation('b', history)).toMatchObject({ total: 1, missed: 0, consecutive: 1 });
    expect(participation('c', history)).toMatchObject({ total: 0, missed: 2, consecutive: 0 });
  });
  it('ignores absent and unconfirmed records', () => {
    const first = h('1', '2026-11-01T14:00:00Z', ['a']);
    first.attendance[0].present = false;
    const draft = h('2', '2026-11-08T14:00:00Z', ['a']);
    draft.finalizedAt = null;
    expect(participation('a', [first, draft]).total).toBe(0);
  });
  it('prioritizes members who missed confirmed runs when ratings are equal', () => {
    const m = [member(1), member(2)];
    const history = [h('1', '2026-11-01T14:00:00Z', ['m-1'])];
    const result = generateLineup(run({ group: 'DROP', target: 1 }), m, history, [], {
      ...defaultWeights,
      fairness: 20,
    });
    expect(result.assignments[0].memberId).toBe('m-2');
  });
  it('normalizes Unicode names without stripping Greek characters', () => {
    expect(normalizeName('  Αλέξανδρος ')).toBe('αλέξανδρος');
    expect(normalizeName('ＡＢＣ')).toBe('abc');
  });
});
