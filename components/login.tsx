'use client';
import { useState } from 'react';
import { Shield, Swords, LoaderCircle, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';

export function Login({ error, onSuccess }: { error: string; onSuccess: () => Promise<void> }) {
  const [message, setMessage] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <div className="login-wrap">
      <div className="login-art">
        <span className="big-crest">
          <Swords size={60} />
        </span>
        <div className="eyebrow">THE GUILD COMES FIRST</div>
        <h1>
          One guild.
          <br />
          One purpose.
        </h1>
        <p>
          Plan the party. Conquer the room.
          <br />
          Build your next victory together.
        </p>
        <div className="login-lines" />
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const f = new FormData(e.currentTarget);
          try {
            const r = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: f.get('email'), password: f.get('password') }),
            });
            const d = await r.json();
            if (!r.ok) setMessage(d.error);
            else await onSuccess();
          } catch {
            setMessage('Could not reach the server.');
          } finally {
            setPending(false);
          }
        }}
      >
        <span className="badge gold">OFFICER ACCESS</span>
        <h2>Welcome to STOICS</h2>
        <p>Sign in to your guild command center.</p>
        {error && !error.startsWith('Sign in') && <div className="callout">{error}</div>}
        <label>
          Email address
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="officer@your-guild.com"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
          />
        </label>
        {message && <div className="callout error">{message}</div>}
        <Button disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={16} /> : <Shield size={16} />}Enter
          command center
          <ArrowRight size={16} />
        </Button>
        <small>Private guild workspace · Secure officer access</small>
        <details>
          <summary>First time setting up?</summary>
          <p>
            Copy .env.example to .env, add your Supabase project settings and admin credentials,
            then run <code>npm run db:migrate</code> and <code>npm run db:seed</code>. See README.md
            for complete instructions.
          </p>
        </details>
      </form>
    </div>
  );
}
