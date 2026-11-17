import {expect,it} from 'vitest'
import {hashContentRootSections} from '@/services/smart-bid/content/hashes/content-root-sections'

const pin={chapterId:'C',lineageId:'L',version:'002'}
const assignment={id:'A',answerLocation:{kind:'PLATFORM_FIELD',field:'投标承诺'}}
const response={id:'R',assignmentId:'A',lineageId:'L',version:'002',statement:'原答复',data:{},promiseRefs:['P1']}
const manifest={hashContract:'spark-bid.revision-snapshot/1',projectId:'P',baselineId:'B',stageRef:'S',
 nodes:[],templateRefs:[],requirementPins:[pin],responseAssignments:[assignment],responses:[response],qualificationReviews:[],sensitiveRefs:[]}
it('captures both scope and original response value while preserving independent digests',async()=>{
 const original=await hashContentRootSections(manifest)
 const changedPin=await hashContentRootSections({...manifest,requirementPins:[{...pin,version:'003'}]})
 expect(changedPin.requirementPinHash).not.toBe(original.requirementPinHash)
 expect(changedPin.responseSetHash).toBe(original.responseSetHash)
 for(const changed of [
  {...manifest,responseAssignments:[{...assignment,answerLocation:{kind:'PLATFORM_FIELD',field:'另一个栏目'}}]},
  {...manifest,responses:[{...response,statement:'改答复'}]},
  {...manifest,responses:[{...response,promiseRefs:['P2']}]},
 ])expect((await hashContentRootSections(changed)).responseSetHash).not.toBe(original.responseSetHash)
})
it('uses stable order and rejects missing or ambiguous response assignments',async()=>{
 const extraPin={...pin,chapterId:'C2'}
 const extraAssignment={...assignment,id:'A2'}
 const extraResponse={...response,id:'R2',assignmentId:'A2'}
 const first={...manifest,requirementPins:[pin,extraPin],responseAssignments:[assignment,extraAssignment],responses:[response,extraResponse]}
 const second={...first,requirementPins:[extraPin,pin],responseAssignments:[extraAssignment,assignment],responses:[extraResponse,response]}
 expect(await hashContentRootSections(second)).toEqual(await hashContentRootSections(first))
 await expect(hashContentRootSections({...manifest,responseAssignments:[]})).rejects.toThrow('CONTENT_ROOT_RESPONSE_ASSIGNMENT')
 await expect(hashContentRootSections({...manifest,responseAssignments:[assignment,assignment]})).rejects.toThrow('CONTENT_ROOT_SECTION_DUPLICATE')
})
