'use client';
import { useState } from 'react';
import { Crown, Clock3, ChevronRight, Check, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { type State, type Run, type Role } from '@/lib/domain';
import { formatDate, Empty, Modal, Command, duration } from './shared';

export function Attendance({
  state,
  command,
  readOnly,
}: {
  state: State;
  command: Command;
  readOnly: boolean;
}) {
  const [run, setRun] = useState<Run | null>(null),
    [history, setHistory] = useState<State['history'][number] | null>(null);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Awaiting attendance</h2>
          <span className="badge gold">PLANNED ≠ PRESENT</span>
        </div>
        {state.runs.filter((r) => r.status === 'FINALIZED').length ? (
          <div className="run-list">
            {state.runs
              .filter((r) => r.status === 'FINALIZED')
              .map((r) => (
                <div key={r.id}>
                  <span className="stat-icon purple">
                    <Crown size={20} />
                  </span>
                  <div>
                    <h3>{r.group === 'RANKING' ? 'Ranking run' : 'Drop run'}</h3>
                    <small>
                      {formatDate(r.scheduledAt, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}{' '}
                      · {r.assignments.length} planned
                    </small>
                  </div>
                  <Button disabled={readOnly} onClick={() => setRun(r)}>
                    Record actual attendance
                    <ArrowRight size={14} />
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <p className="subtle-empty">
            Finalize a roster in the party builder to record actual participation and replacements.
          </p>
        )}
      </section>
      <section className="panel spaced">
        <div className="panel-heading">
          <h2>
            Confirmed run history<span className="count-chip">{state.history.length}</span>
          </h2>
        </div>
        {state.history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DATE (PHT)</th>
                  <th>GROUP</th>
                  <th>PRESENT</th>
                  <th>CLEAR TIME</th>
                  <th>RANK</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.history.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {formatDate(r.scheduledAt, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>{r.group}</td>
                    <td>{r.attendance.filter((a) => a.present).length}</td>
                    <td>{duration(r.duration)}</td>
                    <td>{r.ranking ?? '—'}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setHistory(r)}>
                        View record
                        <ChevronRight size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<Clock3 size={26} />} title="Every run has a story">
            <p>
              Confirm your first run’s actual attendance to start tracking history and fair
              rotation.
            </p>
          </Empty>
        )}
      </section>
      {run && (
        <AttendanceForm run={run} state={state} command={command} onClose={() => setRun(null)} />
      )}{' '}
      {history && (
        <Modal
          title={`${history.group} · ${formatDate(history.scheduledAt)}`}
          onClose={() => setHistory(null)}
          wide
        >
          <div className="callout">
            Clear time {duration(history.duration)} · Rank {history.ranking ?? '—'} ·{' '}
            {history.attendance.filter((a) => a.present).length} present
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CHARACTER AT RUN</th>
                  <th>CLASS / LEVEL</th>
                  <th>PARTY / ROLE</th>
                  <th>ATTENDANCE</th>
                </tr>
              </thead>
              <tbody>
                {history.attendance.map((a) => (
                  <tr key={a.memberId}>
                    <td>{a.snapshot.name}</td>
                    <td>
                      {a.snapshot.job} · {a.snapshot.level}
                    </td>
                    <td>
                      {a.party + 1} / {a.role}
                    </td>
                    <td>
                      <span className={`badge ${a.present ? 'green' : 'muted'}`}>
                        {a.present ? 'Present' : 'Absent'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Drops: {history.drops || 'None recorded'}</p>
          <p>Notes: {history.notes || 'None'}</p>
        </Modal>
      )}
    </>
  );
}

export function AttendanceForm({
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
  const [rows, setRows] = useState(
    run.assignments.map((a) => ({
      memberId: a.memberId,
      party: a.party,
      role: a.role,
      present: true,
    })),
  );
  return (
    <Modal title="Confirm actual participation" onClose={onClose} wide>
      <p className="form-help">
        Keep absent planned members unchecked. Add replacements and assign their actual party and
        role. Ranking runs require 24 present members, eight per party, with Tank and Support
        coverage.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await command('attendance', {
              runId: run.id,
              rows,
              duration: f.get('duration') ? Number(f.get('duration')) : null,
              ranking: f.get('ranking') ? Number(f.get('ranking')) : null,
              drops: f.get('drops'),
              notes: f.get('notes'),
            })
          )
            onClose();
        }}
      >
        <div className="table-scroll import-preview">
          <table>
            <thead>
              <tr>
                <th>PRESENT</th>
                <th>CHARACTER</th>
                <th>PARTY</th>
                <th>ACTUAL ROLE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const m = state.members.find((m) => m.id === row.memberId)!;
                return (
                  <tr key={row.memberId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.present}
                        aria-label={`Present ${m.name}`}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, j) => (i === j ? { ...r, present: e.target.checked } : r)),
                          )
                        }
                      />
                    </td>
                    <td>{m.name}</td>
                    <td>
                      <select
                        aria-label={`Actual party ${m.name}`}
                        value={row.party}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, j) =>
                              i === j ? { ...r, party: Number(e.target.value) } : r,
                            ),
                          )
                        }
                      >
                        {[0, 1, 2].map((p) => (
                          <option key={p} value={p}>
                            Party {p + 1}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Actual role ${m.name}`}
                        value={row.role}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, j) =>
                              i === j ? { ...r, role: e.target.value as Role } : r,
                            ),
                          )
                        }
                      >
                        {m.roles.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label>
          Add a replacement
          <select
            value=""
            onChange={(e) => {
              const m = state.members.find((m) => m.id === e.target.value);
              if (m)
                setRows([
                  ...rows,
                  { memberId: m.id, party: 0, role: m.primaryRole, present: true },
                ]);
            }}
          >
            <option value="">Select a guild member…</option>
            {state.members
              .filter((m) => m.status === 'ACTIVE' && !rows.some((r) => r.memberId === m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.job}
                </option>
              ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Clear time in seconds
            <input name="duration" type="number" min="1" max="86400" placeholder="Optional" />
          </label>
          <label>
            Ranking position
            <input name="ranking" type="number" min="1" placeholder="Optional" />
          </label>
        </div>
        <label>
          Drops / rewards
          <textarea name="drops" maxLength={4000} />
        </label>
        <label>
          Run notes
          <textarea name="notes" maxLength={4000} />
        </label>
        <div className="modal-actions">
          <span>{rows.filter((a) => a.present).length} present</span>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button>
            <Check size={15} />
            Finalize attendance
          </Button>
        </div>
      </form>
    </Modal>
  );
}
