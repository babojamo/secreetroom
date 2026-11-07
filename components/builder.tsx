'use client';
import { useEffect, useState, useRef } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  Shield,
  Crown,
  Gem,
  Settings,
  Plus,
  Search,
  WandSparkles,
  Download,
  Check,
  X,
  LockKeyhole,
  UnlockKeyhole,
  Undo2,
  Redo2,
  Copy,
  Flame,
  Save,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  normalizeName,
  participation,
  validateLineup,
  warnings,
  eligibleMembers,
  type State,
  type Member,
  type Run,
  type Assignment,
  type Role,
} from '@/lib/domain';
import {
  formatDate,
  roleSlug,
  IconForRole,
  ClassIcon,
  Empty,
  Modal,
  Command,
  download,
  csvDownload,
} from './shared';

export function Slot({
  assignment,
  member,
  party,
  slot,
  icons,
  disabled,
  onRemove,
  onLock,
  onRole,
  showLevels,
  showRatings,
  showBadges,
  lastRun,
}: {
  assignment?: Assignment;
  member?: Member;
  party: number;
  slot: number;
  icons: Record<string, string>;
  disabled: boolean;
  onRemove: () => void;
  onLock: () => void;
  onRole: (r: Role) => void;
  showLevels: boolean;
  showRatings: boolean;
  showBadges: boolean;
  lastRun?: string | null;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `slot:${party}:${slot}`, disabled });
  const {
    setNodeRef: dragRef,
    attributes,
    listeners,
    transform,
    isDragging,
  } = useDraggable({
    id: `member:${member?.id}`,
    disabled: disabled || !member || assignment?.locked,
  });
  return (
    <div
      ref={dropRef}
      className={`party-slot ${isOver ? 'over' : ''} ${assignment?.locked ? 'locked' : ''}`}
      data-party={party}
      data-slot={slot}
    >
      <span className="slot-number">{String(slot + 1).padStart(2, '0')}</span>
      {member && assignment ? (
        <>
          <div
            ref={dragRef}
            {...attributes}
            {...listeners}
            className={`slot-character ${isDragging ? 'dragging' : ''}`}
            data-member-id={member.id}
            style={
              transform
                ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 100 }
                : undefined
            }
          >
            <ClassIcon member={member} icons={icons} />
            <span>
              <b>
                {member.name}
                {showBadges && member.core && <LockKeyhole size={10} />}
              </b>
              <small>
                {member.job}
                {showLevels && ` · Lv. ${member.level}`}
              </small>
              <small className={roleSlug(assignment.role)}>
                {assignment.role}{' '}
                <span className="last-run">
                  · {lastRun ? `Last ${formatDate(lastRun)}` : 'No runs yet'}
                </span>
              </small>
              {showBadges && (member.highDps || member.highAoe) && (
                <small className="gold-text">
                  {member.highDps ? '⭐ High DPS ' : ''}
                  {member.highAoe ? '🌪 High AoE' : ''}
                </small>
              )}
              {showRatings && (
                <small>
                  DPS {member.dps} · AoE {member.aoe}
                </small>
              )}
            </span>
          </div>
          <div className="slot-actions">
            <select
              aria-label={`Role for ${member.name}`}
              className={`role-select ${roleSlug(assignment.role)}`}
              value={assignment.role}
              disabled={disabled || assignment.locked}
              onChange={(e) => onRole(e.target.value as Role)}
            >
              {member.roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <button
              disabled={disabled}
              title={assignment.locked ? 'Unlock position' : 'Lock position'}
              onClick={onLock}
            >
              {assignment.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
            </button>
            <button
              title="Return to reserves"
              disabled={disabled || assignment.locked}
              onClick={onRemove}
            >
              <X size={12} />
            </button>
          </div>
        </>
      ) : (
        <span className="empty-slot">
          <Plus size={14} />
          Drag a member here
        </span>
      )}
    </div>
  );
}

