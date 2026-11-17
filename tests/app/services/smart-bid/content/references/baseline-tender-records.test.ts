import {expect,it} from 'vitest'
import {assertBaselineTenderRecords} from '@/services/smart-bid/content/references/baseline-tender-records'

const ref={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
it('accepts distinct record identities without rewriting the original version',()=>{
 const entries=Object.freeze([Object.freeze(ref),Object.freeze({...ref,ordinal:1})])
 expect(()=>assertBaselineTenderRecords(entries)).not.toThrow()
 expect(entries[0]?.recordVersion).toBe('002')
})
it('rejects two versions of one record identity in a single baseline',()=>{
 expect(()=>assertBaselineTenderRecords([ref,{...ref,recordVersion:'003',recordHash:'b'.repeat(64)}]))
  .toThrow('BASELINE_TENDER_RECORD_DUPLICATE')
})
it.each([{runId:'RUN',type:'FORMAT',ordinal:0},{...ref,ordinal:-1},{...ref,recordHash:'unknown'},{...ref,payload:{}}])
 ('rejects incomplete or invalid source references %j',entry=>{
  expect(()=>assertBaselineTenderRecords([entry])).toThrow('BASELINE_TENDER_RECORD_MODEL')
 })
