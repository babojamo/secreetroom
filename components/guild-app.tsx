'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  Swords,
  LayoutDashboard,
  Users,
  Crown,
  Gem,
  Clock3,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  ChevronRight,
  ChevronDown,
  Plus,
  CircleHelp,
  Bell,
  Upload,
  X,
  LogOut,
  Menu,
  RefreshCw,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { type State, type Member } from '@/lib/domain';
import { Empty, Command } from './shared';
import { Login } from './login';
import { Dashboard } from './dashboard';
import { Members, MemberForm, Importer } from './members';
import { Builder } from './builder';
import { Reserves } from './reserves';
import { Attendance } from './attendance';
import { Statistics } from './statistics';
import { Analysis } from './analysis';
import { SettingsPanel } from './settings';
import { RunForm } from './schedule';

export function GuildApp() {
  const path = usePathname();
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<'member' | 'import' | 'run' | null>(null),
    [editing, setEditing] = useState<Member | undefined>();
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) {
        setState(null);
        setError(data.error);
      } else {
        setState(data);
        setError('');
      }
    } catch {
      setError('Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const command: Command = async (action, payload) => {
    if (!state || busy) return false;
    setBusy(true);
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, revision: state.revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data.state);
      setNotice(action === 'generate' ? 'Lineup generated and saved.' : 'Changes saved.');
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Unable to save.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const readOnly = state?.user.role === 'VIEWER';
  const edit = (m?: Member) => {
    setEditing(m);
    setModal('member');
  };
  const title =
    navigation.map((n) => n[1].find((item) => item[1] === path)?.[0]).find(Boolean) ?? 'Dashboard';
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link href="/" className="brand">
          <span className="brand-crest">
            <Swords size={26} />
          </span>
          <span>
            STOICS<small>GUILD COMMAND CENTER</small>
          </span>
        </Link>
        <div className="guild-switch">
          <span className="guild-avatar">S</span>
          <div>
            Stoics Guild
            <small>
              <i />
              Flyff Universe · Asia
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {navigation.map(([section, items]) => (
            <div className="nav-group" key={section}>
              <div className="nav-label">{section}</div>
              {items.map(([label, href, Icon]) => (
                <Link
                  onClick={() => setMobile(false)}
                  href={href}
                  key={href}
                  className={`nav-item ${path === href ? 'active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {label === 'AI roster analysis' && <span className="mini-tag">AI</span>}
                  {label === 'Guild members' && state && (
                    <span className="nav-count">
                      {state.members.filter((m) => m.status !== 'ARCHIVED').length}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="guild-motto">
            <Shield size={21} />
            <span>
              Stronger together.<small>Every member. Every run.</small>
            </span>
          </div>
          <div className="profile">
            <span className="avatar">{state?.user.email[0].toUpperCase() ?? 'S'}</span>
            <div>
              {state?.user.email.split('@')[0] ?? 'Guild officer'}
              <small>{state?.user.role ?? 'Sign in to continue'}</small>
            </div>
            {state && (
              <button
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/auth', { method: 'DELETE' });
                    if (!response.ok) {
                      setNotice('Unable to sign out. Please retry.');
                      return;
                    }
                    setState(null);
                    setError('Sign in to access the guild.');
                  } catch {
                    setNotice('Unable to reach the server. Please retry signing out.');
                  }
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Command center</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <i />
              Guild workspace
            </span>
            <span className="top-divider" />
            <button
              aria-label="Setup help"
              onClick={() =>
                setNotice(
                  'Setup: configure your Supabase project in .env, then run npm run db:migrate and npm run db:seed.',
                )
              }
            >
              <CircleHelp size={18} />
            </button>
            <button
              aria-label="Notifications"
              onClick={() =>
                setNotice(
                  state?.audits.length
                    ? `Latest activity: ${state.audits[0].action} by ${state.audits[0].actor}`
                    : 'No guild activity yet.',
                )
              }
            >
              <Bell size={18} />
            </button>
            <span className="avatar small">S</span>
          </div>
        </header>
        <main>
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Opening the guild command center…
            </div>
          ) : !state ? (
            <Login error={error} onSuccess={refresh} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">STOICS / SECRET ROOM</div>
                  <h1>
                    {title}
                    {path === '/' && (
                      <span aria-hidden="true" className="heading-dot">
                        .
                      </span>
                    )}
                  </h1>
                  <p>
                    {path === '/'
                      ? 'A stronger guild starts with a better plan. Make every run count.'
                      : path === '/members'
                        ? 'Your guild. Every character, every capability, in one place.'
                        : path === '/settings'
                          ? 'Fine-tune your guild’s command center.'
                          : 'Build with purpose. Balance your parties. Leave no member behind.'}
                  </p>
                </div>
                <div className="heading-actions">
                  {path === '/members' ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={readOnly}
                        onClick={() => setModal('import')}
                      >
                        <Upload size={15} />
                        Import roster
                      </Button>
                      <Button disabled={readOnly} onClick={() => edit()}>
                        <Plus size={16} />
                        Add member
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" onClick={refresh}>
                        <RefreshCw size={14} />
                        Refresh
                      </Button>
                      <Button disabled={readOnly} onClick={() => setModal('run')}>
                        <Plus size={16} />
                        Schedule run
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {path === '/' ? (
                <Dashboard
                  state={state}
                  command={command}
                  schedule={() => setModal('run')}
                  importRoster={() => setModal('import')}
                  readOnly={readOnly}
                />
              ) : path === '/members' ? (
                <Members state={state} command={command} edit={edit} readOnly={readOnly} />
              ) : ['/roster', '/ranking', '/drop'].includes(path) ? (
                <Builder
                  key={path}
                  state={state}
                  command={command}
                  initialGroup={path === '/drop' ? 'DROP' : 'RANKING'}
                  busy={busy}
                  readOnly={readOnly}
                  notify={setNotice}
                  schedule={() => setModal('run')}
                />
              ) : path === '/reserves' ? (
                <Reserves state={state} edit={edit} />
              ) : path === '/attendance' ? (
                <Attendance state={state} command={command} readOnly={readOnly} />
              ) : path === '/statistics' ? (
                <Statistics state={state} />
              ) : path === '/analysis' ? (
                <Analysis state={state} command={command} notify={setNotice} readOnly={readOnly} />
              ) : path === '/settings' ? (
                <SettingsPanel state={state} command={command} />
              ) : (
                <Empty title="Page not found">
                  <Link href="/">Return to dashboard</Link>
                </Empty>
              )}
              <footer>
                <span>
                  <Swords size={12} /> STOICS GUILD <b>·</b> SECRET ROOM MANAGER
                </span>
                <span>Made for the guild. Built for the run.</span>
                <span>
                  <i />
                  All times Asia/Manila
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="saving">
          <LoaderCircle className="spin" size={14} />
          Saving…
        </div>
      )}
      {state && modal === 'member' && (
        <MemberForm
          member={editing}
          onClose={() => setModal(null)}
          onSave={async (m) => {
            if (await command('member', m)) setModal(null);
          }}
        />
      )}
      {state && modal === 'import' && (
        <Importer state={state} command={command} onClose={() => setModal(null)} />
      )}{' '}
      {state && modal === 'run' && <RunForm command={command} onClose={() => setModal(null)} />}
    </div>
  );
}

export const navigation = [
  [
    'Overview',
    [
      ['Dashboard', '/', LayoutDashboard],
      ['Guild members', '/members', Users],
    ],
  ],
  [
    'Secret room',
    [
      ['Roster builder', '/roster', Swords],
      ['Ranking run', '/ranking', Crown],
      ['Drop run', '/drop', Gem],
      ['Reserves', '/reserves', Shield],
    ],
  ],
  [
    'Insights',
    [
      ['Attendance history', '/attendance', Clock3],
      ['Run statistics', '/statistics', ChartNoAxesCombined],
      ['AI roster analysis', '/analysis', Sparkles],
    ],
  ],
  ['Administration', [['Settings', '/settings', Settings]]],
] as const;
