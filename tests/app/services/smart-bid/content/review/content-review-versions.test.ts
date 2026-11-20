import {expect,it} from 'vitest'
import {bindReviewVersions} from '@/views/features/application/smart-bid/authoring/model/review/content-review-versions'
import {readContentReviewCoverage} from '@/views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader'

it('requires independently verified file and field versions for the original review targets',async()=>{
 let current=true
 const fields={projectId:'P',revisionId:'R',versionHash:'a'.repeat(64),assertCurrent:()=>{if(!current)throw Error('STALE')}}
 const file={kind:'FILE' as const,source:{...fields,revisionId:'OLD',producedFileId:'X',productionRequestRef:'REQ',documentId:'D'}}
 const field={kind:'FIELD' as const,source:{...fields,fieldId:'X',assignmentId:'A',responseId:'RES',fieldRuleRef:'RULE',approvalRef:'APP',valueHash:'e'.repeat(64)}}
 const target={targetId:'X',effectiveHash:'b'.repeat(64),requiredUseIds:[]}
 const scope={projectId:'P',revisionId:'R',targets:[{...target,kind:'FILE' as const},{...target,kind:'FIELD' as const}],assertCurrent:()=>{}}
 expect(()=>bindReviewVersions(scope,[file])).toThrow('CONTENT_REVIEW_VERSION_SCOPE')
 expect(()=>bindReviewVersions(scope,[file,{...field,source:{...field.source,revisionId:'OLD'}}])).toThrow('CONTENT_REVIEW_VERSION_SCOPE')
 const selection=bindReviewVersions(scope,[file,field])
 expect(selection.targets.map(({kind,versionHash})=>[kind,versionHash])).toEqual([['FILE',fields.versionHash],['FIELD',fields.versionHash]])
 const result=await readContentReviewCoverage(selection,[],async()=>({
  projectId:'P',revisionId:'R',completed:[],findings:[],assertCurrent:()=>{},
 }))
 expect(result.items.map(item=>item.state)).toEqual(['CHECK_REQUIRED','CHECK_REQUIRED'])
 current=false
 expect(()=>result.assertCurrent()).toThrow('STALE')
})
