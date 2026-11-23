/**
 * @module app:lowcode/resources/structured-config/workflow-definition/output/node-output-references
 * 职责：无独立模型的节点输出结构变更按正式工作流定义核查引用。
 * 边界：仅显式结构命令使用，不伪造模型身份、不执行节点、不修改引用。
 * AI用途：生成输出前读取真实元数据依赖，保持调用方首轮合同并释放自有查询。
 */
import {DataViewFilterCodec,type DataSet} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {WorkflowDefinitionReferenceReader} from '../definition-reference-reader'
import {readWorkflowFieldValue as read} from '../fields/query-field-context'

/** 输出结构命令的正式前态、拟态及不可重置守卫。 */
type NodeOutputChange=Readonly<{
 /** 本次宿主元数据实例。 */
 dataSet:DataSet
 /** 工作流正式身份。 */
 workflowId:string
 /** 被变更的正式节点身份，不是模型身份。 */
 nodeId:string
 /** 原正式输出目录。 */
 before:ReadonlyArray<Readonly<Record<string,unknown>>>
 /** 拟生成的输出配置，不是第二份可编辑状态。 */
 after:ReadonlyArray<Readonly<Record<string,unknown>>>
 /** 首轮查询、草稿及目标合同守卫。 */
 assertCurrent:()=>void
}>

