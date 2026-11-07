import { vi } from 'vitest';
// Route-only imports remain guarded in the Next.js bundle, but can be isolated in unit tests.
vi.mock('server-only', () => ({}));
