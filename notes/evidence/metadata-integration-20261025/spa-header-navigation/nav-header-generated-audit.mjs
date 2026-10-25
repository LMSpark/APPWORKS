// Read-only audit of formal generator output; does not edit generated artifacts.
import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const files = execFileSync('git', ['diff', '--name-only', '--', 'generated/dts-class-model'], {encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean)
const normalize = text => text.replace(/__@([A-Za-z]+)@\d+/g, '__@$1@SYMBOL_ID')
function changes(a,b,path='') {
  if (JSON.stringify(a)===JSON.stringify(b)) return []
  if (!a || !b || typeof a!=='object' || typeof b!=='object') return [path]
  return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>changes(a[key],b[key],`${path}/${key}`))
}
const audit = files.map(file => {
  const before=execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8',maxBuffer:50_000_000})
  const after=readFileSync(file,'utf8')
  const paths=changes(JSON.parse(normalize(before)),JSON.parse(normalize(after)))
  const onlySymbols=paths.length===0
  if(!onlySymbols) assert(paths.every(path=>/\/(generatedAt|sourceModifiedAt|jsdoc)$/.test(path)),`${file}: unexpected changes ${paths}`)
  return {file,onlyCompilerSymbolIds:onlySymbols,otherChangedPaths:paths}
})
assert.equal(audit.length,16)
assert.equal(audit.filter(x=>x.onlyCompilerSymbolIds).length,12)
const result={files:audit.length,onlyCompilerSymbolIdFiles:12,audit}
writeFileSync('node_modules/.cache/metadata-integration-20261024/nav-header-generated-audit.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
