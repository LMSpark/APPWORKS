/**
 * @module app:services/smart-bid/content/calculation-table-expansion
 * 职责：按已核输入运行固定生成器，校验展开后的正文表格和节点引用。
 * 边界：结果供呈现、计算读取和质检共用；不写回节点、草稿或事实。
 */
import {readContentNodeLinks,readExpandedContentTable} from './content-node-links'
import {snapshotReferenceFields,snapshotReferenceIdentity} from './references/snapshot-reference-values'

function freezeJson(value:unknown):void {
 if(typeof value!=='object'||value===null)return
 for(const child of Object.values(value))freezeJson(child)
 Object.freeze(value)
}

/** 整个调用使用同一个已核输入摘要，结果保留原定位及生成器版本。 */
export function expandCalculationTable(input:Readonly<{
 placeholder:unknown
 generatorKey:string
 generatorVersion:string
 inputHash:string
 nodeIds:ReadonlySet<string>
 assertCurrent:()=>void
 generate:()=>unknown
}>){
 const error='CONTENT_CALCULATION_EXPANSION'
 input.assertCurrent()
 const placeholder=snapshotReferenceFields(input.placeholder,['nodeId','parentId','index','type','class','value','data'],error)
 const nodeId=placeholder['nodeId']
 if(!snapshotReferenceIdentity(nodeId)||!input.nodeIds.has(nodeId)||!readContentNodeLinks(placeholder).requiresTableGeneratorCheck||
  !snapshotReferenceIdentity(input.generatorKey)||!snapshotReferenceIdentity(input.generatorVersion)||!/^[a-f0-9]{64}$/u.test(input.inputHash))
  throw Error(error)
 const output=snapshotReferenceFields(input.generate(),['header','rows'],error)
 const inspected=readExpandedContentTable({...placeholder,data:output})
 if(inspected.links.some(link=>!input.nodeIds.has(link.targetNodeId)))throw Error(error)
 const data=structuredClone(inspected.data)
 const presentationNode={...structuredClone(placeholder),data}
 freezeJson(presentationNode)
 input.assertCurrent()
 return Object.freeze({nodeId,generatorKey:input.generatorKey,generatorVersion:input.generatorVersion,inputHash:input.inputHash,
  data,presentationNode})
}
