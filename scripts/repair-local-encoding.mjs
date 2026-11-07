// One-time local development repair; preserves the original database in place.
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('.local/database.json', 'utf8'));
const pg = new EmbeddedPostgres({ user: 'stoics', password: config.password, port: config.port });
const client = pg.getPgClient();
await client.connect();
const found = await client.query("SELECT 1 FROM pg_database WHERE datname='stoics_utf8'");
if (!found.rowCount)
  await client.query(
    "CREATE DATABASE stoics_utf8 ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
  );
await client.end();
const env = readFileSync('.env', 'utf8');
const original = `@127.0.0.1:${config.port}/stoics?`;
if (env.includes(original))
  writeFileSync('.env', env.replace(original, `@127.0.0.1:${config.port}/stoics_utf8?`));
console.log(
  'Separate local UTF8 database ready. Original database retained. Run migrations and seed again.',
);
