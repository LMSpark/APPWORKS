/**
 * @module app:lowcode/resources/semi-structured/excel-import/catalog/creation
 * 职责：编排本次方案Added确认、一次领码和原行coding回写。
 * 边界：字段与回执仅保存在原DataView；此处只持身份、阶段及校验证据，不创建查询或保存owner。
 */
import {RequestState,type DataRow,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {BusinessCodeAssignmentResource} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../../data-space/lowcode-data-space-assembler'

import {bindExcelTemplate} from './template'

const scene='36B01771C627B9BF5CD493DC75B996A1',model='Base_Import_solution',commandTable='BusinessCodeAssignment',rule='A3A38857F7584319844A826EF9AAA881'
const fields=['solutionName','description','dataSetId','templatePath'] as const
type Phase='input'|'created'|'allocation'|'writeback'|'complete'|'retained'
type Intent={id:string;phase:Phase;commandId:string|undefined;signature:string|undefined;allocationGuard:(()=>void)|undefined}
type State={ds:DataSet;catalog:DataView;target:DataView;command:DataView;scope:()=>void;intent:Intent|undefined;busy:boolean;permit:boolean}
type Input=Readonly<{config:ScenarioViewConfig;http:HttpClientBase;readScope:ConstructorParameters<typeof BusinessCodeAssignmentResource>[0]['readScope'];assertCurrent:()=>void}>
const states=new WeakMap<DataSet,State>()
function stateFor(ds:DataSet):State{const state=states.get(ds);if(!state)throw Error('Excel新增命令尚未正式绑定');state.scope();return state}
function clean(view:DataView):boolean{return !view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges()&&!view.mutating}
function signature(row:DataRow):string{return JSON.stringify(fields.map(field=>row[field]??''))}
function scopeSignature(input:Input):string{const scope=input.readScope();return JSON.stringify([scope.token,Object.entries(scope.headers).sort(([a],[b])=>a.localeCompare(b))])}
function original(state:State,intent:Intent):void{state.scope();if(state.intent!==intent)throw Error('Excel新增目标已失效')}
function assignedCode(state:State,intent:Intent):string{
 if(!intent.commandId)throw Error('Excel原领码命令缺失')
 const command=state.command.rows.find(row=>state.command.getPkKey(row)===intent.commandId),code=command?.['code']
 if(command?.['rowId']!==intent.id||command['ruleId']!==rule||typeof code!=='string'||!code||state.command.fieldAccess(command,'code').read!=='visible')throw Error('Excel缺少原领码只读回执')
 return code
}
function assertOnlyCoding(state:State,intent:Intent,code:string):void{
 original(state,intent)
 const baseline=state.target.rows.find(row=>state.target.getPkKey(row)===intent.id),pending=state.target.getEditingRow(intent.id),diff=state.target.getDirtyChanges(intent.id)
 if(!baseline||state.target.dirtyTracking.pendingCreateIds.size||state.target.dirtyTracking.pendingDeleteIds.size
  ||Object.keys(diff).some(field=>field!=='coding')||pending&&state.target.columns.some(column=>column.name!=='coding'&&!Object.is(pending[column.name],baseline[column.name]))
  ||(pending??baseline)['coding']!==code)throw Error('Excel编码回写不能夹带其他字段或替换原编码')
}
function targetRow(state:State,intent:Intent):DataRow{
 original(state,intent)
 const view=state.target,row=view.rows[0]
 if(view.requestState!==RequestState.Loaded||view.loadingError||!view.countReported||view.queryContext['importConfigId']!==intent.id||view.rows.length!==1||view.total!==1||!row||view.getPkKey(row)!==intent.id
  ||[...fields,'coding'].some(field=>view.fieldAccess(row,field).read!=='visible'))throw Error('Excel原方案尚未独立回读或所需字段不可读')
 return row
}
async function readTarget(state:State,intent:Intent):Promise<DataRow>{
 original(state,intent)
 if(!clean(state.target))throw Error('请先处理原方案回写，不能覆盖其修改或未知保存')
 state.target.queryContext={importConfigId:intent.id};await state.target.refresh();original(state,intent)
 return targetRow(state,intent)
}
async function saveView(state:State,view:DataView,id:string):Promise<Awaited<ReturnType<DataSet['saveChanges']>>>{
 const result=await state.ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[id]}]});state.scope()
 if(!result.success||result.data?.failedCount||result.data?.failedEditingRows)throw Error(result.message??'Excel本阶段保存未完整确认')
 return result
}
/** 首次场景装配绑定本地声明命令，不从历史空coding授予领码资格。 */
export function createExcelCatalogBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'commandBindings'>{
 if(input.config.scenarioId!==scene)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables'],table=isRecord(tables)?tables[commandTable]:undefined,definition=isRecord(tables)?tables[model]:undefined,binding=isRecord(definition)?definition['modelBinding']:undefined
 if(!isRecord(table)||table['resourceType']!=='command'||table['resourceId']!==BusinessCodeAssignmentResource.resourceId||!isRecord(binding)||binding['modelId']!==`${scene}p000`||binding['modelName']!==model)throw Error('EXCEL_CREATION_BINDING: 正式方案或领码声明不符')
 return{commandBindings:{TemplateUpload:command=>bindExcelTemplate(command,{...input,creationReady:()=>{const ds=command.dataSet;if(!ds)return false;const phase=readExcelSchemeCreation(ds)?.phase;return phase===undefined||phase==='complete'||phase==='retained'}}),[commandTable]:command=>{
  const ds=command.dataSet,catalog=ds?.getView(model),target=ds?.getView(model,'editorTarget')
  if(ds?.scenarioId !== scene||!catalog||!target||command.viewId!=='default'||states.has(ds)||catalog.dataTable?.modelBinding?.modelId!==`${scene}p000`||catalog.dataTable.modelBinding.modelName!==model)throw Error('EXCEL_CREATION_BINDING: 首次实例或原视图不符')
  const context=JSON.stringify(catalog.queryContext),execution=scopeSignature(input),declaration=()=>JSON.stringify([target.queryConfig,target.filterExpression,target.sortExpression]),targetDefinition=declaration()
  const scope=()=>{input.assertCurrent();if(ds.destroyed||[catalog,target,command].some(view=>view.destroyed||ds.getView(view.tableName,view.viewId)!==view)||JSON.stringify(catalog.queryContext)!==context||scopeSignature(input)!==execution||declaration()!==targetDefinition)throw Error('Excel新增原实例或查询范围已变化')}
  const state:State={ds,catalog,target,command,scope,intent:undefined,busy:false,permit:false};states.set(ds,state)
  // 同一模型的公共保存捕获重核真实差异，防止暂存通知和异步预检期间夹入其他列。
  catalog.dataTable.setQuerySaveRule({groups:[...(catalog.dataTable.querySaveRule?.groups??[]),{fields:['coding'],validate:()=>{
   const intent=state.intent
   if(intent?.phase==='writeback'&&(target.hasEditingChanges()||target.dirtyTracking.hasPendingChanges()))assertOnlyCoding(state,intent,assignedCode(state,intent))
  }}]})
  return new BusinessCodeAssignmentResource({http:input.http,readScope:input.readScope,prepare:(_view,row)=>{
   const intent=state.intent
   if(!state.permit||intent?.phase !== 'created'||intent.commandId!==undefined||row['rowId']!==intent.id||row['ruleId']!==rule||!intent.allocationGuard)throw Error('领码缺少本次原Added确认及原目标许可')
   intent.allocationGuard();state.permit=false
   return{scenarioId:scene,rowId:intent.id,ruleId:rule,assertCurrent:()=>{original(state,intent);intent.allocationGuard?.()}}
  }}).binding(command)
 }}}
}
/** 开始原DataView新增输入；未确认Added前可取消，打开本身零领码/零后端写。 */
export async function startExcelSchemeCreation(ds:DataSet):Promise<string>{
 const state=stateFor(ds)
 if(state.busy||state.intent&&state.intent.phase!=='complete'&&state.intent.phase!=='retained'||![state.catalog,state.target,state.command].every(clean))throw Error('请先处理原Excel方案新增或保存')
 state.busy=true
 try{
  const row=await state.catalog.addRow({}),id=state.catalog.getPkKey(row)
  state.scope();if(typeof id!=='string'||!id||!state.catalog.dirtyTracking.isPendingCreate(id))throw Error('Excel原DataView未产生本次Added身份')
  state.intent={id,phase:'input',commandId:undefined,signature:undefined,allocationGuard:undefined};return id
 }finally{state.busy=false}
}
/** 只返回流程身份，不复制表单字段或已分配编码。 */
export function readExcelSchemeCreation(ds:DataSet):Readonly<{id:string;phase:Phase;busy:boolean;unconfirmed:boolean}>|undefined{
 const state=states.get(ds),intent=state?.intent
 return state&&intent?{id:intent.id,phase:intent.phase,busy:state.busy,unconfirmed:[state.catalog,state.target,state.command].some(view=>view.hasUnconfirmedSave)}:undefined
}
/** 显式结束已知未完成处理，保留正式方案和已知领码回执；不取消已保存行，不解除未知派发。 */
export async function endExcelSchemeCreation(ds:DataSet):Promise<void>{
 const state=states.get(ds),intent=state?.intent
 if(!state||!intent||ds.destroyed||state.busy||!['created','allocation','writeback'].includes(intent.phase)||[state.catalog,state.target,state.command].some(view=>view.destroyed||ds.getView(view.tableName,view.viewId)!==view||view.hasUnconfirmedSave)||!clean(state.catalog))throw Error('未知或未保存的原处理不能按已保存方案结束')
 // Added已明确确认且从未准备领码：这里只结束原本地窗口，不读取新执行域或推断远端当前值。
 if(intent.phase==='created'){
  if(intent.commandId!==undefined||intent.signature===undefined||state.permit||![state.catalog,state.target,state.command].every(clean))throw Error('原新增事实或未派发状态不符')
  intent.phase='retained';return
 }
 state.scope()
 state.busy=true
 try{
  if(state.target.hasEditingChanges()||state.target.dirtyTracking.hasPendingChanges()){
   if(intent.phase!=='writeback')throw Error('原方案尚有其他修改')
   assertOnlyCoding(state,intent,assignedCode(state,intent));state.target.discardPendingChanges([intent.id])
  }
  await readTarget(state,intent)
  if(![state.catalog,state.target].every(clean)||state.command.hasUnconfirmedSave||state.command.mutating||intent.phase!=='allocation'&&!clean(state.command))throw Error('原方案仍有未处理修改')
  if(intent.phase==='allocation'){
   const row=state.command.rows.find(item=>state.command.getPkKey(item)===intent.commandId)
   if(!intent.commandId||state.command.dirtyTracking.pendingCreateIds.size!==1||!state.command.dirtyTracking.isPendingCreate(intent.commandId)||state.command.hasEditingChanges()||row?.['rowId']!==intent.id||row['ruleId']!==rule)throw Error('原领码输入已变化或未确认，不能结束')
   state.command.discardPendingChanges([intent.commandId])
  }
  intent.phase='retained'
 }finally{state.busy=false}
}
/** 仅在原Added未确认、无未知结果时取消本地输入，不回滚已保存方案或共享流水。 */
export function cancelExcelSchemeCreation(ds:DataSet):void{
 const state=stateFor(ds),intent=state.intent
 if(!intent||state.busy||intent.phase!=='input'||state.catalog.hasUnconfirmedSave)throw Error('已保存或未知的Excel新增不能按未保存输入取消')
 state.catalog.discardPendingChanges([intent.id]);state.intent=undefined
}
/** 每阶段只保存原单ID；未知恢复只核原保存，本次调用不接着派发下一阶段。 */
export async function saveExcelSchemeCreation(ds:DataSet):Promise<void>{
 const state=stateFor(ds),intent=state.intent
 if(!intent||state.busy)throw Error('Excel原新增输入缺失或正在处理')
 state.busy=true
 try{
  original(state,intent)
  if(intent.phase==='input'){
   const recovering=state.catalog.hasUnconfirmedSave
   if(!recovering&&!state.catalog.dirtyTracking.isPendingCreate(intent.id))throw Error('缺少本次原Added，不能以空操作成功授予领码')
   const result=await saveView(state,state.catalog,intent.id)
   if(result.data?.createdCount!==1)throw Error('Excel新增回执未确认恰好一次原Added')
   const row=state.catalog.rows.find(item=>state.catalog.getPkKey(item)===intent.id);if(!row)throw Error('Excel新增回执缺少原行')
   intent.signature=signature(row);intent.phase='created'
   if(recovering)return
  }
  if(intent.phase==='created'){
   if(state.catalog.hasPendingSavedRowPermissions)await state.catalog.refreshSavedRowPermissions()
   const row=await readTarget(state,intent)
   if(signature(row)!==intent.signature||row['coding']!==null&&row['coding']!==undefined&&row['coding']!=='')throw Error('Excel新增独立回读与原保存不符或编码已有值')
   if(!clean(state.catalog)||state.target.fieldAccess(row,'coding').write!=='allowed')throw Error('Excel原方案仍有修改或编码不可写')
   const captured=state.target.captureReadRow(row,[...fields,'coding'])
   intent.allocationGuard=()=>{original(state,intent);captured();if(!clean(state.catalog)||!clean(state.target)||state.target.fieldAccess(row,'coding').write!=='allowed')throw Error('Excel领码原行或写权限已变化')}
   await state.command.refresh();original(state,intent)
   state.permit=true
   let command
   try{command=await state.command.addRow({rowId:intent.id,ruleId:rule})}finally{state.permit=false}
   const id=state.command.getPkKey(command);if(typeof id!=='string'||!id)throw Error('Excel领码输入缺少原命令ID')
   intent.commandId=id;intent.phase='allocation'
  }
  if(intent.phase==='allocation'){
   if(!intent.commandId)throw Error('Excel原领码命令缺失')
   await saveView(state,state.command,intent.commandId);assignedCode(state,intent);intent.phase='writeback'
  }
  if(intent.phase==='writeback'){
   if(!clean(state.catalog))throw Error('Excel原方案存在其他未处理修改，不能夹带回写')
   const code=assignedCode(state,intent)
   if(state.target.hasUnconfirmedSave){
    await saveView(state,state.target,intent.id);return
   }
   if(state.target.hasEditingChanges()||state.target.dirtyTracking.hasPendingChanges()){
    assertOnlyCoding(state,intent,code)
    // 已知失败只撤回本阶段持有的coding草稿，再按新鲜正式行检查冲突；未知不得走此分支。
    state.target.discardPendingChanges([intent.id])
   }
   const row=await readTarget(state,intent)
   if(row['coding']!==code){
    if(row['coding']!==null&&row['coding']!==undefined&&row['coding']!=='')throw Error('Excel原行编码与已分配回执冲突')
    if(state.target.fieldAccess(row,'coding').write!=='allowed')throw Error('Excel原行编码当前不可写')
    state.target.updateEditingValue(intent.id,'coding',code);assertOnlyCoding(state,intent,code);await saveView(state,state.target,intent.id)
    const saved=await readTarget(state,intent);if(saved['coding']!==code)throw Error('Excel编码写回尚未独立确认')
   }
   intent.phase='complete'
  }
 }finally{state.busy=false}
}
