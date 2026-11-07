import { describe, it, expect } from 'vitest';
import worker from '../sites/stoics-manager/worker/index';
const request = (path: string, method = 'GET', origin = 'https://stoics.test') =>
  new Request(`https://stoics.test${path}`, { method, headers: { Origin: origin } });
describe('portable Sites Worker', () => {
  it('serves the complete application entry and deep links', async () => {
    for (const path of ['/', '/roster', '/members', '/settings']) {
      const response = await worker.fetch(request(path), {});
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      expect(await response.text()).toContain('STOICS');
    }
  });
  it('rejects guild reads before Supabase is configured', async () => {
    expect((await worker.fetch(request('/api/state'), {})).status).toBe(401);
  });
  it('reports missing Supabase setup on sign-in', async () => {
    const r = await worker.fetch(request('/api/auth', 'POST'), {});
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain('Configure Supabase');
  });
  it('enforces same-origin mutation checks before any provider call', async () => {
    expect(
      (await worker.fetch(request('/api/command', 'POST', 'https://attacker.test'), {})).ok,
    ).toBe(false);
  });
  it('returns 404 for missing assets instead of returning HTML as JavaScript', async () => {
    expect((await worker.fetch(request('/assets/missing.js'), {})).status).toBe(404);
  });
});