export function ReserveCard({
  member,
  icons,
  history,
  disabled,
  onAdd,
}: {
  member: Member;
  icons: Record<string, string>;
  history: State['history'];
  disabled: boolean;
  onAdd: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform } = useDraggable({
    id: `member:${member.id}`,
    disabled,
  });
  const p = participation(member.id, history);
  return (
    <div
      ref={setNodeRef}
      className="reserve-card"
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 100 }
          : undefined
      }
    >
      <span className="drag-grip" {...attributes} {...listeners}>
        <GripVertical size={14} />
      </span>
      <ClassIcon member={member} icons={icons} />
      <div className="reserve-info">
        <b>{member.name}</b>
        <small>
          {member.job} · Lv. {member.level} · DPS {member.dps}
        </small>
        <small>
          {p.last ? `Last ${formatDate(p.last)}` : 'No confirmed runs'} · {p.missed} missed ·{' '}
          {p.consecutive} consecutive
        </small>
        <span className="member-markers">
          {!p.previous ? '🆕 ' : ''}
          {member.highDps ? '⭐ ' : ''}
          {member.highAoe ? '🌪 ' : ''}
          {member.core ? '🔒 ' : ''}
          <span>Priority {p.priority}</span>
        </span>
      </div>
      <button disabled={disabled} aria-label={`Add ${member.name}`} onClick={onAdd}>
        <Plus size={16} />
      </button>
    </div>
  );
}

