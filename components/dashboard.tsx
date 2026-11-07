'use client';
import Link from 'next/link';
import {
  Shield,
  Swords,
  Users,
  Crown,
  Gem,
  Clock3,
  Sparkles,
  ChevronRight,
  Plus,
  ArrowUpRight,
  CalendarDays,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { ROLES, participation, type State, type Role } from '@/lib/domain';
import { formatDate, roleSlug, IconForRole, ClassIcon, Empty, Command, duration } from './shared';

export function Dashboard({
  state,
  command,
  schedule,
  importRoster,
  readOnly,
}: {
  state: State;
  command: Command;
  schedule: () => void;
  importRoster: () => void;
  readOnly: boolean;
}) {
  const active = state.members.filter((m) => m.status === 'ACTIVE'),
    ranking = state.runs.find((r) => r.group === 'RANKING'),
    drop = state.runs.find((r) => r.group === 'DROP'),
    assigned = new Set(state.runs.flatMap((r) => r.assignments.map((a) => a.memberId))),
    reserves = active.filter((m) => !assigned.has(m.id)),
    next = [...state.runs].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const times = state.history.flatMap((r) => (r.duration ? [r.duration] : []));
  const shortages = ['Tank', 'Support']
    .map((role) => ({
      role,
      count: active.filter((m) => m.available && m.roles.includes(role as Role)).length,
    }))
    .filter((x) => x.count < 3);
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <span className="hero-label">
            <span className="live-dot" />
            THE NEXT CHAPTER STARTS HERE
          </span>
          <h2>
            United in purpose.
            <br />
            <span>Unstoppable in battle.</span>
          </h2>
          <p>
            Your Secret Room command center. Assemble the right players,
            <br className="desktop-break" /> perfect your strategy, and take your guild further.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link href="/roster">
                <Swords size={16} />
                Open roster builder
                <ArrowUpRight size={15} />
              </Link>
            </Button>
            <Link href="/analysis" className="text-link">
              <Sparkles size={14} />
              Get AI insights
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
        <div className="hero-emblem">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="emblem-shield">
            <Swords size={72} strokeWidth={1} />
            <span>S T O I C S</span>
            <small>FORTIS IN UNUM</small>
          </div>
          <span className="emblem-star star-one">✦</span>
          <span className="emblem-star star-two">✧</span>
        </div>
        <div className="hero-status">
          <span>
            <i />
            GUILD OPERATIONS
          </span>
          <span>ASIA / MANILA</span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            label: 'Guild members',
            value: state.members.filter((m) => m.status !== 'ARCHIVED').length,
            sub: `${active.length} active members`,
            icon: Users,
            tone: 'gold',
          },
          {
            label: 'Ranking run',
            value: ranking?.assignments.length ?? 0,
            suffix: '/ 24',
            sub:
              ranking?.status === 'FINALIZED' ? 'Roster finalized' : 'Build your strongest lineup',
            icon: Crown,
            tone: 'purple',
          },
          {
            label: 'Drop run',
            value: drop?.assignments.length ?? 0,
            suffix: `/ ${drop?.target ?? 24}`,
            sub: drop ? 'Rotation takes priority' : 'A place for every member',
            icon: Gem,
            tone: 'blue',
          },
          {
            label: 'Available reserves',
            value: reserves.filter((m) => m.available).length,
            sub: `${reserves.filter((m) => !participation(m.id, state.history).previous).length} ready for their next run`,
            icon: Shield,
            tone: 'green',
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">
              {s.label}
              <span className={`stat-icon ${s.tone}`}>
                <s.icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {s.value}
              <span>{s.suffix}</span>
            </div>
            <div className="stat-sub">
              <span className={`dot ${s.tone}`} />
              {s.sub}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel upcoming">
          <div className="panel-heading">
            <h2>
              <CalendarDays size={17} />
              Next secret room
            </h2>
            <span className="badge muted">WEEKLY EVENT</span>
          </div>
          <div className="event-date">
            <div className="date-tile">
              <span>
                {next ? formatDate(next.scheduledAt, { month: 'short' }).toUpperCase() : 'SUN'}
              </span>
              <strong>{next ? formatDate(next.scheduledAt, { day: '2-digit' }) : 'SR'}</strong>
            </div>
            <div>
              <h3>
                {next
                  ? formatDate(next.scheduledAt, { weekday: 'long', month: 'long', day: 'numeric' })
                  : 'Sunday guild night'}
              </h3>
              <p>
                <Clock3 size={13} />
                {next
                  ? formatDate(next.scheduledAt, { hour: 'numeric', minute: '2-digit' })
                  : '10:00 PM'}
                <span>Asia/Manila</span>
              </p>
            </div>
          </div>
          <div className="run-summary">
            <span>
              <i className="dot purple" />
              Ranking run
            </span>
            <b>
              {ranking?.assignments.length ?? 0}
              <small> / 24 players</small>
            </b>
            <span className="badge muted">{ranking?.status ?? 'NOT SCHEDULED'}</span>
          </div>
          <div className="run-summary">
            <span>
              <i className="dot blue" />
              Drop run
            </span>
            <b>
              {drop?.assignments.length ?? 0}
              <small> / {drop?.target ?? 24} players</small>
            </b>
            <span className="badge muted">{drop?.status ?? 'NOT SCHEDULED'}</span>
          </div>
          <div className="panel-bottom">
            <span>Every Sunday. One shared goal.</span>
            <button className="text-link" disabled={readOnly} onClick={schedule}>
              Manage schedule
              <ArrowUpRight size={13} />
            </button>
          </div>
        </section>
        <section className="panel readiness">
          <div className="panel-heading">
            <h2>
              <Swords size={17} />
              Guild readiness
            </h2>
            <Link href="/members">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="readiness-top">
            <div>
              <strong>{active.filter((m) => m.available).length}</strong>
              <span>members available</span>
            </div>
            <span className="badge green">
              <i />
              {active.length
                ? Math.round((active.filter((m) => m.available).length / active.length) * 100)
                : 0}
              % ready
            </span>
          </div>
          <div className="role-bars">
            {ROLES.map((role) => {
              const count = active.filter((m) => m.available && m.roles.includes(role)).length;
              return (
                <div className="role-bar" key={role}>
                  <span className={roleSlug(role)}>
                    <IconForRole role={role} size={13} />
                    {role}
                  </span>
                  <div>
                    <i
                      className={roleSlug(role)}
                      style={{
                        width: `${Math.min(100, (count / Math.max(active.length, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
          <div className="readiness-note">
            {shortages.length ? (
              <>
                <AlertTriangle size={14} />
                {shortages.map((s) => `${s.role}: ${s.count}/3`).join(' · ')} coverage for ranking
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                Critical roles are ready for a ranking lineup
              </>
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-grid lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Recent runs<span className="count-chip">{state.history.length}</span>
            </h2>
            <Link className="text-link" href="/attendance">
              View history
              <ChevronRight size={14} />
            </Link>
          </div>
          {state.history.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>RUN / DATE</th>
                    <th>PARTICIPANTS</th>
                    <th>CLEAR TIME</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {state.history.slice(0, 4).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="table-name">
                          {r.group === 'RANKING' ? <Crown size={15} /> : <Gem size={15} />}{' '}
                          {r.group === 'RANKING' ? 'Ranking run' : 'Drop run'}
                        </span>
                        <small>{formatDate(r.scheduledAt)}</small>
                      </td>
                      <td>{r.attendance.filter((a) => a.present).length} players</td>
                      <td>{duration(r.duration)}</td>
                      <td>
                        <span className="badge green">Completed</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Your story starts with the first run">
              <p>Completed runs and confirmed attendance will appear here.</p>
              <Button variant="outline" onClick={schedule} disabled={readOnly}>
                <Plus size={14} />
                Schedule your first run
              </Button>
            </Empty>
          )}
        </section>
        <section className="panel rotation-panel">
          <div className="panel-heading">
            <h2>
              <Sparkles size={16} />
              No one left behind
            </h2>
            <span className="badge purple">ROTATION</span>
          </div>
          <p>
            A fair shot at the next run.
            <br />
            Members waiting longest get priority.
          </p>
          {reserves.length ? (
            <div className="rotation-list">
              {[...reserves]
                .sort(
                  (a, b) =>
                    participation(b.id, state.history).priority -
                    participation(a.id, state.history).priority,
                )
                .slice(0, 3)
                .map((m) => (
                  <div key={m.id}>
                    <ClassIcon member={m} icons={state.settings.icons} />
                    <span>
                      <b>{m.name}</b>
                      <small>
                        {m.job} · Lv. {m.level}
                      </small>
                    </span>
                    <span className="badge gold">
                      {participation(m.id, state.history).missed} missed
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="rotation-empty">
              <Users size={28} />
              <span>
                Import your roster to start
                <br />
                tracking member rotation.
              </span>
            </div>
          )}
          <Link href="/reserves" className="rotation-link">
            Explore reserves
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      {!state.members.length && (
        <div className="onboarding">
          <span className="onboarding-icon">
            <Upload size={21} />
          </span>
          <div>
            <h3>Your guild belongs here.</h3>
            <p>Import your existing roster to start building your first Secret Room lineup.</p>
          </div>
          <Button variant="outline" disabled={readOnly} onClick={importRoster}>
            Import guild roster
            <ArrowRight size={14} />
          </Button>
        </div>
      )}
      <div className="mini-stats">
        <span>
          LAST CLEAR <b>{duration(times[0] ?? null)}</b>
        </span>
        <span>
          PERSONAL BEST <b>{duration(times.length ? Math.min(...times) : null)}</b>
        </span>
        <span>
          CONFIRMED RUNS <b>{state.history.length}</b>
        </span>
        <span>
          ONE GUILD. <b>ENDLESS POSSIBILITIES.</b>
        </span>
      </div>
    </>
  );
}
