import {expect,it} from 'vitest'
import {hashRevisionContentRoot} from '@/services/smart-bid/content/hashes/revision-content-root'

const stageRef={id:'ST',version:'01'}
const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:'P',baselineId:'B',stageRef,
 nodes:[],templateRefs:[],requirementPins:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]}
const baseline={id:'B',projectId:'P',stageRef,factVersions:[{factId:'PRICE',version:2},{factId:'DAYS',version:1}]}
it('combines the fixed baseline fact versions with the same revision snapshot',async()=>{
 const original=await hashRevisionContentRoot({manifest,baseline})
 expect(original).toMatch(/^[a-f0-9]{64}$/u)
 expect(await hashRevisionContentRoot({manifest,baseline:{...baseline,factVersions:[...baseline.factVersions].reverse()}})).toBe(original)
 expect(await hashRevisionContentRoot({manifest,baseline:{...baseline,factVersions:[{factId:'PRICE',version:3},{factId:'DAYS',version:1}]}}))
  .not.toBe(original)
})
it('refuses a different project, baseline or stage even when membership is identical',async()=>{
 for(const changed of [{id:'B2'},{projectId:'OTHER'},{stageRef:{...stageRef,version:'02'}}])
  await expect(hashRevisionContentRoot({manifest,baseline:{...baseline,...changed}})).rejects.toThrow('CONTENT_ROOT_BASELINE_MISMATCH')
 await expect(hashRevisionContentRoot({manifest,baseline:{...baseline,factVersions:undefined}})).rejects.toThrow('BASELINE_FACT_MEMBER_MODEL')
})
