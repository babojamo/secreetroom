'use client';
import { useState } from 'react';
import { Sparkles, Check, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { type State, type Assignment } from '@/lib/domain';
import { formatDate, Empty, Command } from './shared';

export type AIResponse = {
  summary: string;
  recommendations: string[];
  assignments: Assignment[];
  errors: string[];
  target: number | null;
};

export function Analysis({
  state,
  command,
  notify,
  readOnly,
}: {
  state: State;
  command: Command;
  notify: (s: string) => void;
  readOnly: boolean;
}) {
  const [runId, setRunId] = useState(state.runs[0]?.id ?? ''),
    [prompt, setPrompt] = useState(
      'Analyze this lineup’s balance, role coverage, and rotation fairness. Recommend improvements using our configured ratings.',
    ),
    [result, setResult] = useState<AIResponse | null>(null),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(state.revision);
  const run = state.runs.find((r) => r.id === runId);
  const analyze = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, prompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
      setRevision(state.revision);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'AI unavailable.');
    } finally {
      setBusy(false);
    }
  };
  const diff =
    result?.assignments.flatMap((a) => {
      const old = run?.assignments.find((b) => b.memberId === a.memberId);
      if (old && old.party === a.party && old.slot === a.slot && old.role === a.role) return [];
      return [
        {
          name: state.members.find((m) => m.id === a.memberId)?.name ?? a.memberId,
          from: old ? `Party ${old.party + 1}, slot ${old.slot + 1} · ${old.role}` : 'Reserves',
          to: `Party ${a.party + 1}, slot ${a.slot + 1} · ${a.role}`,
        },
      ];
    }) ?? [];
  return (
    <div className="analysis-layout">
      <section className="panel ai-input">
        <span className="ai-orb">
          <Sparkles size={29} />
        </span>
        <span className="badge purple">YOUR GUILD STRATEGIST</span>
        <h2>
          A second perspective.
          <br />
          Your final decision.
        </h2>
        <p>
          Get recommendations grounded in your member ratings, eligible roles, and confirmed
          attendance.
        </p>
        <label>
          Scheduled run
          <select
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value);
              setResult(null);
            }}
          >
            <option value="">Choose an active run…</option>
            {state.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.group} · {formatDate(r.scheduledAt)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ask your roster assistant
          <textarea
            rows={5}
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <div className="prompt-chips">
          {[
            'Prioritize High AoE characters.',
            'Explain why these members were selected.',
            'Who has missed the last three weeks?',
          ].map((p) => (
            <button key={p} onClick={() => setPrompt(p)}>
              {p}
            </button>
          ))}
        </div>
        <Button disabled={readOnly || busy || !runId || !prompt.trim()} onClick={analyze}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}Analyze
          lineup with AI
        </Button>
        <small>Suggestions are validated and require your review before saving.</small>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <Sparkles size={17} />
            Analysis & proposed changes
          </h2>
        </div>
        {result ? (
          <div className="analysis-result">
            <p className="ai-summary">{result.summary}</p>
            {result.recommendations.map((r, i) => (
              <div className="recommendation" key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <p>{r}</p>
              </div>
            ))}
            {result.errors.length > 0 && (
              <div className="callout error">
                Proposal rejected by roster rules: {result.errors.join(' ')}
              </div>
            )}
            {result.assignments.length > 0 && (
              <>
                <h3>Proposed lineup diff</h3>
                {result.target !== null && result.target !== run?.target && (
                  <div className="callout">
                    Participant target: {run?.target} → {result.target}
                  </div>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>MEMBER</th>
                        <th>BEFORE</th>
                        <th>AFTER</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td>{d.from}</td>
                          <td>{d.to}</td>
                        </tr>
                      ))}
                      {run?.assignments
                        .filter((a) => !result.assignments.some((b) => b.memberId === a.memberId))
                        .map((a) => (
                          <tr key={a.memberId}>
                            <td>{state.members.find((m) => m.id === a.memberId)?.name}</td>
                            <td>Party {a.party + 1}</td>
                            <td>Reserves</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  disabled={
                    readOnly ||
                    !!result.errors.length ||
                    revision !== state.revision ||
                    run?.status !== 'DRAFT'
                  }
                  onClick={async () => {
                    if (
                      await command('saveRoster', {
                        runId,
                        assignments: result.assignments,
                        ...(result.target !== null ? { target: result.target } : {}),
                      })
                    )
                      setResult(null);
                  }}
                >
                  <Check size={15} />
                  Apply validated proposal
                </Button>
                {revision !== state.revision && (
                  <p className="danger-text">Guild data changed. Analyze again before applying.</p>
                )}
              </>
            )}
          </div>
        ) : (
          <Empty icon={<Sparkles size={32} />} title="Insight starts with a question">
            <p>
              Select a run and ask about your lineup.
              <br />
              The deterministic generator works independently of AI.
            </p>
          </Empty>
        )}
      </section>
    </div>
  );
}
