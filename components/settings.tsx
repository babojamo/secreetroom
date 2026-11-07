'use client';
import { Plus, Save } from 'lucide-react';
import { Button } from './ui/button';
import { JOBS, defaultRole, type State } from '@/lib/domain';
import { formatDate, ClassIcon, Command } from './shared';

export function SettingsPanel({ state, command }: { state: State; command: Command }) {
  const admin = state.user.role === 'ADMIN';
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2>Optimizer weights</h2>
          <span className="badge gold">ADMIN</span>
        </div>
        <form
          className="panel-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void command(
              'settings',
              Object.fromEntries(
                Object.keys(state.settings.weights).map((k) => [k, Number(f.get(k))]),
              ),
            );
          }}
        >
          <p className="form-help">
            Adjust the tradeoffs after hard constraints are satisfied. Drop runs amplify fairness
            automatically.
          </p>
          {Object.entries(state.settings.weights).map(([key, value]) => (
            <label key={key}>
              {key[0].toUpperCase() + key.slice(1)}
              <input
                name={key}
                type="number"
                min="0"
                max="20"
                step="1"
                defaultValue={value}
                disabled={!admin}
              />
            </label>
          ))}
          <Button disabled={!admin}>
            <Save size={14} />
            Save weights
          </Button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Class icons</h2>
        </div>
        <div className="panel-form">
          <p className="form-help">
            Upload your own licensed class artwork. PNG, JPEG, or WebP, up to 200 KB. Original role
            symbols are used by default.
          </p>
          {JOBS.map((job) => (
            <div className="icon-upload" key={job}>
              <ClassIcon
                member={{ job, primaryRole: defaultRole(job) }}
                icons={state.settings.icons}
              />
              <span>{job}</span>
              <label className="upload-button">
                Upload
                <input
                  disabled={!admin}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 200000) {
                      alert('Choose an image smaller than 200 KB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => void command('icon', { job, icon: reader.result });
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Add Supabase workspace account</h2>
        </div>
        <form
          className="panel-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await command('user', {
                email: f.get('email'),
                password: f.get('password'),
                role: f.get('role'),
              })
            )
              form.reset();
          }}
        >
          <label>
            Email
            <input name="email" type="email" required disabled={!admin} />
          </label>
          <label>
            Initial password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              disabled={!admin}
            />
          </label>
          <label>
            Access role
            <select name="role" disabled={!admin}>
              <option value="VIEWER">Viewer · Read only</option>
              <option value="OFFICER">Guild Officer · Members, rosters, attendance</option>
              <option value="ADMIN">Admin · Full management</option>
            </select>
          </label>
          <Button disabled={!admin}>
            <Plus size={14} />
            Create account
          </Button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Audit trail</h2>
          <span className="badge muted">LAST 30 ACTIONS</span>
        </div>
        <div className="audit-list">
          {state.audits.map((a) => (
            <div key={a.id}>
              <span className="dot gold" />
              <div>
                <b>{a.action}</b>
                <small>
                  {a.actor} ·{' '}
                  {formatDate(a.createdAt, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </small>
              </div>
            </div>
          ))}
          {!state.audits.length && (
            <p className="subtle-empty">Guild changes and their authors will appear here.</p>
          )}
        </div>
      </section>
    </div>
  );
}
