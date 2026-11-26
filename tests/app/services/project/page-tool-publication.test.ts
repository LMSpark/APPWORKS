import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  createPageToolPublicationManifest,
  createPageToolDatasetPublicationManifest,
  parsePageToolPublicationManifest,
  withPageToolPublication,
} from '@/services/project/page-tool-publication'

const owner = ['enterprise', 'tenant', 'actor', 'app', 'node']
const call = 'a'.repeat(64), digest = 'b'.repeat(64)

async function sha256(text:string):Promise<string>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
 return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('')
}

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
})

describe('browser publication recovery', () => {
  it('builds and verifies a four-file manifest with pagedata snapshots', async () => {
    const manifest = await createPageToolPublicationManifest({
      pageId: 'orders-page',
      files: [
        {fileName:'rule.json', version:4, text:'[]'},
        {fileName:'script.js', version:5, text:'export default {}'},
        {fileName:'style.css', version:6, text:'.root{}'},
      ],
      pagedata: [{scenarioId:'orders', version:7, sourceRevision:'3', text:'{"scenarioId":"orders","tables":{}}'}],
    })
    const text = JSON.stringify(manifest)
    await expect(parsePageToolPublicationManifest(text)).resolves.toMatchObject({
      pageId:'orders-page',
      scenarioIds:['orders'],
      files:[{fileName:'rule.json',version:4},{fileName:'script.js',version:5},{fileName:'style.css',version:6}],
      pagedata:[{scenarioId:'orders',version:7,fileName:'7__pagedata.json',sourceRevision:'3'}],
    })
    const tampered=structuredClone(JSON.parse(text)) as {pagedata:Array<{text:string}>}
    tampered.pagedata[0]!.text='tampered'
    await expect(parsePageToolPublicationManifest(JSON.stringify(tampered))).rejects.toThrow('sha256')
  })

  it('parses an independent Dataset Plan proof without pagedata compatibility', async () => {
    const plan=JSON.stringify({
      schemaVersion:1,kind:'spark.runtimeDataSetPlan',scenarioId:'orders',name:'Orders',description:'',type:'数据源',
      savedAt:'2026-11-23T00:00:00.000Z',contentHash:'fnv1a:12345678',
      source:{dataSetId:'orders',exportedFrom:'data-space-design',graphFile:'orders.json'},
      inputParams:[],models:[],modelFields:[],views:[],viewFields:[],relations:[],linkage:{edges:[]},
    })
    const manifest=await createPageToolDatasetPublicationManifest({
      pageId:'orders-page',
      files:[
        {fileName:'rule.json',version:1,text:'[]'},
        {fileName:'script.js',version:1,text:''},
        {fileName:'style.css',version:1,text:''},
      ],
      dataset:[{scenarioId:'orders',sourceRevision:'fnv1a:12345678',text:plan}],
    })
    await expect(parsePageToolPublicationManifest(JSON.stringify(manifest))).resolves.toMatchObject({
      schemaVersion:2,dataset:[{scenarioId:'orders',fileName:'orders.dataset.json'}],
    })
    await expect(parsePageToolPublicationManifest(JSON.stringify({...manifest,pagedata:[]}))).rejects.toThrow('Dataset proof')
  })

  it('refuses a node held by another tab without opening its journal', async () => {
    const run = vi.fn(async () => {})
    const request = vi.fn(async (_name: string, _options: LockOptions, enter: LockGrantedCallback<void>) => enter(null))
    vi.stubGlobal('navigator', {locks: {request}})
    await expect(withPageToolPublication(owner, run)).rejects.toThrow('另一标签页')
    expect(request).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('keeps a legacy confirmation without an original receipt source pending across workspace reopen', async () => {
    await withPageToolPublication(owner, async journal => {
      const intent = journal.open(call, digest, '')
      intent.snapshots = {'rule.json': {state:'confirmed',version:1}, 'script.js': {state:'confirmed',version:2}, 'style.css': {state:'confirmed',version:3}}
      intent.pointer = {state:'confirmed', value:'r=1;s=2;t=3'}
      journal.write(intent)
    })
    const key = sessionStorage.key(0)!
    const original = sessionStorage.getItem(key)
    await expect(withPageToolPublication(owner, async journal => {
      journal.confirmedPointer(call)
    })).rejects.toThrow('缺少原保存回执来源')
    await expect(withPageToolPublication(owner, async journal => {
      journal.open(call, digest, '')
    })).rejects.toThrow('请先核验原发布指针')
    expect(sessionStorage.getItem(key)).toBe(original)
  })

  it('reopens a pointer with an original-save receipt only for the original call', async () => {
    await withPageToolPublication(owner, async journal => {
      const intent = journal.open(call, digest, '')
      intent.snapshots = {'rule.json': {state:'confirmed',version:1}, 'script.js': {state:'confirmed',version:2}, 'style.css': {state:'confirmed',version:3}}
      intent.pointer = {state:'confirmed', value:'r=1;s=2;t=3', receiptSource:'original-save'}
      journal.write(intent)
    })
    await withPageToolPublication(owner, async journal => {
      expect(journal.confirmedPointer(call)).toBe('r=1;s=2;t=3')
      expect(() => journal.confirmedPointer('c'.repeat(64))).toThrow('所属调用已变化')
    })
  })

  it('keeps the original actor’s pending pointer isolated across workspace instances', async () => {
    const request = vi.fn(async (name: string, _options: LockOptions, enter: LockGrantedCallback<void>) => enter({name, mode: 'exclusive'}))
    vi.stubGlobal('navigator', {locks: {request}})
    await withPageToolPublication(owner, async journal => {
      const intent = journal.open(call, digest, '')
      intent.snapshots = {'rule.json': {state:'confirmed',version:1}, 'script.js': {state:'confirmed',version:2}, 'style.css': {state:'confirmed',version:3}}
      intent.pointer = {state:'pending', value:'r=1;s=2;t=3'}
      journal.write(intent)
    })
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
    await withPageToolPublication(['enterprise','tenant','other','app','node'], async journal => {
      expect(journal.confirmedPointer(call)).toBeUndefined()
    })
    await expect(withPageToolPublication(owner, async journal => { journal.confirmedPointer(call) })).rejects.toThrow('尚无权威回执')
    expect(request).toHaveBeenCalledTimes(3)
  })
})
