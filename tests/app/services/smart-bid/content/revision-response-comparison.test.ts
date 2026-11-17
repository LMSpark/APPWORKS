import {expect,it} from 'vitest'
import {compareRevisionResponses} from '@/services/smart-bid/content/revision-response-comparison'

const response={id:'R1',assignmentId:'A',revisionId:'B',lineageId:'L',version:'01',statement:'原响应',data:{}}
const manifest=(responses:unknown[])=>({hashContract:'spark-bid.revision-snapshot/1',projectId:'P',baselineId:'B',stageRef:'ST',
 templateRefs:[],nodes:[],requirementPins:[],responseAssignments:[],responses,qualificationReviews:[],sensitiveRefs:[]})
it('pairs by assignment and detects content changes independently of revision identity',()=>{
 const current={...response,id:'R2',revisionId:'O',statement:'更新'}
 const candidate={...current,id:'R3',revisionId:'T'}
 expect(compareRevisionResponses(manifest([response]),manifest([current]),manifest([candidate]))).toEqual([
  {assignmentId:'A',basisResponseId:'R1',currentResponseId:'R2',candidateResponseId:'R3',delta:'SAME_CHANGE',requiresCurrentBasisChecks:true},
 ])
 expect(compareRevisionResponses(manifest([response]),manifest([current]),manifest([]))[0]?.delta).toBe('DIVERGED')
})
it('refuses an ambiguous assignment or a mutated immutable response ID',()=>{
 expect(()=>compareRevisionResponses(manifest([response]),manifest([response,{...response,id:'R2'}]),manifest([])))
  .toThrow('RESPONSE_COMPARISON_ASSIGNMENT_DUPLICATE')
 expect(()=>compareRevisionResponses(manifest([response]),manifest([response]),manifest([{...response,statement:'冲突'}])))
  .toThrow('RESPONSE_COMPARISON_ID_REUSE')
})
it('classifies additions, unchanged responses and unilateral deletions deterministically',()=>{
 const other={...response,id:'R2',assignmentId:'Z',revisionId:'O'}
 const added={...response,id:'R3',assignmentId:'C',revisionId:'T'}
 const unchanged={...response,id:'R4',assignmentId:'M'}
 const result=compareRevisionResponses(manifest([response,unchanged]),manifest([other,unchanged]),manifest([response,added,unchanged]))
 expect(result.map(({assignmentId,delta})=>[assignmentId,delta])).toEqual([
  ['A','CURRENT_ONLY'],['C','CANDIDATE_ONLY'],['M','UNCHANGED'],['Z','CURRENT_ONLY'],
 ])
})
it('rejects a manifest from a different project',()=>{
 expect(()=>compareRevisionResponses(manifest([]),manifest([]),{...manifest([]),projectId:'OTHER'}))
  .toThrow('RESPONSE_COMPARISON_PROJECT')
})
