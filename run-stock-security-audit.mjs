import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Explicit allowlist: never accept production, even if a caller sets another ref.
const branchRef = 'wvdmhohijzyymadsfiaz'
const value = process.env.AUDIT_DATABASE_URL
if (!value) {
  console.error('Set AUDIT_DATABASE_URL to the existing isolated audit branch connection string.')
  process.exit(2)
}
let url
try { url = new URL(value) } catch {
  console.error('AUDIT_DATABASE_URL is not a valid PostgreSQL connection string.')
  process.exit(2)
}
const user = decodeURIComponent(url.username)
const direct = url.hostname === `db.${branchRef}.supabase.co` && user === 'postgres'
const pooler = url.hostname.endsWith('.pooler.supabase.com') && user === `postgres.${branchRef}`
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(direct || pooler)) {
  console.error('Refused: only the isolated audit branch is allowed. Production is forbidden.')
  process.exit(2)
}
if (url.searchParams.size || (url.pathname !== '/postgres' && url.pathname !== '')) {
  console.error('Refused: use the postgres database and no connection-string query options.')
  process.exit(2)
}
const suite = fileURLToPath(new URL('../supabase/tests/stock_rpc_security.sql', import.meta.url))
const result = spawnSync('psql', ['-X', '--set', 'ON_ERROR_STOP=1', '--file', suite], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: 'postgres',
    PGUSER: user, PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15',
  },
})
if (result.error) {
  console.error('Unable to start psql. Install the PostgreSQL client before running this suite.')
  process.exit(2)
}
process.exit(result.status ?? 1)
