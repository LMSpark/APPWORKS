/**
 * @module app:lowcode/resources/semi-structured/excel-import/edit-references
 * 职责：按本次删除映射或改变关联的精确身份重读正式依赖。
 * 边界：只使用原DataSet的查询视图，不保存、不缓存草稿，不把经典映射当成物理列。
 * AI用途：配置结构命令派发前校验父子映射归属及晚到引用；普通标题编辑无需调用。
 */
import {RequestState, type DataSet, type DataView, type DataRow, type DataViewFilterTree} from '@spark-appworks/spark-data'
/** 已由原编辑视图捕获的提交范围，不含记录副本。 */
export type ExcelEditTarget = Readonly<{
  /** 本次原DataSet中持有变更的正式视图。 */
  view: DataView
  /** 用户已选择提交的稳定主键范围。 */
  ids: readonly string[]
}>
type Scope = {dataSet: DataSet; check: () => void; queries: DataView[]}
function view(dataSet: DataSet, table: string): DataView {const result=dataSet.getView(table);if(!result||dataSet.destroyed)throw new Error('Excel正式视图已失效');return result}
async function read(scope: Scope, table: string, filter: DataViewFilterTree): Promise<DataView> {
  scope.check();const result=view(scope.dataSet,table).createQueryView(`excelReference_${crypto.randomUUID().replaceAll('-','')}`)
  scope.queries.push(result);result.filterExpression=filter
  result.treeMode='flat'
  result.queryConfig={...result.queryConfig,allPages:true}
  await result.refresh();scope.check()
  if(result.loadingError)throw result.loadingError
  if(result.requestState!==RequestState.Loaded||!result.countReported||result.total!==result.rows.length)throw new Error(`Excel正式关联未完整回读: ${table}/${result.requestState}/${result.rows.length}/${result.total}/${result.countReported}`)
  return result
}
function value(source:DataView,row:DataRow,field:string):unknown{if(source.fieldAccess(row,field).read!=='visible')throw new Error('Excel关联身份或值不可读');return row[field]}
function one(source:DataView,id:string,scheme:string):DataRow {
  const matches=source.rows.filter(row=>value(source,row,'rowid')===id),row=matches[0]
  if(matches.length!==1||!row||value(source,row,'schemeid')!==scheme)throw new Error('Excel关联节点归属已变化')
  return row
}
function dispose(scope:Scope):void{for(const query of scope.queries)query.dataTable?.destroyView(query.viewId)}
async function deleting(scope:Scope,nodeId:string,ids:readonly string[]):Promise<void>{
  const nodes=view(scope.dataSet,'Base_ImportData_Config'),fields=view(scope.dataSet,'Base_ImportData_Field'),scheme=nodes.queryContext['importConfigId']
  if(typeof scheme!=='string')throw new Error('Excel方案身份缺失')
  const stored=ids.filter(id=>!fields.dirtyTracking.isPendingCreate(id));if(!stored.length)return
  const exact=await read(scope,'Base_ImportData_Field',{field:'rowid',operator:'in',value:[...stored]})
  const names:string[]=[]
  for(const id of stored){
    const row=exact.rows.find(candidate=>value(exact,candidate,'rowid')===id),original=fields.dirtyTracking.getPendingDeleteSnapshot(id)??fields.rows.find(candidate=>fields.getPkKey(candidate)===id)
    if(!row||!original||value(exact,row,'configid')!==nodeId||original['configid']!==nodeId||value(exact,row,'name')!==original['name']||typeof row['name']!=='string')throw new Error('待删映射的正式身份或归属已变化')
    if(exact.deleteActionState(row)!=='enabled')throw new Error('当前正式查询不允许删除映射')
    names.push(row['name'])
  }
  const references=await read(scope,'Base_ImportData_Config',{logic:'or',filters:[{field:'rowid',operator:'eq',value:nodeId},{field:'pid',operator:'eq',value:nodeId}]})
  const owner=one(references,nodeId,scheme)
  if(names.includes(String(value(references,owner,'foreignKeyField')??'')))throw new Error('本节点外键仍引用待删映射，请先解除关联并保存')
  for(const row of references.rows){
    if(value(references,row,'rowid')===nodeId)continue
    if(value(references,row,'pid')!==nodeId||value(references,row,'schemeid')!==scheme)throw new Error('子节点关联归属异常，不能删除映射')
    if(names.includes(String(value(references,row,'parentField')??'')))throw new Error('子节点仍引用待删映射，请先解除关联并保存')
  }
}
/** @param input 删除前或原保存前的精确映射身份；新增未保存行的撤回不查询正式记录。 */
export async function assertExcelFieldRemoval(input:Readonly<{dataSet:DataSet;nodeId:string;ids:readonly string[];assertCurrent():void}>):Promise<void>{
  const scope:Scope={dataSet:input.dataSet,check:input.assertCurrent,queries:[]}
  try{await deleting(scope,input.nodeId,input.ids)}finally{dispose(scope)}
}
async function associations(scope:Scope,target:ExcelEditTarget,sourceNodeId?:string):Promise<void>{
  const nodes=target.view,fields=view(scope.dataSet,'Base_ImportData_Field'),scheme=nodes.queryContext['importConfigId']
  if(typeof scheme!=='string')throw new Error('Excel方案身份缺失')
  for(const id of target.ids){
    const changed=new Set([...Object.keys(nodes.getEditingPatch(id)??{}),...Object.keys(nodes.getDirtyChanges(id))]),creating=nodes.dirtyTracking.isPendingCreate(id)
    const current=nodes.getEditingRow(id)
    if(!current)throw new Error('待存关联节点已变化')
    const kinds=(['parentField','foreignKeyField'] as const).filter(kind=>changed.has(kind)||changed.has(`${kind}Desc`)||creating&&current[kind]!==undefined&&current[kind]!==null&&current[kind]!=='')
    if(!kinds.length)continue
    if(current['schemeid']!==scheme)throw new Error('待存关联不属于当前方案')
    const formal=creating?undefined:await read(scope,'Base_ImportData_Config',{field:'rowid',operator:'eq',value:id})
    const original=formal?one(formal,id,scheme):undefined
    if(formal&&original&&[...changed].some(field=>formal.fieldAccess(original,field).write!=='allowed'))throw new Error('当前正式查询不允许保存关联节点的变更字段')
    for(const kind of kinds){
      const description=`${kind}Desc`,name=current[kind],title=current[description]
      if((formal&&original?[kind,description].some(field=>formal.fieldAccess(original,field).write!=='allowed'):nodes.addActionState()!=='enabled'))throw new Error('当前正式查询不允许成组保存关联')
      if(name===undefined||name===null||name===''){if(title!==undefined&&title!==null&&title!=='')throw new Error('清空关联必须同时清空描述');continue}
      if(typeof name!=='string')throw new Error('关联字段名必须是文本')
      const parent=kind==='parentField',owner=parent?current['pid']:id
      if(typeof owner!=='string'||!owner||parent&&owner===scheme)throw new Error('根节点没有父字段关联')
      if(parent){
        if(formal&&original&&value(formal,original,'pid')!==owner)throw new Error('关联的正式直接父节点已变化')
        one(await read(scope,'Base_ImportData_Config',{field:'rowid',operator:'eq',value:owner}),owner,scheme)
      }
      const proposed=owner===sourceNodeId?fields.rows.filter(row=>fields.dirtyTracking.isPendingCreate(String(fields.getPkKey(row)))).flatMap(candidate=>{
        const candidateId=fields.getPkKey(candidate),final=candidateId===undefined?undefined:fields.getEditingRow(candidateId)
        return final?.['configid']===owner&&final['name']===name?[{original:candidate,final}]:[]
      }):undefined
      const candidates=proposed===undefined?await read(scope,'Base_ImportData_Field',{logic:'and',filters:[{field:'configid',operator:'eq',value:owner},{field:'name',operator:'eq',value:name}]}):fields
      const rows=proposed?.map(item=>item.final)??candidates.rows,row=rows[0],permission=proposed?.[0]?.original??row
      if(rows.length!==1||!row||!permission||['configid','name'].some(field=>candidates.fieldAccess(permission,field).read!=='visible')||row['configid']!==owner||row['name']!==name||fields.dirtyTracking.pendingDeleteIds.has(String(candidates.getPkKey(permission))))throw new Error('关联映射已删除、归属已变化或名称不唯一，请重新选择')
      const access=candidates.fieldAccess(permission,'title').read
      if(access==='masked')throw new Error('关联标题被脱敏，不能保存占位描述')
      const label=access==='visible'&&typeof row['title']==='string'&&row['title'].trim()?row['title']:name
      if(title!==label)throw new Error('关联映射标题已变化，请重新选择')
    }
  }
}
/** @param input 本次原视图/精确身份及异步守卫；sourceNodeId仅表示同批实际新增映射的节点。 */
export async function assertExcelEditedReferences(input:Readonly<{dataSet:DataSet;nodeId:string;targets:readonly ExcelEditTarget[];sourceNodeId?:string;assertCurrent():void}>):Promise<void>{
  const scope:Scope={dataSet:input.dataSet,check:input.assertCurrent,queries:[]}
  try{
    for(const target of input.targets){
      if(target.view.tableName==='Base_ImportData_Config')await associations(scope,target,input.sourceNodeId)
      else if(target.view.tableName==='Base_ImportData_Field'&&input.sourceNodeId===undefined){const ids=target.ids.filter(id=>target.view.dirtyTracking.pendingDeleteIds.has(id));if(ids.length)await deleting(scope,input.nodeId,ids)}
    }
  }finally{dispose(scope)}
}
