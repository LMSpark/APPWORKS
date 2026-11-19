import {beforeEach,describe,expect,it,vi} from 'vitest'
import {invalidateRuntimeFile,readRuntimeFile} from '@/lowcode/runtime-file-cache'

const locator={appType:'designfile',customPath:'APP-A/page',fileName:'rule.json'} as const

describe('runtime file cache',()=>{
 beforeEach(()=>{
   localStorage.clear()
 })

 it('always checks version but reads content only when the file changes',async()=>{
   const readVersion=vi.fn()
    .mockResolvedValueOnce('2026-11-19 13:20:30 001')
    .mockResolvedValueOnce('2026-11-19 13:20:30 001')
    .mockResolvedValueOnce('2026-11-19 13:20:31 001')
   const readText=vi.fn()
    .mockResolvedValueOnce('first')
    .mockResolvedValueOnce('second')
   const options={owner:'enterprise:user:APP-A',locator,assertCurrent:()=>{},readVersion,readText}
   await expect(readRuntimeFile(options)).resolves.toBe('first')
   await expect(readRuntimeFile(options)).resolves.toBe('first')
   await expect(readRuntimeFile(options)).resolves.toBe('second')
   expect(readVersion).toHaveBeenCalledTimes(3)
   expect(readText).toHaveBeenCalledTimes(2)
 })

 it('does not cache a response after its execution scope becomes stale',async()=>{
   let current=true
   const assertCurrent=vi.fn(()=>{if(!current)throw Error('STALE')})
   const readText=vi.fn(async()=>{current=false;return 'late'})
   await expect(readRuntimeFile({
     owner:'enterprise:user:APP-B',locator,assertCurrent,
     readVersion:async()=>'2026-11-19 13:20:30 001',readText,
   })).rejects.toThrow('STALE')
   current=true
   const freshRead=vi.fn(async()=>'fresh')
   await expect(readRuntimeFile({
     owner:'enterprise:user:APP-B',locator,assertCurrent,
     readVersion:async()=>'2026-11-19 13:20:30 001',readText:freshRead,
   })).resolves.toBe('fresh')
   expect(freshRead).toHaveBeenCalledOnce()
 })

 it('invalidates one scoped file without affecting another',async()=>{
   const readText=vi.fn(async()=>'rule')
   const input={owner:'enterprise:user:APP-C',locator,assertCurrent:()=>{},
     readVersion:async()=>'2026-11-19 13:20:30 001',readText}
   await readRuntimeFile(input)
   invalidateRuntimeFile(input.owner,locator)
   await readRuntimeFile(input)
   expect(readText).toHaveBeenCalledTimes(2)
 })

 it('does not share cache entries across design, preview and published scopes',async()=>{
   const readText=vi.fn(async()=>`text:${readText.mock.calls.length}`)
   const readVersion=async()=>'same-version'
   const common={owner:'enterprise:user:APP-MODES',locator,assertCurrent:()=>{},readVersion,readText}
   await expect(readRuntimeFile({...common,scope:{
     mode:'design',sourceRevision:'working',publicationRef:null,
   }})).resolves.toBe('text:1')
   await expect(readRuntimeFile({...common,scope:{
     mode:'preview',sourceRevision:'preview:draft-a',publicationRef:null,
   }})).resolves.toBe('text:2')
   await expect(readRuntimeFile({...common,scope:{
     mode:'published',sourceRevision:'manifest-a',publicationRef:'manifest=7',
   }})).resolves.toBe('text:3')
   await expect(readRuntimeFile({...common,scope:{
     mode:'published',sourceRevision:'manifest-a',publicationRef:'manifest=8',
   }})).resolves.toBe('text:4')
   await expect(readRuntimeFile({...common,scope:{
     mode:'published',sourceRevision:'manifest-a',publicationRef:'manifest=7',
   }})).resolves.toBe('text:3')
   expect(readText).toHaveBeenCalledTimes(4)
 })

 it('refreshes only the changed member of a four-file page',async()=>{
   const files=[
     {...locator,fileName:'rule.json'},
     {...locator,fileName:'script.js'},
     {...locator,fileName:'style.css'},
     {...locator,customPath:'APP-A/SysForm/SPACE',fileName:'pagedata.json'},
   ] as const
   type FileName=typeof files[number]['fileName']
   const versions=new Map(files.map(file=>[file.fileName,'v1']))
   const readText=vi.fn(async(locatorKey:FileName)=>`${locatorKey}:content:${versions.get(locatorKey)}`)
   const reads=()=>Promise.all(files.map(file=>readRuntimeFile({
     owner:'enterprise:user:APP-A',locator:file,assertCurrent:()=>{},
     readVersion:async()=>versions.get(file.fileName)??'',
     readText:()=>readText(file.fileName),
   })))
   await reads()
   versions.set('script.js','v2')
   await reads()
   expect(readText.mock.calls.map(([fileName])=>fileName)).toEqual([
     'rule.json','script.js','style.css','pagedata.json','script.js',
   ])
 })
})
