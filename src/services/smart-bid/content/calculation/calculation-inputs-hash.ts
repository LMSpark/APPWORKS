/**
 * @module app:services/smart-bid/content/calculation/calculation-inputs-hash
 * 职责：固定计算表生成器和已核业务输入，形成单表及审核范围摘要。
 * 边界：原表、填写说明、响应核定和版本归属由输入来源核验；不展开、回填或固化生成结果。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from '../references/snapshot-reference-values'

const groupFields=['formInstructionRefs','requirementVersions','confirmedResponses','factVersions','resourceVersions'] as const
const tableFields=['nodeId','generatorVersion',...groupFields] as const
const error='CONTENT_CALCULATION_INPUT_MODEL'

/** 同一次已验证展开的单表输入摘要聚合，拒绝缺表和重复表。 */
export async function hashCalculationInputSet(expectedNodeIds:readonly string[],tables:ReadonlyArray<Readonly<{nodeId:string;inputHash:string}>>){
 const expected=new Set(expectedNodeIds),seen=new Set<string>()
 if(expected.size!==expectedNodeIds.length||tables.length!==expected.size)throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
 for(const {nodeId,inputHash} of tables){
  if(!expected.has(nodeId)||seen.has(nodeId)||!/^[a-f0-9]{64}$/u.test(inputHash))throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
  seen.add(nodeId)
 }
 const ordered=tables.map(({nodeId,inputHash})=>({nodeId,inputHash})).sort((a,b)=>a.nodeId<b.nodeId?-1:a.nodeId>b.nodeId?1:0)
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.calculation-inputs/1',ordered]))
}

/** 输入组保留已核引用及响应声明；各组的顺序由正式来源确定。 */
export async function hashCalculationInputs(input:Readonly<{
 expectedNodeIds:readonly string[];tables:unknown;generatorVersions?:ReadonlyMap<string,string>
}>){
 const expected=new Set(input.expectedNodeIds)
 if(expected.size!==input.expectedNodeIds.length||![...expected].every(snapshotReferenceIdentity))
  throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
 const seen=new Set<string>(),tables:Array<{nodeId:string;encoded:string}>=[]
 visitSnapshotReferences(input.tables,value=>{
  const row=snapshotReferenceFields(value,tableFields,error),{nodeId,generatorVersion}=row
  if(!snapshotReferenceIdentity(nodeId)||!snapshotReferenceIdentity(generatorVersion))throw Error(error)
  if(!expected.has(nodeId)||seen.has(nodeId))throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
  if(input.generatorVersions&&input.generatorVersions.get(nodeId)!==generatorVersion)
   throw Error('CONTENT_CALCULATION_GENERATOR_VERSION')
  seen.add(nodeId)
  const groups=groupFields.map(field=>{
   const records:unknown[]=[]
   visitSnapshotReferences(row[field],record=>records.push(record),error)
   return records
  })
  tables.push({nodeId,encoded:canonicalSnapshotValue(['spark-bid.calculation-table-input/1',generatorVersion,groups])})
 },error)
 if(seen.size!==expected.size)throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
 tables.sort((left,right)=>left.nodeId<right.nodeId?-1:left.nodeId>right.nodeId?1:0)
 const hashes=await Promise.all(tables.map(async({nodeId,encoded})=>Object.freeze({
  nodeId,inputHash:await hashCanonicalSnapshotText(encoded),
 })))
 const calculationInputsHash=await hashCalculationInputSet(input.expectedNodeIds,hashes)
 return Object.freeze({calculationInputsHash,tables:Object.freeze(hashes)})
}
