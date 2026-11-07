'use client';
import { type ReactNode } from 'react';
import { Shield, Swords, X, Flame, Wind, Heart, Crosshair } from 'lucide-react';
import { Button } from './ui/button';
import { type Member } from '@/lib/domain';

export const formatDate = (
  s: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) => new Date(s).toLocaleString('en-US', { ...options, timeZone: 'Asia/Manila' });

export const roleSlug = (r: string) => r.toLowerCase().replace('/', '-');

export function IconForRole({ role, size = 16 }: { role: string; size?: number }) {
  const Icon =
    role === 'Tank'
      ? Shield
      : role === 'Support'
        ? Heart
        : role === 'AoE'
          ? Wind
          : role === 'Buff/DPS'
            ? Flame
            : Crosshair;
  return <Icon size={size} />;
}

export function ClassIcon({
  member,
  icons = {},
}: {
  member: Pick<Member, 'job' | 'primaryRole'>;
  icons?: Record<string, string>;
}) {
  return (
    <span title={member.job} className={`class-icon ${roleSlug(member.primaryRole)}`}>
      {icons[member.job] ? (
        <img src={icons[member.job]} alt={member.job} />
      ) : (
        <>
          <IconForRole role={member.primaryRole} size={22} />
          <span className="class-sigil">{member.job.slice(0, 2).toUpperCase()}</span>
        </>
      )}
    </span>
  );
}

export function Empty({
  icon = <Swords size={28} />,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}

export type Command = (action: string, payload: unknown) => Promise<boolean>;

export function duration(seconds: number | null) {
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

export function nextSunday() {
  const d = new Date(Date.now() + 8 * 3600000);
  const delta = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(22, 0, 0, 0);
  let value = d.toISOString().slice(0, 16);
  if (Date.parse(`${value}+08:00`) <= Date.now()) {
    d.setUTCDate(d.getUTCDate() + 7);
    value = d.toISOString().slice(0, 16);
  }
  return value;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  return rows;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvDownload(rows: Record<string, unknown>[], name: string) {
  const headers = Object.keys(rows[0] ?? {});
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  download(
    new Blob(
      [
        '\uFEFF' +
          [
            headers.map(cell).join(','),
            ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
          ].join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    ),
    name,
  );
}
