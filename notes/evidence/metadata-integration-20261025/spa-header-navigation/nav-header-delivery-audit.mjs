// Delivery evidence audit. Reads existing results; no service calls or product writes.
import {readFileSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
const cache='node_modules/.cache/metadata-integration-20261024/'
const gates=['nav-header-root-final-tests','nav-header-root-typecheck','nav-header-root-lint','nav-header-generate','nav-header-rules','nav-header-build','nav-header-generated-audit']
for(const gate of gates) assert.equal(readFileSync(cache+gate+'.exit','utf8').trim(),'0',gate)
const hashes={
  'src/layout/AppHeader.vue':'5888AA244F79DFB7062D5AC368F59AE40AF0613F914A4A8843EB4244E4A08143',
  'src/layout/NavHeaderBar.vue':'141E12C410FF7FA4E3C2D86DB9B0CD6DC7B6F366659F3679CE82ECDEA8592C5B',
  'tests/ui/component/nav-header-bar.test.ts':'CAEAFE9F97FDCECEE1D642D3267C6BB4E564001AE932FFDC613F8DC9001427E4',
}
for(const [path,hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase(),hash,path)
const smoke=JSON.parse(readFileSync(cache+'nav-header-spa-evidence.json','utf8'))
for(const label of ['1280-more-all-entries','1024-more-all-entries','2300-all-14-inline','1280-restored-dictionary-active']) {
  const step=smoke.steps.find(x=>x.label===label)
  assert(step,label)
  assert.equal(step.entries.length,14,label)
  assert.equal(step.boxes['.spark-layout__header'].height,48,label)
  assert(step.entries.every(e=>e.centerHits && e.x>=0 && e.y>=0 && e.x+e.width<=step.viewport.width && e.y+e.height<=step.viewport.height),label)
}
const final=smoke.steps.find(x=>x.label==='1280-restored-dictionary-active')
assert.deepEqual(final.entries.filter(e=>e.active).map(e=>e.text),['结构化配置'])
assert.equal(final.entries.find(e=>e.active).fontWeight,'600')
assert(final.entries.every(e=>e.ariaCurrent===null))
assert.equal(smoke.steps.find(x=>x.label==='2300-all-14-inline').boxes['.el-sub-menu__hide-arrow'],null)
assert.equal(smoke.network.truncated,false)
const requests=smoke.network.events.filter(e=>e.event==='Network.requestWillBeSent')
assert.equal(requests.length,1)
assert(requests.every(e=>e.url==='/api/DataOperation/GetData' && e.type!=='Document'))
assert.deepEqual(smoke.network.readbacks,[{requestId:'2180.9846',httpStatus:200,Code:200,Count:353,items:20}])
const result={gates,sourceHashes:hashes,layoutSteps:4,entriesPerStep:14,headerHeight:48,finalViewport:final.viewport,networkQueryCount:1,networkDocumentCount:0,networkNonQueryCount:0,dictionaryCount:353,limitations:smoke.limitations}
writeFileSync(cache+'nav-header-delivery-audit.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
