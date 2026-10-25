import {readFile, writeFile, copyFile, mkdir, access} from 'node:fs/promises'
import {constants} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
const cache = path.resolve('node_modules/.cache/metadata-integration-20261025')
const target = path.resolve('notes/evidence/metadata-integration-20261025/b2-database-directory-relations')
const files = `
b2-root-delivery-review.md
b2-entry-ui-completion-report.md
b2-entry-followup-report.md
b2-entry-followup-review.md
b2-entry-current-row-followup-report.md
b2-entry-current-row-independent-review.md
b2-entry-signature-followup-report.md
b2-entry-signature-followup-freeze-sha256.txt
b2-empty-parent-contract-review.md
b2-db-management-navigation-contract.md
b2-entry-scoped-navigation-contract.md
b2-renderer-current-change-review.md
b2-verify-architecture-features-path-final-report.md
b2-entry-spa-round3.json
b2-entry-spa-round3-audit.mjs
b2-entry-spa-round3-auto-children.png
b2-entry-spa-round3-local-draft.png
b2-entry-spa-round3-switch-px.png
b2-entry-signature-spa.json
b2-entry-signature-spa.png
b2-relation-implementation-contract.md
b2-relation-binding-write-contract.md
b2-relation-formal-binding-contract.md
b2-relation-completion-report.md
b2-relation-frozen-review1.md
b2-relation-freeze-sha256.txt
b2-relation-label-freeze-sha256.txt
b2-relation-model-created.json
b2-relation-output-saved.json
b2-relation-binding-root-audit.mjs
b2-relation-binding-root-audit.json
b2-relation-runtime-expression-probe.mjs
b2-relation-runtime-expression-read.json
b2-relation-runtime-expression-read.md
b2-relation-endpoint-type-read.json
b2-relation-test-user-type-read.json
b2-relation-created-readback.json
b2-relation-name-only-readback.json
b2-relation-spa-main.json
b2-relation-label-spa.json
b2-relation-spa-root-audit.mjs
b2-relation-spa-root-audit.json
b2-relation-draft-cancel.png
b2-relation-new-cancelled.png
b2-relation-before-save.png
b2-relation-saved.png
b2-relation-other-database.png
b2-relation-reopened.png
b2-relation-final-list.png
b2-relation-contract-query-postgen.mjs
b2-relation-contract-query-postgen.json
b2-remaining-usecase-review.md
b2-db-operations-contract.md
b2-delivery-archive.mjs
`.trim().split(/\s+/)
for (const prefix of [
  'b2-entry-spa-round3-audit', 'b2-entry-root-affected-suite2',
  'b2-relation-red11-integration', 'b2-relation-late-structure-red3', 'b2-relation-name-race-red1',
  'b2-relation-mixed-data-type-red1', 'b2-relation-unmapped-expression-red1',
  'b2-relation-mixed-data-type-targeted1', 'b2-relation-database-suite-final4',
  'b2-relation-typecheck-final5', 'b2-relation-typecheck-final6', 'b2-relation-eslint-final5',
  'b2-relation-ai-codegen-final4', 'b2-relation-root-host-suite1', 'b2-relation-full-lint1',
  'b2-relation-class-model-generate1', 'b2-relation-class-model-generate2',
  'b2-relation-contract-query-postgen', 'b2-relation-full-rules1', 'b2-relation-full-build1',
  'b2-relation-label-eslint-final1', 'b2-relation-spa-root-audit',
]) files.push(prefix + '.log', prefix + '.exit')
if (new Set(files).size !== files.length) throw new Error('Duplicate evidence path')
const secretKeys = /^(authorization|cookie|password|accessToken|refreshToken|lingma_sys_key)$/i
function checkJson(value, trail) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (secretKeys.test(key) && child !== null && child !== undefined && child !== '' && child !== '[redacted]') {
      throw new Error(`Sensitive value needs review at ${trail}.${key}`)
    }
    checkJson(child, trail + '.' + key)
  }
}
for (const file of files) {
  await access(path.join(cache, file))
  if (file.endsWith('.json')) checkJson(JSON.parse(await readFile(path.join(cache, file), 'utf8')), file)
}
await mkdir(target)
const entries = []
for (const name of files) {
  const artifactName = name === 'b2-verify-architecture-features-path-final-report.md'
    ? 'b2-architecture-preserved-path-review.md' : name
  const source = path.join(cache, name)
  const original = await readFile(source)
  const bytes = /\.(md|mjs)$/.test(name)
    ? Buffer.from(original.toString('utf8').replace(/(?:\r?\n){2,}$/, '\n')) : original
  await writeFile(path.join(target, artifactName), bytes, {flag: 'wx'})
  entries.push({name: artifactName, ...(artifactName !== name ? {sourceName: name} : {}),
    ...(!bytes.equals(original) ? {normalizedDocumentEof: true, sourceSha256: createHash('sha256').update(original).digest('hex')} : {}),
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')})
}
const sourcePaths = execFileSync('git', ['-c', 'core.safecrlf=false', 'diff', '--name-only'], {encoding: 'utf8'})
  .trim().split('\n').filter(name => /^(src\/|packages\/|tests\/|tools\/|config\/)/.test(name))
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {encoding: 'utf8'})
  .trim().split('\n').filter(name => /^(src\/|tests\/)/.test(name))
const sourceSnapshot = []
for (const name of [...new Set([...sourcePaths, ...untracked])].sort()) {
  try {const bytes = await readFile(name); sourceSnapshot.push({name, sha256: createHash('sha256').update(bytes).digest('hex')})}
  catch (error) {if (error.code !== 'ENOENT') throw error; sourceSnapshot.push({name, deleted: true})}
}
await writeFile(path.join(target, 'manifest.json'), JSON.stringify({
  parentCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  createdAt: new Date().toISOString(),
  scope: 'B2 directory plus relationship batch; complete integration remains active in the unique ledger',
  sourceSnapshot, files: entries,
}, null, 2) + '\n', {flag: 'wx'})
console.log(JSON.stringify({target, files: entries.length, sourceSnapshot: sourceSnapshot.length,
  bytes: entries.reduce((total, entry) => total + entry.bytes, 0)}))