/** 正式输出删除、改名或类型变化检查；无破坏性变化时不读取额外依赖。 */
export async function assertWorkflowNodeOutputChanges(input:NodeOutputChange):Promise<void>{
 const changed=input.before.filter(row=>!input.after.some(next=>next['rowid']===row['rowid']&&next['Name']===row['Name']&&next['FieldType']===row['FieldType']))
 if(!changed.length)return
 const params=new Set(changed.map(row=>`${input.nodeId}.${String(row['Name'])}`)),references=new Set<string>()
 const reader=new WorkflowDefinitionReferenceReader(input)
 const document=(value:unknown):unknown=>value===undefined||value===null||value===''?null:typeof value==='string'?parseJsonDocument(value):value
 function visit(value:unknown,location:string,fieldNames:ReadonlySet<string>=new Set()):void{
  if(Array.isArray(value)){value.forEach((child,index)=>visit(child,`${location}[${index}]`,fieldNames));return}
  if(!isRecord(value)||value['Type']==='GetConstValue')return
  if(value['Type']==='GetExpData')throw Error(`输出引用尚不能从不透明表达式核定：${location}`)
  if(value['Type']==='GetInputParam'){
   const name=value['ParamName'];if(typeof name!=='string'||!name.trim()||name!==name.trim())throw Error(`输出引用参数身份无法核定：${location}`)
   if(params.has(name))references.add(location)
   return
  }
  if(typeof value['field']==='string'&&fieldNames.has(value['field']))references.add(`${location}.field`)
  for(const [key,child] of Object.entries(value))visit(child,`${location}.${key}`,fieldNames)
 }
 try{
  const results=await Promise.allSettled([
   reader.query('Base_DataModel',['rowid','dataSetId','Filter','JoinFilter']),
   reader.query('Base_DataModel_Field',['rowid','dataSetId','ValueFun']),
   reader.query('Base_DataModel_Relation',['rowid','dataSetId','parentModId','childModId','filter']),
   reader.query('Base_DataSet',['rowid','Type','inputParams']),
   reader.query('Base_WorkflowNodeDefinition',['rowid','workflow_id','node_type','position_type','input_mapping','output_mapping','config']),
   reader.query('Base_WorkflowConnectors',['rowid','workflow_id','sourceID','targetID','params']),
  ])
  for(const result of results)if(result.status==='rejected')throw result.reason
  const nodes=reader.views.find(view=>view.tableName==='Base_WorkflowNodeDefinition'),target=nodes?.rows.find(row=>row['rowid']===input.nodeId)
  if(!nodes||!target||JSON.stringify(document(read(nodes,target,'output_mapping'))??[])!==JSON.stringify(input.before))throw Error('正式节点输出已变化，请重新读取后处理结构修改')
  if(nodes.editActionState(target)!=='enabled'||nodes.fieldAccess(target,'output_mapping').write!=='allowed')throw Error('当前正式查询不再允许修改节点输出：权限已变化')
  const edges=reader.views.find(view=>view.tableName==='Base_WorkflowConnectors'),descendants=new Set([input.nodeId]),nodeIds=new Set(nodes.rows.map(row=>String(nodes.getPkKey(row))))
  if(!edges)throw Error('节点输出引用缺少正式连线')
  for(const edge of edges.rows)if(!nodeIds.has(String(read(edges,edge,'sourceID')))||!nodeIds.has(String(read(edges,edge,'targetID'))))throw Error('节点输出引用连线端点不完整')
  let expanded=true
  while(expanded){expanded=false;for(const edge of edges.rows){const source=String(read(edges,edge,'sourceID')),id=String(read(edges,edge,'targetID'));if(descendants.has(source)&&!descendants.has(id)){descendants.add(id);expanded=true}}}
  for(const view of reader.views)for(const row of view.rows){
   const location=`${view.tableName}[${String(view.getPkKey(row))}]`
   if(view.tableName==='Base_DataModel'||view.tableName==='Base_DataModel_Relation'){
    for(const key of view.tableName==='Base_DataModel'?['Filter','JoinFilter']:['filter']){
     const raw=read(view,row,key);if(raw!==null&&raw!==undefined&&typeof raw!=='string')throw Error('正式过滤定义格式无法核定')
     const filter=DataViewFilterCodec.parseStored(raw)
     const names=view.tableName==='Base_DataModel_Relation'&&read(view,row,'parentModId')===input.nodeId?new Set(changed.map(old=>String(old['Name']))):new Set<string>()
     if(filter)visit(filter.toJSON(),`${location}.${key}`,names)
    }
   }else if(view.tableName==='Base_DataModel_Field')visit(document(read(view,row,'ValueFun')),`${location}.ValueFun`)
   else if(view.tableName==='Base_DataSet')visit(document(read(view,row,'inputParams')),`${location}.inputParams`)
   else if(view.tableName==='Base_WorkflowConnectors')visit(document(read(view,row,'params')),`${location}.params`)
   else{
    const mapping=document(read(view,row,'input_mapping'))
    const bindingIds=new Set(Array.isArray(mapping)?mapping.filter(isRecord).map(binding=>String(binding['rowid'])):[])
    if(read(view,row,'node_type')==='merge'&&(!Array.isArray(mapping)||bindingIds.size!==mapping.length))throw Error('合并输出引用绑定格式无法核定')
    if(read(view,row,'node_type')==='merge'&&Array.isArray(mapping))for(const binding of mapping){
     if(!isRecord(binding)||typeof binding['rowid']!=='string'||!binding['rowid'])throw Error('合并输出引用绑定格式无法核定')
     const sourceId=String(binding['rowid'])
     if(binding['rowid']===input.nodeId){
      if(!Array.isArray(binding['Fields']))throw Error('合并输出引用字段无法核定')
      if(binding['Fields'].some(field=>!isRecord(field)||changed.some(old=>old['rowid']===field['rowid']||old['Name']===field['Name'])))references.add(`${location}.input_mapping.Fields`)
     }
     function join(value:unknown):void{
      if(!isRecord(value))throw Error('合并连接条件格式无法核定')
      if(value['Type']==='and'||value['Type']==='or'){
       if(!Array.isArray(value['Filters']))throw Error('合并连接条件组格式无法核定')
       value['Filters'].forEach(join);return
      }
      if(value['Type']!=='cond'||typeof value['Field']!=='string')throw Error('合并连接条件字段无法核定')
      const field=value['Field'].includes('.')?value['Field']:`${sourceId}.${value['Field']}`
      const parts=field.split('.')
      if(parts.length!==2||!bindingIds.has(parts[0]??'')||!parts[1]?.trim()||parts[1]!==parts[1].trim())throw Error('合并连接条件字段身份无法核定')
      if(params.has(field))references.add(`${location}.JoinFilter.Field`)
      const fun=value['ValueFun'];if(!isRecord(fun))throw Error('合并连接值函数格式无法核定')
      if(fun['Type']==='GetConstValue'||fun['Type']==='SystemData')return
      if(fun['Type']==='GetInputParam'){visit(fun,`${location}.JoinFilter.ValueFun`);return}
      if(fun['Type']==='GetTableField'){
       const key=fun['Field'],valueParts=typeof key==='string'?key.split('.'):[]
       if(typeof key!=='string'||valueParts.length!==2||!bindingIds.has(valueParts[0]??'')||!valueParts[1]?.trim()||valueParts[1]!==valueParts[1].trim())throw Error('合并连接字段身份无法核定')
       if(params.has(key))references.add(`${location}.JoinFilter.ValueFun`)
       return
      }
      throw Error('合并连接值函数协议尚未核定')
     }
     const condition=document(binding['JoinFilter'])
     if(binding['pid']!==undefined&&binding['pid']!==null&&binding['pid']!==''&&condition!==null){DataViewFilterCodec.decode(condition);join(condition)}
    }
    const config=document(read(view,row,'config')),type=read(view,row,'node_type'),position=String(read(view,row,'position_type'))
    visit(mapping,`${location}.input_mapping`);visit(config,`${location}.config`)
    if(descendants.has(String(view.getPkKey(row)))&&!['0','2'].includes(position)&&type!=='query')for(const [key,value] of [['input_mapping',mapping],['config',config]]){
     if(type==='merge'&&key==='input_mapping'&&Array.isArray(value)&&value.every(isRecord))continue
     if(type==='copy'&&key==='config'&&isRecord(value)&&Object.entries(value).every(([name,item])=>['targetDbName','targetTableName','size','text'].includes(name)&&(item===null||['string','number','boolean'].includes(typeof item))))continue
     if(value!==null&&JSON.stringify(value)!=='[]'&&JSON.stringify(value)!=='{}')throw Error(`下游节点输入协议尚未核定: ${location}.${String(key)}`)
    }
   }
  }
  input.assertCurrent()
  if(references.size)throw Error(`节点输出仍被引用，请先明确清除并保存引用：${[...references].join('；')}`)
 }finally{reader.dispose()}
}