export function Builder({
  state,
  command,
  initialGroup,
  busy,
  readOnly,
  notify,
  schedule,
}: {
  state: State;
  command: Command;
  initialGroup: Run['group'];
  busy: boolean;
  readOnly: boolean;
  notify: (s: string) => void;
  schedule: () => void;
}) {
  const [group, setGroup] = useState(initialGroup),
    [runId, setRunId] = useState('');
  const availableRuns = state.runs.filter((r) => r.group === group);
  const run = availableRuns.find((r) => r.id === runId) ?? availableRuns[0];
  const [lineup, setLineup] = useState<Assignment[]>([]),
    [undo, setUndo] = useState<Assignment[][]>([]),
    [redo, setRedo] = useState<Assignment[][]>([]),
    [search, setSearch] = useState(''),
    [settings, setSettings] = useState(false),
    [showLevels, setShowLevels] = useState(true),
    [showRatings, setShowRatings] = useState(false),
    [showBadges, setShowBadges] = useState(true);
  const exportRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  useEffect(() => {
    setLineup(run?.assignments ?? []);
    setUndo([]);
    setRedo([]);
  }, [run?.id, state.revision]);
  if (!run)
    return (
      <>
        <div className="tab-bar">
          <button
            onClick={() => setGroup('RANKING')}
            className={group === 'RANKING' ? 'selected' : ''}
          >
            <Crown size={16} />
            Ranking run
          </button>
          <button onClick={() => setGroup('DROP')} className={group === 'DROP' ? 'selected' : ''}>
            <Gem size={16} />
            Drop run
          </button>
        </div>
        <section className="panel">
          <Empty title="A new run awaits">
            <p>
              Schedule a {group === 'RANKING' ? '24-player ranking' : 'flexible drop'} run to start
              assembling your parties.
            </p>
            <Button disabled={readOnly} onClick={schedule}>
              <Plus size={15} />
              Schedule run
            </Button>
          </Empty>
        </section>
      </>
    );
  const dirty = JSON.stringify(lineup) !== JSON.stringify(run.assignments),
    disabled = readOnly || run.status !== 'DRAFT' || busy;
  const eligible = eligibleMembers(state.members, run, state.runs);
  const reserves = eligible
    .filter(
      (m) =>
        !lineup.some((a) => a.memberId === m.id) &&
        normalizeName(m.name).includes(normalizeName(search)),
    )
    .sort(
      (a, b) =>
        participation(b.id, state.history).priority - participation(a.id, state.history).priority,
    );
  const notes = warnings(lineup, state.members);
  const change = (next: Assignment[]) => {
    const errs = validateLineup(
      next,
      run,
      state.members,
      state.runs,
      false,
      lineup.filter((a) => a.locked && next.some((b) => b.memberId === a.memberId && b.locked)),
    );
    if (errs.length) {
      notify(errs.join(' '));
      return;
    }
    setUndo([...undo, lineup]);
    setRedo([]);
    setLineup(next);
  };
  const move = (id: string, party: number, slot: number) => {
    const source = lineup.find((a) => a.memberId === id),
      target = lineup.find((a) => a.party === party && a.slot === slot),
      member = state.members.find((m) => m.id === id);
    if (!member || source?.locked || target?.locked) return;
    let next = lineup.filter((a) => a.memberId !== id && a !== target);
    if (target && source) next.push({ ...target, party: source.party, slot: source.slot });
    next.push({
      memberId: id,
      party,
      slot,
      role: source?.role ?? member.primaryRole,
      locked: false,
    });
    change(next);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const id = String(e.active.id).replace('member:', ''),
      parts = String(e.over.id).split(':');
    if (parts[0] === 'slot') move(id, Number(parts[1]), Number(parts[2]));
  };
  const add = (m: Member) => {
    for (let p = 0; p < 3; p++)
      for (let s = 0; s < 8; s++)
        if (!lineup.some((a) => a.party === p && a.slot === s)) {
          move(m.id, p, s);
          return;
        }
    notify('All party slots are occupied. Drag onto a slot to replace a member.');
  };
  const exportLineup = async (type: string) => {
    if (dirty) {
      notify('Save the draft before sharing. Exports use the currently saved lineup.');
      return;
    }
    if (!run.assignments.length) {
      notify('Save a lineup before exporting.');
      return;
    }
    const text = [
      'STOICS — SECRET ROOM LINEUP',
      `${run.group} · ${formatDate(run.scheduledAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT`,
      ...[0, 1, 2].flatMap((p) => [
        `\nPARTY ${p + 1}`,
        ...run.assignments
          .filter((a) => a.party === p)
          .sort((a, b) => a.slot - b.slot)
          .map((a) => {
            const m = state.members.find((m) => m.id === a.memberId)!;
            return `${a.role} - ${m.name}${showLevels ? ` (Lv. ${m.level})` : ''}${showBadges ? (m.highDps ? ' ⭐' : '') + (m.highAoe ? ' 🌪' : '') : ''}${showRatings ? ` [DPS ${m.dps}, AoE ${m.aoe}]` : ''}`;
          }),
      ]),
    ].join('\n');
    try {
      if (type === 'copy') {
        await navigator.clipboard.writeText(text);
        notify('Saved lineup copied for guild chat.');
      } else if (type === 'csv') {
        csvDownload(
          run.assignments.map((a) => {
            const m = state.members.find((m) => m.id === a.memberId)!;
            return {
              Party: a.party + 1,
              Slot: a.slot + 1,
              Role: a.role,
              Name: m.name,
              ...(showLevels ? { Level: m.level } : {}),
              ...(showRatings ? { DPS: m.dps, AoE: m.aoe } : {}),
              ...(showBadges ? { 'High DPS': m.highDps, 'High AoE': m.highAoe, Core: m.core } : {}),
            };
          }),
          'stoics-lineup.csv',
        );
      } else if (exportRef.current) {
        const { toPng } = await import('html-to-image');
        const data = await toPng(exportRef.current, {
          backgroundColor: '#111318',
          pixelRatio: 2,
          filter: (node) =>
            !(node instanceof HTMLElement && node.classList.contains('slot-actions')),
        });
        if (type === 'pdf') {
          // Rasterizing the saved preview preserves Unicode names and custom class icons.
          const { jsPDF } = await import('jspdf');
          const width = exportRef.current.offsetWidth,
            height = exportRef.current.offsetHeight;
          const doc = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [width + 40, height + 40],
            hotfixes: ['px_scaling'],
          });
          doc.addImage(data, 'PNG', 20, 20, width, height);
          doc.save('stoics-lineup.pdf');
        } else {
          const a = document.createElement('a');
          a.href = data;
          a.download = 'stoics-lineup.png';
          a.click();
        }
      }
    } catch {
      notify('Export failed. Try CSV or copying the lineup.');
    }
  };
  return (
    <>
      <div className="builder-top">
        <div className="tab-bar">
          <button
            className={group === 'RANKING' ? 'selected' : ''}
            onClick={() => {
              setGroup('RANKING');
              setRunId('');
            }}
          >
            <Crown size={16} />
            Ranking run
          </button>
          <button
            className={group === 'DROP' ? 'selected' : ''}
            onClick={() => {
              setGroup('DROP');
              setRunId('');
            }}
          >
            <Gem size={16} />
            Drop run
          </button>
        </div>
        <select
          aria-label="Select scheduled run"
          value={run.id}
          onChange={(e) => setRunId(e.target.value)}
        >
          {availableRuns.map((r) => (
            <option key={r.id} value={r.id}>
              {formatDate(r.scheduledAt, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              · {r.status}
            </option>
          ))}
        </select>
      </div>
      <section className="run-banner">
        <span className={`banner-icon ${group === 'RANKING' ? 'purple' : 'blue'}`}>
          {group === 'RANKING' ? <Crown size={24} /> : <Gem size={24} />}
        </span>
        <div>
          <h2>
            {group === 'RANKING' ? 'Built for the leaderboard' : 'A fair chance at the rewards'}
          </h2>
          <p>
            {group === 'RANKING'
              ? 'Three balanced parties. Twenty-four members. One fastest clear.'
              : 'Flexible party sizes, safe compositions, and meaningful member rotation.'}
          </p>
        </div>
        <div className="participant-count">
          <b>
            {lineup.length}
            <span> / {run.target}</span>
          </b>
          <small>PARTICIPANTS</small>
        </div>
        <span className="badge gold">{dirty ? 'UNSAVED' : run.status}</span>
      </section>
      <div className="builder-toolbar">
        <div className="inline-actions">
          <Button
            disabled={disabled || dirty}
            onClick={() => command('generate', { runId: run.id })}
          >
            <WandSparkles size={15} />
            Auto generate lineup
          </Button>
          <Button
            variant="outline"
            disabled={disabled || !dirty}
            onClick={() => command('saveRoster', { runId: run.id, assignments: lineup })}
          >
            <Save size={14} />
            Save draft
          </Button>
          <Button
            variant="ghost"
            disabled={disabled || !undo.length}
            aria-label="Undo"
            onClick={() => {
              setRedo([lineup, ...redo]);
              setLineup(undo[undo.length - 1]);
              setUndo(undo.slice(0, -1));
            }}
          >
            <Undo2 size={16} />
          </Button>
          <Button
            variant="ghost"
            disabled={disabled || !redo.length}
            aria-label="Redo"
            onClick={() => {
              setUndo([...undo, lineup]);
              setLineup(redo[0]);
              setRedo(redo.slice(1));
            }}
          >
            <Redo2 size={16} />
          </Button>
        </div>
        <div className="inline-actions">
          <Button variant="ghost" disabled={disabled} onClick={() => setSettings(true)}>
            <Settings size={14} />
            Run rules
          </Button>
          <Button
            variant="outline"
            disabled={disabled || dirty}
            onClick={() => {
              if (
                confirm(
                  'Finalize the saved planned roster? Further replacements will be recorded in actual attendance.',
                )
              )
                void command('finalize', { runId: run.id });
            }}
          >
            <Check size={14} />
            Finalize roster
          </Button>
        </div>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="builder-layout">
          <div>
            <div ref={exportRef} className="party-export">
              <div className="export-title">
                STOICS{' '}
                <span>
                  SECRET ROOM · {group} · {formatDate(run.scheduledAt)}
                </span>
              </div>
              <div className="party-grid">
                {[0, 1, 2].map((p) => {
                  const party = lineup.filter((a) => a.party === p);
                  const power = party.reduce(
                    (n, a) => n + (state.members.find((m) => m.id === a.memberId)?.dps ?? 0),
                    0,
                  );
                  return (
                    <section className="panel party-panel" key={p}>
                      <div className="party-heading">
                        <span className={`party-numeral party-${p}`}>0{p + 1}</span>
                        <div>
                          <h3>Party {p + 1}</h3>
                          <small>{party.length} / 8 MEMBERS</small>
                        </div>
                        <span className="party-power">
                          <Flame size={12} />
                          {power}
                          <small>DPS rating sum</small>
                        </span>
                      </div>
                      {Array.from({ length: 8 }, (_, s) => {
                        const a = party.find((a) => a.slot === s);
                        return (
                          <Slot
                            key={s}
                            assignment={a}
                            member={state.members.find((m) => m.id === a?.memberId)}
                            party={p}
                            slot={s}
                            icons={state.settings.icons}
                            disabled={disabled}
                            showLevels={showLevels}
                            showRatings={showRatings}
                            showBadges={showBadges}
                            lastRun={a ? participation(a.memberId, state.history).last : null}
                            onRemove={() => change(lineup.filter((x) => x !== a))}
                            onLock={() =>
                              change(lineup.map((x) => (x === a ? { ...x, locked: !x.locked } : x)))
                            }
                            onRole={(role) =>
                              change(lineup.map((x) => (x === a ? { ...x, role } : x)))
                            }
                          />
                        );
                      })}
                      <div className="party-footer">
                        {['Tank', 'Support', 'AoE'].map((role) => (
                          <span
                            key={role}
                            className={
                              party.some((a) => a.role === role) ? roleSlug(role) : 'missing'
                            }
                          >
                            <IconForRole role={role} size={12} />
                            {party.filter((a) => a.role === role).length} {role}
                          </span>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
            {notes.length > 0 && (
              <div className="composition-notes">
                <h3>
                  <AlertTriangle size={15} />
                  Composition notes
                </h3>
                {notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            )}
            <div className="share-bar">
              <span>
                <Download size={15} />
                Share saved lineup
              </span>
              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={showLevels}
                    onChange={(e) => setShowLevels(e.target.checked)}
                  />
                  Levels
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showRatings}
                    onChange={(e) => setShowRatings(e.target.checked)}
                  />
                  Ratings
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showBadges}
                    onChange={(e) => setShowBadges(e.target.checked)}
                  />
                  Badges
                </label>
              </div>
              <div className="inline-actions">
                <Button variant="outline" onClick={() => exportLineup('copy')}>
                  <Copy size={13} />
                  Copy
                </Button>
                {['CSV', 'PNG', 'PDF'].map((t) => (
                  <Button variant="ghost" key={t} onClick={() => exportLineup(t.toLowerCase())}>
                    {t}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <aside className="panel reserves-panel">
            <div className="panel-heading">
              <h2>
                Reserves<span className="count-chip">{reserves.length}</span>
              </h2>
              <Shield size={16} />
            </div>
            <p className="reserve-description">
              Available members, ordered by rotation priority. Drag to assign or replace.
            </p>
            <label className="search-field">
              <Search size={14} />
              <input
                placeholder="Find a reserve…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {reserves.length ? (
              reserves.map((m) => (
                <ReserveCard
                  key={m.id}
                  member={m}
                  icons={state.settings.icons}
                  history={state.history}
                  disabled={disabled}
                  onAdd={() => add(m)}
                />
              ))
            ) : (
              <div className="reserve-empty">
                No eligible reserves.
                <small>Check availability, exclusions, and overlapping runs.</small>
              </div>
            )}
            <div className="legend">
              🆕 Missed previous run
              <br />⭐ High DPS · 🌪 High AoE
              <br />
              🔒 Core member
            </div>
          </aside>
        </div>
      </DndContext>
      {settings && (
        <RunRules run={run} state={state} command={command} onClose={() => setSettings(false)} />
      )}
    </>
  );
}

export function RunRules({
  run,
  state,
  command,
  onClose,
}: {
  run: Run;
  state: State;
  command: Command;
  onClose: () => void;
}) {
  const [excluded, setExcluded] = useState(run.exclusions),
    [availability, setAvailability] = useState(run.availability);
  return (
    <Modal title="Run rules & availability" onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await command('runSettings', {
              runId: run.id,
              target: run.group === 'RANKING' ? 24 : Number(f.get('target')),
              allowOverlap: f.get('overlap') === 'on',
              exclusions: excluded,
              availability,
            })
          )
            onClose();
        }}
      >
        <label>
          Participant target
          <input
            name="target"
            type="number"
            min="1"
            max="24"
            disabled={run.group === 'RANKING'}
            defaultValue={run.target}
          />
        </label>
        <label className="checkbox-label">
          <input name="overlap" type="checkbox" defaultChecked={run.allowOverlap} />
          Permit members to join overlapping runs (both runs must opt in)
        </label>
        <div className="table-scroll import-preview">
          <table>
            <thead>
              <tr>
                <th>CHARACTER</th>
                <th>EXCLUDE</th>
                <th>EVENT AVAILABILITY</th>
              </tr>
            </thead>
            <tbody>
              {state.members
                .filter((m) => m.status === 'ACTIVE')
                .map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Exclude ${m.name}`}
                        checked={excluded.includes(m.id)}
                        onChange={(e) =>
                          setExcluded(
                            e.target.checked
                              ? [...excluded, m.id]
                              : excluded.filter((id) => id !== m.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Availability ${m.name}`}
                        value={String(
                          availability.find((a) => a.memberId === m.id)?.available ?? 'default',
                        )}
                        onChange={(e) =>
                          setAvailability([
                            ...availability.filter((a) => a.memberId !== m.id),
                            ...(e.target.value === 'default'
                              ? []
                              : [{ memberId: m.id, available: e.target.value === 'true' }]),
                          ])
                        }
                      >
                        <option value="default">
                          Default ({m.available ? 'Available' : 'Unavailable'})
                        </option>
                        <option value="true">Available this run</option>
                        <option value="false">Unavailable this run</option>
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button>Save rules</Button>
        </div>
      </form>
    </Modal>
  );
}
