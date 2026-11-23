/**
 * @module app:lowcode/resources/structured-config/logic-view/node-commands
 * 职责：将已确认来源加入原设计节点树，或删除捕获的节点子树。
 * 边界：只修改原DataView字段；来源准备、确认对话框、取消及保存仍归既有责任方。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {getValueAtJsonPath,isJsonObject,parseJsonDocument,type JsonPath,type JsonValue} from '@spark-appworks/spark-json-document'
import type {PageDataSpaceModelSourcePrepared} from '../../../data-space/model-source/lowcode-data-space-source-catalog'
type Node=Record<string,JsonValue>
const systemFieldNames=new Set(['createuser','createtime','updateuser','updatetime','wfid','flowstate','reportid','description','lingma_sys_is_delete','lingma_sys_ent'])
function nodes(value:JsonValue):Node[]{if(!Array.isArray(value)||value.some(row=>!isJsonObject(row)||Array.isArray(row)))throw new Error('逻辑视图节点必须为对象数组');return value.filter(isJsonObject)}
function assertNodePath(path:JsonPath):void {
  if(!path.length||path.length%2!==1||path.some((part,index)=>index%2===0?typeof part!=='number'||!Number.isSafeInteger(part)||part<0:part!=='ChildTables'))throw new Error('节点路径无效')
}
export class LogicViewNodeCommands {
  public constructor(private readonly owner:Readonly<{view:DataView;assertCurrent:()=>void}>){ }
  private current(){
    this.owner.assertCurrent()
    const view=this.owner.view,row=view.currentRow
    if(view.destroyed||view.dataSet?.destroyed||view.mutating||view.hasUnconfirmedSave||!row||view.fieldAccess(row,'designJson').read!=='visible'
      ||view.fieldAccess(row,'designJson').write!=='allowed')throw new Error('当前设计不可编辑，请核验原查询或保存结果')
    const id=view.getPkKey(row);if(id===undefined)throw new Error('设计行身份缺失')
    const text=String((view.getEditingRow(id)??row)['designJson'])
    return {view,id,text}
  }
  /** 捕获确认命令的原字段版本；仅用于异步/路径身份核验，不作为草稿或保存来源。 */
  public capture():string{return this.current().text}
  private document(expected:string){const current=this.current();if(current.text!==expected)throw new Error('设计已变化，请重新选择节点');return {...current,roots:nodes(parseJsonDocument(current.text))}}
  /** 批量切换选中节点的输出标记；不递归影响子节点，不保存或删除字段定义。 */
  public setFieldOutput(input:Readonly<{expected:string;path:JsonPath;operation:'all-off'|'system-off'|'reverse'}>):void {
    assertNodePath(input.path)
    const current=this.document(input.expected),node=getValueAtJsonPath(current.roots,input.path)
    if(!isJsonObject(node)||Array.isArray(node)||!Array.isArray(node['Fields']))throw new Error('节点字段数组不存在')
    const fields=nodes(node['Fields'])
    for(const field of fields){
      if(input.operation==='reverse')field['IsOutput']=Number(field['IsOutput'])===1?0:1
      else if(input.operation==='all-off'||systemFieldNames.has(String(field['Name']??'').trim().toLowerCase()))field['IsOutput']=0
    }
    current.view.updateEditingValue(current.id,'designJson',JSON.stringify(current.roots))
  }
  /** 确认来源后加入当前节点的子集合；未选节点时加入根集合。 */
  public append(input:Readonly<{expected:string;parentPath:JsonPath|null;prepared:PageDataSpaceModelSourcePrepared}>):JsonPath {
    const current=this.document(input.expected),{source,model,fields}=input.prepared
    if(input.parentPath)assertNodePath(input.parentPath)
    if(!source.name.trim()||!model.Type||!model.DbId)throw new Error('来源缺少正式名称、类型或资源身份')
    if(source.type==='interface'&&!source.providerId)throw new Error('接口来源缺少提供方身份')
    if(fields.some(field=>!field.Name||field.type==='dataModel'&&!field.FieldType))throw new Error('来源字段名称或类型尚未确认')
    const primary=fields.filter(field=>field.type==='dataModel'&&field.IsPKey===1)
    const used=new Set<string>()
    const collect=(list:Node[]):void=>{for(const row of list){if(typeof row['Name']==='string')used.add(row['Name']);if(row['ChildTables']!==undefined)collect(nodes(row['ChildTables']))}}
    collect(current.roots)
    let name=source.name,index=1;while(used.has(name))name=`${source.name}_${index++}`
    const mapField=(field:typeof fields[number])=>({...field,Description:field.description,DISTINCT:0,IsOutput:field.type==='inputParams'?0:1})
    const node:Node={Name:name,MetaName:source.name,Description:source.description,description:source.description,Type:model.Type,DbId:model.DbId,
      PrimaryKeyFields:primary.length===1?(primary[0]?.Name??''):'',OutputType:'Table',Filter:null,JoinType:'',ForeignKeyFields:'',JoinFilter:null,
      Fields:fields.filter(field=>field.type==='dataModel').map(mapField),inputParams:fields.filter(field=>field.type==='inputParams').map(mapField),ChildTables:[]}
    let collection=current.roots
    const collectionPath:JsonPath=[]
    if(input.parentPath){const parent=getValueAtJsonPath(current.roots,input.parentPath);if(!isJsonObject(parent)||Array.isArray(parent))throw new Error('父节点已失效')
      if(parent['ChildTables']===undefined)parent['ChildTables']=[]
      collection=nodes(parent['ChildTables']);collectionPath.push(...input.parentPath,'ChildTables')
      // nodes只校验数组；使用该原集合完成此次领域变更，不另持有节点草稿。
      parent['ChildTables']=collection
    }
    const result=[...collectionPath,collection.length];collection.push(node)
    current.view.updateEditingValue(current.id,'designJson',JSON.stringify(current.roots))
    return result
  }
  /** 删除捕获节点及其子树，不删除来源目录记录；原DataView取消可完整恢复。 */
  public remove(input:Readonly<{expected:string;path:JsonPath}>):JsonPath|null {
    assertNodePath(input.path)
    const current=this.document(input.expected),index=input.path.at(-1)
    if(typeof index!=='number'||!Number.isSafeInteger(index)||index<0)throw new Error('节点路径无效')
    const collectionPath=input.path.slice(0,-1)
    if(collectionPath.length&&collectionPath.at(-1)!=='ChildTables')throw new Error('节点父集合无效')
    const collection=collectionPath.length?getValueAtJsonPath(current.roots,collectionPath):current.roots
    if(!Array.isArray(collection)||index>=collection.length)throw new Error('节点已变化或不存在')
    nodes(collection);collection.splice(index,1)
    current.view.updateEditingValue(current.id,'designJson',JSON.stringify(current.roots))
    return collectionPath.length?collectionPath.slice(0,-1):null
  }
}
