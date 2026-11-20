/**
 * @module app:lowcode/resources/semi-structured/excel-import/catalog/template
 * 职责：原File选择、声明模板命令及原方案templatePath写回编排。
 * 边界：业务值只在DataView；RAM只持File、身份、阶段和原查询证明，不建立查询/保存owner。
 * AI用途：沿选取、原命令确认和原方案路径发布编排页面交互，未知只恢复首轮提交。
 */
import type {DataSet,DataView,DataRow,BindCommandSubmitOptions} from '@spark-appworks/spark-data'
import {ExcelTemplateUploadResource,LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

const model='Base_Import_solution',scene='36B01771C627B9BF5CD493DC75B996A1'
/** 模板交互阶段；文件确认与方案发布分开，retained明确表示已保留而未发布。 */
type ExcelTemplatePhase='selected'|'upload'|'publication'|'complete'|'retained'
type Intent={id:string;file:File|undefined;name:string;phase:ExcelTemplatePhase;commandId:string|undefined;oldPath:unknown;wasAdded:boolean;retainedPath:string|undefined;ready:(()=>void)|undefined}
type State={ds:DataSet;list:DataView;target:DataView;command:DataView;resource:ExcelTemplateUploadResource;guard:()=>void;creationReady:()=>boolean;intent:Intent|undefined;busy:boolean;permit:boolean}
const states=new WeakMap<DataSet,State>()
function clean(view:DataView):boolean{return !view.hasUnconfirmedSave&&!view.mutating&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges()}
function empty(value:unknown):boolean{return value===undefined||value===null||value===''}
function stateFor(ds:DataSet):State{const state=states.get(ds);if(!state)throw Error('模板命令尚未绑定');state.guard();return state}
function original(state:State,intent:Intent):void{state.guard();if(state.intent!==intent)throw Error('模板原输入已变化')}
function targetRow(state:State,intent:Intent):DataRow{
 original(state,intent)
 const view=state.target,row=view.rows[0]
 if(view.loadingError||view.queryContext['importConfigId']!==intent.id||view.rows.length!==1||view.total!==1||!row||view.getPkKey(row)!==intent.id||view.fieldAccess(row,'templatePath').read!=='visible')throw Error('模板原方案尚未独立回读')
 return row
}
async function readTarget(state:State,intent:Intent):Promise<DataRow>{
 original(state,intent);if(!clean(state.target)||!clean(state.list))throw Error('请先处理原方案修改或未知保存')
 state.target.queryContext={importConfigId:intent.id};await state.target.refresh();return targetRow(state,intent)
}
function path(state:State,intent:Intent):string{
 if(!intent.commandId)throw Error('原模板确认回执缺失')
 return state.resource.assertConfirmed(state.command,intent.commandId)
}
function onlyPath(state:State,intent:Intent,value:string):void{
 original(state,intent)
 const base=state.target.rows.find(row=>state.target.getPkKey(row)===intent.id),draft=state.target.getEditingRow(intent.id),diff=state.target.getDirtyChanges(intent.id)
 if(!clean(state.list)||!base||state.target.dirtyTracking.pendingCreateIds.size||state.target.dirtyTracking.pendingDeleteIds.size||Object.keys(diff).some(field=>field!=='templatePath')||draft&&state.target.columns.some(column=>column.name!=='templatePath'&&!Object.is(draft[column.name],base[column.name]))||(draft??base)['templatePath']!==value)throw Error('模板写回不能夹带其他修改')
}
async function save(state:State,view:DataView,id:string):Promise<void>{
 const result=await state.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[id]}]});state.guard()
 if(!result.success||result.data?.failedCount||result.data?.failedEditingRows)throw Error(result.message??'模板阶段保存未确认')
}
/** 在首次场景装配中绑定现有声明命令，不创建运行表。 */
export function bindExcelTemplate(command:DataView,input:Readonly<{http:HttpClientBase;readScope:ConstructorParameters<typeof LowcodeDesignFileUpload>[0]['readScope'];assertCurrent:()=>void;creationReady:()=>boolean}>):BindCommandSubmitOptions{
 const ds=command.dataSet,list=ds?.getView(model),target=ds?.getView(model,'editorTarget')
 if(ds?.scenarioId !== scene||!list||!target||states.has(ds)||command.viewId!=='default')throw Error('模板首次绑定的原实例不符')
 const signature=()=>JSON.stringify([input.readScope(),list.queryContext,target.queryConfig,target.filterExpression,target.sortExpression]),captured=signature()
 const guard=()=>{input.assertCurrent();if(ds.destroyed||signature()!==captured||[list,target,command].some(view=>view.destroyed||ds.getView(view.tableName,view.viewId)!==view))throw Error('模板原执行域或视图已失效')}
 const resource=new ExcelTemplateUploadResource({upload:new LowcodeDesignFileUpload(input),readScope:input.readScope,prepare:(_view,row)=>{
  const intent=state.intent
  if(!state.permit||!intent?.file||intent.phase!=='selected'||row['schemeId']!==intent.id||!intent.ready)throw Error('模板缺少原正式方案及File许可')
  return{scenarioId:scene,schemeId:intent.id,file:intent.file,assertReady:()=>{original(state,intent);intent.ready?.();const current=targetRow(state,intent);if(!clean(list)||!clean(target)||target.fieldAccess(current,'templatePath').write!=='allowed'||!input.creationReady())throw Error('原方案仍有未处理修改或权限已变化')},assertPublished:value=>{const current=targetRow(state,intent);if(!clean(list)||!clean(target)||current['templatePath']!==value)throw Error('模板路径尚未独立保存确认')},assertUnpublished:value=>{const current=targetRow(state,intent);if(!clean(list)||!clean(target)||current['templatePath']===value)throw Error('原方案未采用模板的事实尚未核定')}}
 }})
 const state:State={ds,list,target,command,resource,guard,creationReady:input.creationReady,intent:undefined,busy:false,permit:false};states.set(ds,state)
 const table=target.dataTable;if(!table)throw Error('模板原模型缺失');const previous=table.querySaveRule
 table.setQuerySaveRule({groups:[...(previous?.groups??[]),{fields:['templatePath'],validate:()=>{const intent=state.intent;if(intent?.phase==='publication'&&(target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges()))onlyPath(state,intent,path(state,intent))}}]})
 return resource.binding(command)
}
/** 选择/替换只持原File，不写templatePath、不创建上传命令、不联网。 */
export function selectExcelTemplate(ds:DataSet,id:string,file:File):void{
 const state=stateFor(ds),current=state.intent,row=state.list.rows.find(item=>state.list.getPkKey(item)===id)
 if(state.busy||current&&current.phase!=='selected'&&current.phase!=='complete'&&current.phase!=='retained'||!row||state.list.fieldAccess(row,'templatePath').read!=='visible'||!(/\.xlsx?$/i.test(file.name)))throw Error('请先处理原模板或选择xls/xlsx文件')
 state.intent={id,file,name:file.name,phase:'selected',commandId:undefined,oldPath:row['templatePath'],wasAdded:state.list.dirtyTracking.isPendingCreate(id),retainedPath:undefined,ready:undefined}
}
/** 仅取消未派发选择；已派发文件与未知结果不能按本地输入丢弃。 */
export function cancelExcelTemplate(ds:DataSet):void{
 const state=stateFor(ds),intent=state.intent
 if(!intent)return
 const localInput=intent.phase==='selected'||intent.phase==='upload'&&!state.command.hasUnconfirmedSave
 if(state.busy||!localInput&&intent.phase!=='complete'&&intent.phase!=='retained')throw Error('原模板已派发或尚未确认，不能取消')
 if(localInput&&intent.commandId){state.command.discardPendingChanges([intent.commandId]);state.resource.releaseCancelled(state.command,intent.commandId)}
 state.intent=undefined
}
export function readExcelTemplate(ds:DataSet):Readonly<{id:string;name:string;phase:ExcelTemplatePhase;retainedPath:string|undefined;busy:boolean;unconfirmed:boolean}>|undefined{
 const state=states.get(ds),intent=state?.intent
 return state&&intent?{id:intent.id,name:intent.name,phase:intent.phase,retainedPath:intent.retainedPath,busy:state.busy,unconfirmed:state.command.hasUnconfirmedSave||state.target.hasUnconfirmedSave}:undefined
}
/** 明确保留已核字节且未被原方案采用的文件，不删除、不重传，不宣称发布成功。 */
export async function retainExcelTemplate(ds:DataSet):Promise<void>{
 const state=stateFor(ds),intent=state.intent
 if(!intent||state.busy||intent.phase!=='publication'||state.command.hasUnconfirmedSave||state.target.hasUnconfirmedSave)throw Error('未知模板不能结束为已知未发布')
 state.busy=true
 try{
  const value=path(state,intent)
  if(state.target.hasEditingChanges()||state.target.dirtyTracking.hasPendingChanges()){onlyPath(state,intent,value);state.target.discardPendingChanges([intent.id])}
  const row=await readTarget(state,intent)
  if(row['templatePath']===value){state.resource.releasePublished(state.command,intent.commandId??'');intent.phase='complete'}
  else{state.resource.releaseUnpublished(state.command,intent.commandId??'');intent.retainedPath=value;intent.phase='retained'}
  intent.file=undefined;intent.ready=undefined
 }finally{state.busy=false}
}
/** 未知本次只恢复原阶段；已确认文件后再按原正式方案独立提交路径。 */
export async function saveExcelTemplate(ds:DataSet):Promise<void>{
 const state=stateFor(ds),intent=state.intent
 if(!intent||state.busy||intent.phase==='complete'||intent.phase==='retained')throw Error('原模板输入缺失或正在处理')
 state.busy=true
 try{
  original(state,intent)
  if(!state.creationReady()||!clean(state.list))throw Error('请先确认原方案的新增或普通修改')
  if(intent.phase==='selected'){
   const row=await readTarget(state,intent)
   if(state.target.fieldAccess(row,'templatePath').write!=='allowed')throw Error('原方案模板路径当前不可写')
   if(!Object.is(row['templatePath'],intent.oldPath)&&!(intent.wasAdded&&empty(row['templatePath'])&&empty(intent.oldPath)))throw Error('选择后的原方案模板路径已变化')
   // 新增草稿的缺省值须在独立核对通过后固定为正式存储值；发布阶段仍严格比较该基线。
   intent.oldPath=row['templatePath']
   intent.ready=state.target.captureReadRow(row,['templatePath'])
   await state.command.refresh();original(state,intent)
   state.permit=true
   let command
   const file=intent.file;if(!file)throw Error('模板原File已释放')
   try{command=await state.command.addRow({schemeId:intent.id,originalName:file.name,size:file.size})}finally{state.permit=false}
   const id=state.command.getPkKey(command);if(typeof id!=='string')throw Error('模板原命令ID缺失')
   intent.commandId=id;intent.phase='upload'
  }
  const commandId=intent.commandId;if(!commandId)throw Error('模板原命令缺失')
  if(intent.phase==='upload'){
   const recovering=state.command.hasUnconfirmedSave
   await save(state,state.command,commandId);path(state,intent);intent.phase='publication'
   if(recovering)return
  }
  {
   if(state.target.hasUnconfirmedSave){await save(state,state.target,intent.id);return}
   const value=path(state,intent)
   if(state.target.hasEditingChanges()||state.target.dirtyTracking.hasPendingChanges()){onlyPath(state,intent,value);state.target.discardPendingChanges([intent.id])}
   const row=await readTarget(state,intent)
   if(row['templatePath']!==value){
    if(!Object.is(row['templatePath'],intent.oldPath))throw Error('原方案模板路径已被其他修改替换')
    if(state.target.fieldAccess(row,'templatePath').write!=='allowed')throw Error('原方案模板路径当前不可写')
    state.target.updateEditingValue(intent.id,'templatePath',value);onlyPath(state,intent,value);await save(state,state.target,intent.id)
    if((await readTarget(state,intent))['templatePath']!==value)throw Error('模板路径写回尚未独立确认')
   }
   state.resource.releasePublished(state.command,commandId);intent.file=undefined;intent.ready=undefined;intent.phase='complete'
  }
 }finally{state.busy=false}
}
