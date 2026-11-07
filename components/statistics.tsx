'use client';
import { Users } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { JOBS, participation, type State } from '@/lib/domain';
import { formatDate, Empty, duration } from './shared';

export function Statistics({ state }: { state: State }) {
  const series = [...state.history].reverse().map((r) => ({
    date: formatDate(r.scheduledAt),
    participants: r.attendance.filter((a) => a.present).length,
    seconds: r.duration,
  }));
  const classes = JOBS.map((job) => ({
    name: job,
    count: state.members.filter((m) => m.job === job && m.status !== 'ARCHIVED').length,
  })).filter((c) => c.count);
  return (
    <>
      <div className="stat-grid">
        {[
          { label: 'Confirmed runs', value: state.history.length },
          {
            label: 'Total participations',
            value: state.history.reduce(
              (n, r) => n + r.attendance.filter((a) => a.present).length,
              0,
            ),
          },
          {
            label: 'Best clear time',
            value: duration(
              state.history.some((r) => r.duration)
                ? Math.min(...state.history.flatMap((r) => (r.duration ? [r.duration] : [])))
                : null,
            ),
          },
          {
            label: 'Members awaiting rotation',
            value: state.members.filter(
              (m) => m.status === 'ACTIVE' && participation(m.id, state.history).missed > 0,
            ).length,
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <span className="stat-label">{s.label}</span>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Confirmed attendance</h2>
          </div>
          {series.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="att" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c7a65b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#c7a65b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#292b33" vertical={false} />
                  <XAxis dataKey="date" stroke="#888b99" fontSize={11} />
                  <YAxis stroke="#888b99" fontSize={11} />
                  <Tooltip contentStyle={{ background: '#17191f', border: '1px solid #35353e' }} />
                  <Area type="monotone" dataKey="participants" stroke="#c7a65b" fill="url(#att)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="Attendance trends grow with your guild">
              <p>Complete a run to see confirmed participation.</p>
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Class distribution</h2>
          </div>
          {classes.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={classes}>
                  <XAxis
                    dataKey="name"
                    stroke="#888b99"
                    fontSize={9}
                    interval={0}
                    angle={-25}
                    height={55}
                    textAnchor="end"
                  />
                  <YAxis stroke="#888b99" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#17191f', border: '1px solid #35353e' }} />
                  <Bar dataKey="count" fill="#9b85cf" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty icon={<Users size={25} />} title="No class data yet">
              <p>Import your guild roster to see its composition.</p>
            </Empty>
          )}
        </section>
      </div>
      <section className="panel spaced">
        <div className="panel-heading">
          <h2>Historical clear times</h2>
          <span className="badge muted">RECORDED RESULTS ONLY</span>
        </div>
        {series.some((r) => r.seconds) ? (
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={series.filter((r) => r.seconds)}>
                <XAxis dataKey="date" stroke="#888b99" />
                <YAxis stroke="#888b99" unit="s" />
                <Tooltip contentStyle={{ background: '#17191f', border: '1px solid #35353e' }} />
                <Bar dataKey="seconds" fill="#7bb8b5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="subtle-empty">
            Record clear times after completed runs. Predicted times are not displayed without a
            calibrated model.
          </p>
        )}
      </section>
    </>
  );
}
