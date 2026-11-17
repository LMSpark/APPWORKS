import {expect,it} from 'vitest'
import {prepareCheckedAdoption} from '@/services/smart-bid/content/adoption/adoption-preflight'

const selection={projectId:'P',candidateRevisionId:'T',expectedHead:'H',previewRef:'PV',nodeIds:['N'],responseRefs:[],selectedParts:[]}
const check={owner:'招标来源',scopeRef:'P',scopeVersion:'01',recordRefs:['原件']}
const preview={selection,stageRef:{id:'ST',version:'01'},baselineId:'B',basisChecks:[check]}
const current={projectId:'P',headRevisionId:'H',stageRef:{version:'01',id:'ST'},baselineId:'B',basisChecks:[check]}
const request={...selection,requestKey:'K',decisionTraceRef:'D',reason:'核准'}
it('reports new basis versions even with the same current head',async()=>{
 const changed={...current,basisChecks:[{...check,scopeVersion:'02'}]}
 expect(await prepareCheckedAdoption({request,preview,current:changed})).toMatchObject({
  status:'REPREVIEW_REQUIRED',reasons:['BASIS_CHECKS_CHANGED'],basisIssues:[{code:'SCOPE_VERSION_CHANGED'}],
 })
})
it('detects independently changed head, stage and baseline',async()=>{
 const changed={...current,headRevisionId:'H2',stageRef:{id:'ST',version:'02'},baselineId:'B2'}
 expect(await prepareCheckedAdoption({request,preview,current:changed})).toMatchObject({
  status:'REPREVIEW_REQUIRED',reasons:['HEAD_CHANGED','STAGE_CHANGED','BASELINE_CHANGED'],
 })
})
it('prepares a matching request while preserving the atomic execution requirement',async()=>{
 const result=await prepareCheckedAdoption({request,preview,current})
 expect(result).toMatchObject({status:'PREPARED',request:{requestKey:'K',previewRef:'PV'},requiresAtomicCommitChecks:true})
 await expect(prepareCheckedAdoption({request:{...request,nodeIds:['OTHER']},preview,current})).rejects.toThrow('ADOPTION_PREVIEW_SCOPE_MISMATCH')
})
