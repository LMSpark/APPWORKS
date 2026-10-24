import {readFile, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const cache = 'node_modules/.cache/metadata-integration-20261024/'
const expected = {
  'packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts': '6b6f940bdb71e8e18b4f8521b75f1cc9484277b84e916c5a48d1d3af8a4c9b1f',
  'packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts': '4d814d27c9e5836fd6bbd29f4c4770f6807e3a2e05966de3a2f27001c98ccd9b',
}
for (const [path, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash)
const gates = ['b1-delete-context-green-domain-final', 'b1-delete-context-green-runtime-final', 'b1-delete-context-green-typecheck-final',
  'b1-delete-context-green-lint-final', 'b1-delete-formal-generation', 'b1-delete-full-lint', 'b1-delete-full-rules',
  'b1-delete-full-build', 'b1-delete-lowcode-contracts', 'b1-delete-contract-knowledge', 'b1-consumer-evidence-check']
for (const name of gates) assert.equal((await readFile(cache + name + '.exit', 'utf8')).trim(), '0', name)
const changed = execFileSync('git', ['diff', '--name-only'], {encoding:'utf8'}).trim().split(/\r?\n/)
assert.ok(changed.every(p => p in expected || p.startsWith('generated/dts-class-model/') || p === 'notes/data-space-retirement-ledger.md'
  || p === 'backend-api-contracts/appworks-consumer-ledger.json'))
const generated = []
for (const path of changed.filter(p => p.startsWith('generated/dts-class-model/'))) {
  const old = execFileSync('git', ['show', `HEAD:${path}`], {encoding:'utf8'})
  const current = await readFile(path, 'utf8')
  const normalize = v => JSON.stringify(JSON.parse(v.replaceAll(/__@([a-zA-Z]+)@\d+/g, '__@$1@SYMBOL')))
  generated.push({path, onlyCompilerSymbolIds: normalize(old) === normalize(current)})
}
assert.equal(generated.filter(r => r.onlyCompilerSymbolIds).length, 12)
assert.equal(generated.length, 14)
await writeFile(cache + 'b1-delivery-audit.json', JSON.stringify({passed:true, sourceHashes:expected, gates, generated, noJavaOrCredentialPaths:true},null,2)+'\n')
console.log(JSON.stringify({passed:true, productAndTestFiles:2, gates:gates.length, generated:generated.length, generatedCompilerOnly:12}))
