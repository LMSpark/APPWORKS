import {readFile, copyFile, writeFile, access, readdir} from 'node:fs/promises'
import {constants} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root = process.cwd()
const cache = path.join(root, 'node_modules/.cache/metadata-integration-20261024')
const target = path.join(root, 'notes/evidence/metadata-integration-20261025/b1-business-select-reference')
const files = [
  'b1-select-network-observer.mjs', 'b1-business-select-network.json', 'b1-business-select-identities.json',
  'b1-business-select-audit.mjs', 'b1-business-select-audit.json', 'b1-business-select-audit.log',
  'b1-business-select-smoke-brief.md', 'b1-business-select-independent-review.md',
  'b1-select-options.png', 'b1-select-draft.png', 'b1-select-reopened-empty.png', 'b1-select-nav-clipped.png',
  'b1-global-reference-contract-followup.md', 'b1-reference-source-hashes.json',
  'b1-reference-probe-preflight.md', 'b1-reference-probe-readonly.mjs',
  'b1-reference-probe-guard.mjs', 'b1-reference-probe-guard-self-test.mjs', 'b1-reference-probe-binding-self-test.mjs',
  'b1-reference-probe-initial.mjs', 'b1-reference-probe-initial-preflight.md',
  'b1-reference-probe-auth-check.mjs', 'b1-reference-probe-before-filter.mjs',
  'b1-reference-probe-readonly-failure.json', 'b1-reference-probe-readonly-retry-failure.json',
  'b1-reference-probe-readonly-selection-failure.json',
  'b1-reference-probe-live.log', 'b1-reference-probe-live.exit',
  'b1-reference-probe-live-retry.log', 'b1-reference-probe-live-retry.exit',
  'b1-reference-probe-live-selection.log', 'b1-reference-probe-live-selection.exit',
  'b1-reference-probe-live-binding.log', 'b1-reference-probe-live-binding.exit',
  'b1-reference-binding-check.log', 'b1-reference-binding-check.exit',
  'b1-reference-probe-independent-review.md', 'b1-select-reference-archive.mjs',
]
const outcomes = []
for (const name of ['b1-reference-probe-readonly-result.json','b1-reference-probe-readonly-binding-failure.json']) {
  try {await access(path.join(cache,name)); outcomes.push(name)} catch {}
}
if (outcomes.length !== 1) throw new Error('One frozen probe outcome required')
files.push(...outcomes)
for (const name of files) await access(path.join(cache,name))
for (const name of files) await copyFile(path.join(cache,name),path.join(target,name),constants.COPYFILE_EXCL)
const entries = []
for (const name of (await readdir(target)).sort()) {
  if (name === 'manifest.json') throw new Error('Archive manifest already exists')
  const bytes = await readFile(path.join(target,name))
  entries.push({name, bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')})
}
await writeFile(path.join(target,'manifest.json'), JSON.stringify({sourceHead:'a176ae2f56ccd507f34d7e36d4489bba28422c94',
  createdAt:new Date().toISOString(), scope:'B1 existing business select SPA and readonly reference probe; no product change',
  files:entries},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({copied:files.length,manifestEntries:entries.length,totalFiles:entries.length+1}))
