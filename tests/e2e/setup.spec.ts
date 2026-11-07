import { test, expect } from '@playwright/test';
test.skip(
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  'Setup smoke checks apply only before a Supabase project is configured.',
);
test('sign-in gives actionable configuration guidance instead of a legacy fallback', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('setup-check@example.com');
  await page.getByLabel('Password', { exact: true }).fill('setup-check-password');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Enter command center' }).click();
  expect((await response).status()).toBe(503);
  await expect(
    page.getByText(
      'Sign-in unavailable. Configure Supabase and run the database migrations and admin seed.',
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('a former custom session cookie cannot access guild data', async ({
  context,
  request,
  baseURL,
}) => {
  await context.addCookies([{ name: 'stoics-session', value: 'legacy-token', url: baseURL! }]);
  const response = await context.request.get('/api/state');
  expect(response.status()).toBe(401);
  const logout = await request.delete('/api/auth', { headers: { Origin: baseURL! } });
  expect(logout.ok()).toBe(true);
});
