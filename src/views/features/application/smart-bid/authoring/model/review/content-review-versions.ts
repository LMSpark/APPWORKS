/**
 * @module app:views/features/application/smart-bid/authoring/model/review/content-review-versions
 * 职责：为本轮固定审定清单绑定逐件实件及逐栏拟填版本的原读取证明。
 * 边界：旧实件沿用决定由审定清单负责；字段必须来自当前修订的已采用答复。
 */
import type {readContentReviewCoverage} from './content-review-coverage-reader'
import type {readProducedFileReviewVersion} from './content-produced-file-review'
import type {readPlatformFieldReviewVersion} from './content-platform-field-review'

type CoverageSelection=Parameters<typeof readContentReviewCoverage>[0]
type ReviewTarget=Omit<CoverageSelection['targets'][number],'versionHash'>
type ReviewVersion=Readonly<{kind:'FILE';source:Awaited<ReturnType<typeof readProducedFileReviewVersion>>}>|
 Readonly<{kind:'FIELD';source:Awaited<ReturnType<typeof readPlatformFieldReviewVersion>>}>
const key=(kind:string,targetId:string)=>JSON.stringify([kind,targetId])

/** 拟填栏和文件分别保持原身份，即便两个来源恰好同名。 */
export function bindReviewVersions(selection:Omit<CoverageSelection,'targets'>&Readonly<{targets:readonly ReviewTarget[]}>,
 versions:readonly ReviewVersion[]):CoverageSelection{
 selection.assertCurrent()
 const {projectId,revisionId}=selection
 const proofs=[...versions],byTarget=new Map<string,ReviewVersion>()
 for(const version of proofs){
  const {source}=version
  source.assertCurrent()
  if(source.projectId!==projectId||version.kind==='FIELD'&&source.revisionId!==revisionId)throw Error('CONTENT_REVIEW_VERSION_SCOPE')
  const targetId=version.kind==='FILE'?version.source.producedFileId:version.source.fieldId
  const id=key(version.kind,targetId)
  if(byTarget.has(id))throw Error('CONTENT_REVIEW_VERSION_SCOPE')
  byTarget.set(id,version)
 }
 const targets=selection.targets.map(target=>{
  const id=key(target.kind,target.targetId),version=byTarget.get(id)
  if(!version)throw Error('CONTENT_REVIEW_VERSION_SCOPE')
  byTarget.delete(id)
  return Object.freeze({...target,requiredUseIds:Object.freeze([...target.requiredUseIds]),versionHash:version.source.versionHash})
 })
 if(byTarget.size)throw Error('CONTENT_REVIEW_VERSION_SCOPE')
 const assertCurrent=()=>{
  selection.assertCurrent()
  for(const version of proofs)version.source.assertCurrent()
 }
 assertCurrent()
 return Object.freeze({projectId,revisionId,targets:Object.freeze(targets),assertCurrent})
}
