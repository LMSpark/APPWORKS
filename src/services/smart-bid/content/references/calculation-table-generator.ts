/**
 * @module app:services/smart-bid/content/references/calculation-table-generator
 * 职责：按固定模板类解析计算表的显式生成器键。
 * 边界：调用方负责提供节点所属逻辑册的原模板类；生成器版本与可用性由注册表核验。
 */
import {readContentNodeLinks} from '../content-node-links'
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from './snapshot-reference-values'

/** 普通表没有生成器，空表必须恰好有一个可用表类显式声明生成器。 */
export function resolveCalculationTableGenerator(value:unknown,templateClasses:unknown):string|null {
 const error='CONTENT_TABLE_GENERATOR_CLASS'
 const {requiresTableGeneratorCheck}=readContentNodeLinks(value)
 const node=snapshotReferenceRecord(value,error)
 if(node['type']!=='table')throw Error(error)
 const selected=new Set<string>()
 visitSnapshotReferences(node['class'],name=>{
  if(!snapshotReferenceIdentity(name)||selected.has(name))throw Error(error)
  selected.add(name)
 },error)
 const byName=new Map<string,Record<string,unknown>>()
 visitSnapshotReferences(templateClasses,item=>{
  const definition=snapshotReferenceRecord(item,error),name=definition['name']
  if(!snapshotReferenceIdentity(name)||byName.has(name))throw Error(error)
  byName.set(name,definition)
 },error)
 const generators:string[]=[]
 for(const name of selected){
  const definition=byName.get(name)
  if(!definition||!Array.isArray(definition['elements'])||!definition['elements'].includes('table'))throw Error(error)
  if(!Object.hasOwn(definition,'generatorKey'))continue
  const key=definition['generatorKey']
  if(!snapshotReferenceIdentity(key))throw Error(error)
  generators.push(key)
 }
 if(requiresTableGeneratorCheck){
  const [key]=generators
  if(key===undefined||generators.length!==1)throw Error(error)
  return key
 }
 if(generators.length)throw Error(error)
 return null
}
