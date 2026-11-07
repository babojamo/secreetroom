'use client';
import { useState } from 'react';
import {
  Users,
  ChevronRight,
  Plus,
  Search,
  Download,
  Upload,
  Check,
  X,
  LockKeyhole,
  Save,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  JOBS,
  ROLES,
  defaultRole,
  normalizeName,
  participation,
  type State,
  type Member,
  type Role,
} from '@/lib/domain';
import {
  formatDate,
  roleSlug,
  ClassIcon,
  Empty,
  Modal,
  Command,
  parseCsv,
  download,
  csvDownload,
} from './shared';

export function Members({
  state,
  command,
  edit,
  readOnly,
}: {
  state: State;
  command: Command;
  edit: (m?: Member) => void;
  readOnly: boolean;
}) {
  const [search, setSearch] = useState(''),
    [job, setJob] = useState(''),
    [role, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('name'),
    [minLevel, setMinLevel] = useState(''),
    [minRating, setMinRating] = useState(''),
    [selected, setSelected] = useState<string[]>([]);
  const list = state.members
    .filter(
      (m) =>
        (!search || normalizeName(m.name).includes(normalizeName(search))) &&
        (!job || m.job === job) &&
        (!role || m.roles.includes(role as Role)) &&
        (!status ? m.status !== 'ARCHIVED' : m.status === status) &&
        m.level >= Number(minLevel) &&
        m.dps >= Number(minRating),
    )
    .sort((a, b) =>
      sort === 'level'
        ? b.level - a.level
        : sort === 'strength'
          ? b.dps + b.aoe - a.dps - a.aoe
          : sort === 'attendance'
            ? participation(a.id, state.history).total - participation(b.id, state.history).total
            : a.name.localeCompare(b.name),
    );
  const exportMembers = async (excel = false) => {
    const rows = list.map((m) => ({
      Name: m.name,
      Class: m.job,
      Level: m.level,
      Role: m.primaryRole,
      'Eligible roles': m.roles.join(';'),
      DPS: m.dps,
      AoE: m.aoe,
      Tank: m.tank,
      Support: m.support,
      'High DPS': m.highDps,
      'High AoE': m.highAoe,
      Core: m.core,
      Available: m.available,
      Status: m.status,
    }));
    if (excel) {
      const Excel = await import('exceljs');
      const wb = new Excel.Workbook();
      const ws = wb.addWorksheet('Members');
      ws.columns = Object.keys(rows[0] ?? { Name: '' }).map((key) => ({
        header: key,
        key,
        width: 20,
      }));
      ws.addRows(rows);
      download(
        new Blob([await wb.xlsx.writeBuffer()], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        'stoics-members.xlsx',
      );
    } else csvDownload(rows, 'stoics-members.csv');
  };
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          Guild roster<span className="count-chip">{list.length}</span>
        </h2>
        <div className="inline-actions">
          <Button variant="ghost" onClick={() => exportMembers()}>
            <Download size={14} />
            CSV
          </Button>
          <Button variant="ghost" onClick={() => exportMembers(true)}>
            Excel
          </Button>
        </div>
      </div>
      <div className="filters">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search character name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="Class filter" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">All classes</option>
          {JOBS.map((j) => (
            <option key={j}>{j}</option>
          ))}
        </select>
        <select aria-label="Role filter" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Current members</option>
          {['ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          aria-label="Minimum level"
          type="number"
          placeholder="Min level"
          className="narrow"
          value={minLevel}
          onChange={(e) => setMinLevel(e.target.value)}
        />
        <input
          aria-label="Minimum DPS rating"
          type="number"
          min="1"
          max="10"
          placeholder="Min DPS"
          className="narrow"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
        />
        <select aria-label="Sort members" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Name A–Z</option>
          <option value="level">Highest level</option>
          <option value="strength">Highest ratings</option>
          <option value="attendance">Fewest runs</option>
        </select>
      </div>
      {selected.length > 0 && (
        <div className="bulk-bar">
          <span>{selected.length} selected</span>
          <Button
            variant="outline"
            disabled={readOnly}
            onClick={() => command('bulk', { ids: selected, available: true })}
          >
            Available
          </Button>
          <Button
            variant="outline"
            disabled={readOnly}
            onClick={() => command('bulk', { ids: selected, available: false })}
          >
            Unavailable
          </Button>
          <select
            aria-label="Add eligible role"
            disabled={readOnly}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void command('bulk', { ids: selected, role: e.target.value });
              e.target.value = '';
            }}
          >
            <option value="">Add eligible role…</option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      {list.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={list.every((m) => selected.includes(m.id))}
                    onChange={(e) => setSelected(e.target.checked ? list.map((m) => m.id) : [])}
                  />
                </th>
                <th>CHARACTER</th>
                <th>ROLES</th>
                <th>PERFORMANCE</th>
                <th>PARTICIPATION</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const p = participation(m.id, state.history);
                return (
                  <tr key={m.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${m.name}`}
                        checked={selected.includes(m.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, m.id]
                              : selected.filter((id) => id !== m.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="member-cell">
                        <ClassIcon member={m} icons={state.settings.icons} />
                        <div>
                          <b>
                            {m.name} {m.core && <LockKeyhole size={11} />}
                          </b>
                          <small>
                            {m.job} · Lv. {m.level}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill ${roleSlug(m.primaryRole)}`}>
                        {m.primaryRole}
                      </span>
                      <small>{m.roles.filter((r) => r !== m.primaryRole).join(' · ')}</small>
                    </td>
                    <td>
                      <div className="rating-dots">
                        <span>
                          DPS <b>{m.dps}</b>
                        </span>
                        <span>
                          AoE <b>{m.aoe}</b>
                        </span>
                      </div>
                      <small>
                        {m.highDps ? '⭐ High DPS ' : ''}
                        {m.highAoe ? '🌪 High AoE' : ''}
                      </small>
                    </td>
                    <td>
                      {p.total} runs
                      <small>
                        {p.last ? `Last ${formatDate(p.last)}` : 'No confirmed participation'}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`badge ${m.status === 'ACTIVE' && m.available ? 'green' : 'muted'}`}
                      >
                        {m.status === 'ACTIVE'
                          ? m.available
                            ? 'Available'
                            : 'Unavailable'
                          : m.status}
                      </span>
                    </td>
                    <td>
                      <Button variant="ghost" disabled={readOnly} onClick={() => edit(m)}>
                        Edit
                        <ChevronRight size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={state.user.role !== 'ADMIN'}
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${m.name}? Members with run history must be archived instead.`,
                            )
                          )
                            void command('deleteMember', { id: m.id });
                        }}
                        aria-label={`Delete ${m.name}`}
                      >
                        <X size={13} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={<Users size={28} />}
          title={state.members.length ? 'No matching characters' : 'A guild is made of its members'}
        >
          <p>
            {state.members.length
              ? 'Try adjusting your search and filters.'
              : 'Add a character or import your existing guild roster to get started.'}
          </p>
          <Button disabled={readOnly} onClick={() => edit()}>
            <Plus size={15} />
            Add your first member
          </Button>
        </Empty>
      )}
    </section>
  );
}

export function MemberForm({
  member,
  onClose,
  onSave,
}: {
  member?: Member;
  onClose: () => void;
  onSave: (m: unknown) => Promise<void>;
}) {
  const [roles, setRoles] = useState<Role[]>(member?.roles ?? ['DPS']),
    [job, setJob] = useState<Member['job']>(member?.job ?? 'Slayer'),
    [primary, setPrimary] = useState<Role>(member?.primaryRole ?? 'DPS');
  return (
    <Modal title={member ? `Edit ${member.name}` : 'Add guild member'} onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSave({
            id: member?.id,
            name: f.get('name'),
            job,
            level: Number(f.get('level')),
            primaryRole: primary,
            roles,
            status: f.get('status'),
            available: f.get('available') === 'on',
            highDps: f.get('highDps') === 'on',
            highAoe: f.get('highAoe') === 'on',
            core: f.get('core') === 'on',
            dps: Number(f.get('dps')),
            aoe: Number(f.get('aoe')),
            tank: Number(f.get('tank')),
            support: Number(f.get('support')),
            equipment: f.get('equipment'),
            notes: f.get('notes'),
          });
        }}
      >
        <div className="form-grid">
          <label>
            Character name
            <input
              name="name"
              required
              maxLength={60}
              defaultValue={member?.name}
              placeholder="Exact in-game name"
            />
          </label>
          <label>
            Class
            <select
              value={job}
              onChange={(e) => {
                const j = e.target.value as Member['job'];
                setJob(j);
                if (!member) {
                  const r = defaultRole(j);
                  setRoles([r]);
                  setPrimary(r);
                }
              }}
            >
              {JOBS.map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </label>
          <label>
            Level
            <input
              name="level"
              type="number"
              min="1"
              max="999"
              required
              defaultValue={member?.level ?? 1}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={member?.status ?? 'ACTIVE'}>
              {['ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <h3 className="form-section">Role capabilities</h3>
        <p className="form-help">
          Choose the roles this character can actually perform, regardless of class.
        </p>
        <div className="checkbox-row">
          {ROLES.map((r) => (
            <label key={r}>
              <input
                type="checkbox"
                checked={roles.includes(r)}
                onChange={(e) =>
                  setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))
                }
              />
              {r}
            </label>
          ))}
        </div>
        <label>
          Primary role
          <select value={primary} onChange={(e) => setPrimary(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <h3 className="form-section">Officer performance ratings</h3>
        <div className="form-grid four">
          {['dps', 'aoe', 'tank', 'support'].map((r) => (
            <label key={r}>
              {r.toUpperCase()} / 10
              <input
                name={r}
                type="number"
                min="1"
                max="10"
                required
                defaultValue={member?.[r as 'dps'] ?? 5}
              />
            </label>
          ))}
        </div>
        <div className="checkbox-row">
          {[
            ['available', 'Available for SR'],
            ['highDps', 'High DPS'],
            ['highAoe', 'High AoE'],
            ['core', 'Core member'],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                name={key}
                type="checkbox"
                defaultChecked={member ? Boolean(member[key as 'available']) : key === 'available'}
              />
              {label}
            </label>
          ))}
        </div>
        <label>
          Equipment / build notes
          <textarea name="equipment" defaultValue={member?.equipment} maxLength={4000} rows={2} />
        </label>
        <label>
          Officer notes
          <textarea name="notes" defaultValue={member?.notes} maxLength={4000} rows={2} />
        </label>
        <div className="modal-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!roles.length || !roles.includes(primary)}>
            <Save size={15} />
            Save member
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type ImportRow = { name: string; job: string; level: number };

export function Importer({
  state,
  command,
  onClose,
}: {
  state: State;
  command: Command;
  onClose: () => void;
}) {
  const [table, setTable] = useState<string[][]>([]),
    [map, setMap] = useState({ name: 0, job: 1, level: 2 }),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const rows: ImportRow[] = table
    .slice(1)
    .filter((r) => r.some(Boolean))
    .map((r) => ({
      name: (r[map.name] ?? '').trim(),
      job: (r[map.job] ?? '').trim(),
      level: Number(r[map.level]),
    }));
  const keys = rows.map((r) => normalizeName(r.name));
  const invalid =
    rows.some(
      (r) =>
        !r.name ||
        !JOBS.includes(r.job as Member['job']) ||
        !Number.isInteger(r.level) ||
        r.level < 1 ||
        r.level > 999,
    ) || new Set(keys).size !== keys.length;
  const missing = state.members.filter(
    (m) => !keys.includes(normalizeName(m.name)) && m.status !== 'ARCHIVED',
  );
  async function load(file: File) {
    setPending(true);
    setError('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File must be smaller than 10 MB.');
      const Excel = await import('exceljs');
      let data: string[][] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        data = parseCsv(text);
      } else {
        const wb = new Excel.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) throw new Error('No worksheet found.');
        ws.eachRow((r) => {
          const values: string[] = [];
          for (let c = 1; c <= ws.columnCount; c++) values.push(r.getCell(c).text);
          data.push(values);
        });
      }
      if (data.length > 2001) throw new Error('Import at most 2,000 members at a time.');
      setTable(data);
      const headers = data[0]?.map((s) => s.toLowerCase()) ?? [];
      const find = (pattern: RegExp, fallback: number) => {
        const i = headers.findIndex((s) => pattern.test(s));
        return i < 0 ? fallback : i;
      };
      setMap({
        name: find(/name|ign|character/, 0),
        job: find(/job|class/, 1),
        level: find(/level|lvl/, 2),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read file.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="Import guild roster" onClose={onClose} wide>
      <p className="form-help">
        Upload CSV or Excel (.xlsx). Existing names match using Unicode normalization; your ratings,
        tags, notes, and attendance are preserved.
      </p>
      <label className="upload-zone">
        <Upload size={26} />
        <strong>{pending ? 'Reading your roster…' : 'Choose a roster file'}</strong>
        <span>CSV or XLSX · up to 10 MB · first worksheet</span>
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={pending}
          onChange={(e) => {
            if (e.target.files?.[0]) void load(e.target.files[0]);
          }}
        />
      </label>
      {error && <div className="callout error">{error}</div>}
      {table.length > 0 && (
        <>
          <div className="form-grid three">
            {(['name', 'job', 'level'] as const).map((key) => (
              <label key={key}>
                Map {key}
                <select
                  value={map[key]}
                  onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}
                >
                  {table[0].map((h, i) => (
                    <option value={i} key={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="callout">
            {
              rows.filter(
                (r) => !state.members.some((m) => normalizeName(m.name) === normalizeName(r.name)),
              ).length
            }{' '}
            new ·{' '}
            {
              rows.filter((r) =>
                state.members.some((m) => normalizeName(m.name) === normalizeName(r.name)),
              ).length
            }{' '}
            updated · {missing.length} existing members missing from file, retained for review
          </div>
          <div className="table-scroll import-preview">
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>CLASS</th>
                  <th>LEVEL</th>
                  <th>REVIEW</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name || 'Missing name'}</td>
                    <td>{r.job}</td>
                    <td>{r.level || '—'}</td>
                    <td>
                      {keys.indexOf(keys[i]) !== i ? (
                        <span className="danger-text">Duplicate</span>
                      ) : !r.name ||
                        !JOBS.includes(r.job as Member['job']) ||
                        !Number.isInteger(r.level) ||
                        r.level < 1 ||
                        r.level > 999 ? (
                        <span className="danger-text">Invalid data</span>
                      ) : state.members.some(
                          (m) => normalizeName(m.name) === normalizeName(r.name),
                        ) ? (
                        'Update'
                      ) : (
                        'New'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && (
            <details>
              <summary>{missing.length} members absent from this import</summary>
              <p>{missing.map((m) => m.name).join(', ')}</p>
            </details>
          )}
          {invalid && (
            <div className="callout error">
              Correct invalid values or duplicate names in the source file, then upload again.
            </div>
          )}
          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={invalid || !rows.length || pending}
              onClick={async () => {
                setPending(true);
                if (await command('import', { rows })) onClose();
                setPending(false);
              }}
            >
              <Check size={15} />
              Confirm {rows.length} members
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
