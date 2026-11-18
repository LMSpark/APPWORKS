import {expect,it} from 'vitest'
import {hashRequirementBindings} from '@/services/smart-bid/content/hashes/requirement-binding-hash'

const pin={chapterId:'C',lineageId:'L',version:'002'}
const record={...pin,selectedVersion:'002',requirementContentHash:'a'.repeat(64)}

it('distinguishes same-version content changes, changed versions and missing baseline selections',async()=>{
 const hash=(row:typeof record|Omit<typeof record,'selectedVersion'>&{selectedVersion:null})=>hashRequirementBindings([pin],[row])
 const results=await Promise.all([
  hash(record),hash({...record,requirementContentHash:'b'.repeat(64)}),
  hash({...record,selectedVersion:'003'}),hash({...record,selectedVersion:null}),
 ])
 expect(new Set(results).size).toBe(4)
})

it('requires exactly every scoped pin even when requirements share a lineage across chapters',async()=>{
 const other={...pin,chapterId:'D'},otherRecord={...record,...other}
 expect(await hashRequirementBindings([other,pin],[record,otherRecord])).toBe(
  await hashRequirementBindings([pin,other],[otherRecord,record]))
 await expect(hashRequirementBindings([pin,other],[record])).rejects.toThrow('CONTENT_REQUIREMENT_BINDING_SCOPE')
 await expect(hashRequirementBindings([pin],[record,otherRecord])).rejects.toThrow('CONTENT_REQUIREMENT_BINDING_SCOPE')
})
