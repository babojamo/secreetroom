'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { ROLES, participation, type State, type Member } from '@/lib/domain';
import { formatDate, roleSlug, IconForRole, ClassIcon } from './shared';

export function Reserves({ state, edit }: { state: State; edit: (m: Member) => void }) {
  const [runId, setRunId] = useState('');
  const run = state.runs.find((r) => r.id === runId) ?? state.runs[0];
  const assigned = new Set(
    (run ? run.assignments : state.runs.flatMap((r) => r.assignments)).map((a) => a.memberId),
  );
  const reserves = state.members.filter((m) => m.status === 'ACTIVE' && !assigned.has(m.id));
  return (
    <>
      <div className="section-intro">
        <p>Rotation is calculated from confirmed attendance, never planned lineups.</p>
        <select
          aria-label="Reserves for run"
          value={run?.id ?? ''}
          onChange={(e) => setRunId(e.target.value)}
        >
          <option value="">All active runs</option>
          {state.runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.group} · {formatDate(r.scheduledAt)}
            </option>
          ))}
        </select>
      </div>
      <div className="reserve-groups">
        {ROLES.map((role) => (
          <section className="panel" key={role}>
            <div className="panel-heading">
              <h2>
                <span className={roleSlug(role)}>
                  <IconForRole role={role} />
                </span>
                {role === 'Buff/DPS' ? 'Forcemaster / Buff' : role}
                <span className="count-chip">
                  {reserves.filter((m) => m.primaryRole === role).length}
                </span>
              </h2>
            </div>
            {reserves
              .filter((m) => m.primaryRole === role)
              .sort(
                (a, b) =>
                  participation(b.id, state.history).priority -
                  participation(a.id, state.history).priority,
              )
              .map((m) => {
                const p = participation(m.id, state.history);
                return (
                  <div className="reserve-detail" key={m.id}>
                    <ClassIcon member={m} icons={state.settings.icons} />
                    <div>
                      <b>{m.name}</b>
                      <small>
                        {m.job} · Lv. {m.level} · DPS {m.dps} / AoE {m.aoe}
                      </small>
                      <small>
                        {p.last ? `Last ${formatDate(p.last)}` : 'No participation yet'} ·{' '}
                        {p.missed} missed · {p.consecutive} consecutive
                      </small>
                      <span className={`badge ${m.available ? 'green' : 'muted'}`}>
                        {m.available ? 'Available' : 'Unavailable'}
                      </span>{' '}
                      <span className="badge gold">Priority {p.priority}</span>
                      <small>
                        {!p.previous ? '🆕 ' : ''}
                        {m.highDps ? '⭐ High DPS ' : ''}
                        {m.highAoe ? '🌪 High AoE ' : ''}
                        {m.core ? '🔒 Core' : ''}
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      disabled={state.user.role === 'VIEWER'}
                      onClick={() => edit(m)}
                    >
                      Edit
                    </Button>
                  </div>
                );
              })}
            {!reserves.some((m) => m.primaryRole === role) && (
              <p className="subtle-empty">No unassigned members in this role.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
