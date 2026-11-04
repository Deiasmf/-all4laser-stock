import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
const versions = new Map()
for (const file of files) {
  const version = file.split('_')[0]
  versions.set(version, [...(versions.get(version) ?? []), file])
}
const duplicates = [...versions].filter(([, list]) => list.length > 1)
const report = {
  files: files.length,
  duplicateVersions: duplicates.length,
  duplicates: Object.fromEntries(duplicates),
  manifest: files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex') })),
  reproducible: false,
  reason: 'Baseline ausente; nomes duplicados e dependências históricas requerem reconciliação antes de db push/reset remoto.',
}
console.log(JSON.stringify(report, null, 2))
process.exitCode = duplicates.length ? 1 : 0
