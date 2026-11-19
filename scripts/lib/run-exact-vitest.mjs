import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** The gate fails if the declared suite and Vitest's selected files differ. */
export function runExactVitest(root, testFiles) {
  for (const file of testFiles) {
    if (!existsSync(resolve(root, file))) throw new Error(`Offline test file is missing: ${file}`)
  }
  const options = {cwd: root, shell: process.platform === 'win32'}
  const listing = spawnSync('pnpm', ['exec', 'vitest', 'list', '--filesOnly', ...testFiles], {...options, encoding:'utf8'})
  if (listing.error) throw listing.error
  if (listing.status !== 0) throw new Error(listing.stderr || 'Vitest file collection failed')
  const actual = listing.stdout.trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/'))
  const missing = testFiles.filter(file => !actual.includes(file))
  const unexpected = actual.filter(file => !testFiles.includes(file))
  if (missing.length || unexpected.length || actual.length !== testFiles.length) {
    throw new Error(`Vitest collection mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}`)
  }
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...testFiles], {...options, stdio:'inherit'})
  if (result.error) throw result.error
  return result.status ?? 1
}
