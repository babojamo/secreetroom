import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const dir = resolve('.local/postgres');
mkdirSync(resolve('.local'), { recursive: true });
const configPath = resolve('.local/database.json');
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : { password: randomBytes(24).toString('hex'), port: 55432 };
if (!existsSync(configPath)) writeFileSync(configPath, JSON.stringify(config));
if (!existsSync('.env'))
  writeFileSync(
    '.env',
    `DATABASE_URL="postgresql://stoics:${config.password}@127.0.0.1:${config.port}/stoics?schema=public"\nDIRECT_URL="postgresql://stoics:${config.password}@127.0.0.1:${config.port}/stoics?schema=public"\nNEXT_PUBLIC_SUPABASE_URL=""\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""\nSUPABASE_SECRET_KEY=""\nADMIN_EMAIL="admin@your-guild.com"\nADMIN_PASSWORD="${randomBytes(18).toString('base64url')}"\nOPENAI_API_KEY=""\nOPENAI_MODEL="gpt-4.1-mini"\nDEMO_SEED="false"\n`,
  );
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'stoics',
  password: config.password,
  port: config.port,
  persistent: true,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => {
    if (String(message).includes('FATAL')) console.error(message);
  },
});
if (!existsSync(resolve(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const existing = await client.query(
  "SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname='stoics'",
);
if (!existing.rowCount)
  await client.query(
    "CREATE DATABASE stoics ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
if (existing.rows[0] && existing.rows[0].encoding !== 'UTF8')
  console.warn(
    'The existing stoics database is not UTF8. Use scripts/repair-local-encoding.mjs to create a separate UTF8 database without deleting existing data.',
  );
await client.end();
console.log(
  `Local PostgreSQL is ready on 127.0.0.1:${config.port}. Credentials are in .env (not printed).`,
);
console.log(
  'Optional database-only development utility. Full app sign-in requires Supabase Auth. See README.md.',
);
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 60000);
