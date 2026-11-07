import { cpSync, mkdirSync } from 'node:fs';
// Copy only reusable client code and pure domain logic; never copy .env, .local, Prisma engines or secrets.
const dest = new URL('../sites/stoics-manager/', import.meta.url);
mkdirSync(new URL('lib/', dest), { recursive: true });
mkdirSync(new URL('src/', dest), { recursive: true });
cpSync(new URL('../components/', import.meta.url), new URL('components/', dest), {
  recursive: true,
});
for (const name of ['domain.ts', 'optimizer.ts'])
  cpSync(new URL(`../lib/${name}`, import.meta.url), new URL(`lib/${name}`, dest));
cpSync(new URL('../app/globals.css', import.meta.url), new URL('src/globals.css', dest));
mkdirSync(new URL('tests/', dest), { recursive: true });
cpSync(
  new URL('../tests/optimizer.test.ts', import.meta.url),
  new URL('tests/optimizer.test.ts', dest),
);
console.log('Sites frontend and deterministic domain modules synchronized.');
