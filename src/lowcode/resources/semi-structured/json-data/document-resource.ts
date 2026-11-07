/**
 * @module app:lowcode/resources/semi-structured/json-data/document-resource
 * 职责：把正式JSON目录定位的原文件接入已声明的文件资源DataView。
 * 边界：正文、草稿、冲突及未知回执由公共文件适配器持有，不创建第二份表或提交入口。
 */
import {createFileResourceAdapterExecutor,type DataColumn,type DataSet,type DataView,type FileResourceTarget} from '@spark-appworks/spark-data'
import {LowcodeApiError,type LowcodeDesignApi,type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
export const JSON_DOCUMENT_TABLE='JsonDocumentFile'
export const JSON_DOCUMENT_RESOURCE_ID='json-data:document-file'
export const JSON_DOCUMENT_COLUMNS:readonly DataColumn[]=Object.freeze([{name:'jsonId',type:'string',isPrimaryKey:true},{name:'fileName',type:'string'},{name:'content',type:'string'}])
export const JSON_DOCUMENT_VIEWS=Object.freeze({default:Object.freeze({autoLoad:false,autoCurrentFirst:true,commitMode:'staged',queryContext:Object.freeze({jsonId:'',create:false})})})
export const JSON_DOCUMENT_QUERY_PARAMETERS=Object.freeze({default:Object.freeze([{name:'jsonId',type:'string',label:'JSON目录ID',required:true},{name:'create',type:'boolean',label:'创建自身ID文件'}])})
type DocumentTransport=Readonly<{api:Pick<LowcodeDesignApi,'readTextFile'>;fileUpload:Pick<LowcodeDesignFileUpload,'uploadWorkingText'|'uploadTextVersion'>;assertCurrent():void}>
type OpenOptions=Readonly<{dataSet:DataSet;catalog:DataView;jsonId:string;create?:boolean}>
function locate(catalog:DataView,jsonId:string):string{
 if(jsonId.length===0||jsonId.trim()!==jsonId||catalog.dataSet?.destroyed||catalog.tableName!=='Base_JsonData')throw new Error('JSON_DOCUMENT_TARGET: 目录实例身份不匹配')
 const rows=catalog.rows.filter(row=>catalog.getPkKey(row)===jsonId),row=rows[0]
 if(!row||rows.length!==1||catalog.fieldAccess(row,'rowid').read!=='visible'||catalog.fieldAccess(row,'path').read!=='visible')throw new Error('JSON_DOCUMENT_TARGET: 当前正式目录未返回唯一可读目标')
 const path=row['path']
 if(path!==null&&path!==undefined&&typeof path!=='string')throw new Error('JSON_DOCUMENT_TARGET: 文件路径不是文本')
 const name=typeof path==='string'&&path.trim()?path.slice(path.lastIndexOf('/')+1):`${jsonId}.json`
 if(name.length===0||name.trim()!==name||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('JSON_DOCUMENT_TARGET: 文件名无效')
 return name
}
function assertCreate(catalog:DataView,id:string,fileName:string):void{
 if(!catalog.dirtyTracking.isPendingCreate(id)||catalog.addActionState()!=='enabled'||fileName!==`${id}.json`)throw new Error('JSON_DOCUMENT_CREATE: 仅本次正式目录待新增行可创建自身ID文件')
}
/** 从正式声明的默认视图派生独立目标，不动态添加表或重新绑定executor。 */
export function openJsonDocumentView({dataSet,catalog,jsonId,create=false}:OpenOptions):DataView{
 if(catalog.dataSet!==dataSet)throw new Error('JSON_DOCUMENT_TARGET: 目录实例身份不匹配')
 const fileName=locate(catalog,jsonId)
 if(create)assertCreate(catalog,jsonId,fileName)
 const table=dataSet.getTable(JSON_DOCUMENT_TABLE),source=table?.getView('default')
 if(!source||table?.resourceType!=='file'||table.resourceId!==JSON_DOCUMENT_RESOURCE_ID)throw new Error('JSON_DOCUMENT_DECLARATION: 正式场景未声明JSON文件资源')
 const existing=table.getView(`document-${jsonId}`)
 if(existing){if(existing.queryContext['jsonId']!==jsonId||existing.queryContext['create']!==create)throw new Error('JSON_DOCUMENT_TARGET: 文档视图目标不可改绑');return existing}
 const view=source.createQueryView(`document-${jsonId}`)
 view.queryContext={jsonId,create}
 return view
}
/** 首次装配注入传输，每个目标仅保存目录身份与创建阶段证据，不保存正文副本。 */
export function createJsonDocumentExecutor(options:DocumentTransport):Parameters<DataView['bindQueryExecutor']>[0]{
 let dataSet:DataSet|undefined
 const catalogs=new Map<string,DataView>(),creationAllowed=new Set<string>(),creationAttempts=new Set<string>()
 const context=(target:FileResourceTarget)=>{options.assertCurrent();const catalog=catalogs.get(target.key);if(!catalog||catalog.dataSet!==dataSet||locate(catalog,target.key)!==target.fields['fileName'])throw new Error('JSON_DOCUMENT_TARGET: 正式目录的文件定位已变化，请重开');return catalog}
 const pendingCreate=(target:FileResourceTarget)=>{const catalog=context(target);return creationAllowed.has(target.key)&&catalog.dirtyTracking.isPendingCreate(target.key)&&catalog.addActionState()==='enabled'}
 return createFileResourceAdapterExecutor({resourceId:JSON_DOCUMENT_RESOURCE_ID,contentField:'content',
  target:view=>{
   options.assertCurrent();const id=view.queryContext['jsonId'],catalog=view.dataSet?.getView('Base_JsonData')
   if(typeof id!=='string'||!catalog||dataSet&&dataSet!==view.dataSet)throw new Error('JSON_DOCUMENT_TARGET: 目录实例身份不匹配')
   dataSet=view.dataSet;const fileName=locate(catalog,id)
   if(!catalogs.has(id)&&view.queryContext['create']===true){assertCreate(catalog,id,fileName);creationAllowed.add(id)}
   catalogs.set(id,catalog)
   return {key:id,fields:{jsonId:id,fileName}}
  },
  assertCurrent:target=>{if(target)context(target);else options.assertCurrent()},canCreate:pendingCreate,canDelete:()=>false,
  canWrite:target=>{const catalog=context(target),row=catalog.rows.find(candidate=>catalog.getPkKey(candidate)===target.key);return pendingCreate(target)||!!row&&catalog.editActionState(row)==='enabled'},
  transport:{
   read:async target=>{context(target);try{const text=await options.api.readTextFile({appType:'jsondatapath',customPath:'',fileName:String(target.fields['fileName'])});context(target);if(pendingCreate(target)&&!creationAttempts.has(target.key))throw new Error('JSON_DOCUMENT_CREATE_CONFLICT: 待新增目录的文件名已被占用');return {text,revision:null}}catch(error){context(target);if(pendingCreate(target)&&error instanceof LowcodeApiError&&error.code===404)return null;throw error}},
   write:async({target,text,baseline})=>{context(target);try{parseJsonDocument(text)}catch(error){throw new SyntaxError(error instanceof Error?error.message:String(error))}const command={appType:'jsondatapath' as const,customPath:'',fileName:String(target.fields['fileName']),text};if(baseline===null){creationAttempts.add(target.key);await options.fileUpload.uploadTextVersion(command)}else{if(pendingCreate(target))throw new SyntaxError('JSON_DOCUMENT_CREATE_CONFLICT: 新增目录确认前不能覆盖文件');await options.fileUpload.uploadWorkingText(command)}context(target)},
   isUnknown:error=>!(error instanceof SyntaxError)&&!(error instanceof LowcodeApiError&&error.code>=400&&error.code<500&&error.code!==408),
  },
 })
}
