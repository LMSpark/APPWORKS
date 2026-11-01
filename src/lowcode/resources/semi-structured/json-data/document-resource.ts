/**
 * @module app:lowcode/resources/semi-structured/json-data/document-resource
 * 职责：把正式JSON目录记录定位的原文件接入同一DataSet的文件资源视图。
 * 边界：不通过有损树接口保存，不建立第二份文档草稿，不改目录记录或推导权限角色。
 * AI用途：从当次可读目录行打开命名视图，由标准字段绑定content并经DataSet保存。
 */
import {getOrCreateFileResourceView,type DataColumn,type DataSet,type DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError,type LowcodeDesignApi,type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
export const JSON_DOCUMENT_TABLE='JsonDocumentFile'
export const JSON_DOCUMENT_RESOURCE_ID='json-data:document-file'
const columns:readonly DataColumn[]=[{name:'jsonId',type:'string',isPrimaryKey:true},{name:'fileName',type:'string'},{name:'content',type:'string'}]
type OpenOptions=Readonly<{dataSet:DataSet;catalog:DataView;jsonId:string;api:Pick<LowcodeDesignApi,'readTextFile'>;fileUpload:Pick<LowcodeDesignFileUpload,'uploadWorkingText'>;assertCurrent():void}>
/** 文件定位与本次正式目录查询一致；同一目标复用同一原生视图，其他目标使用独立身份。 */
export function openJsonDocumentView(options:OpenOptions):DataView{
 const {dataSet,catalog,jsonId}=options
 const currentRow=()=>{
  options.assertCurrent()
  if(catalog.dataSet!==dataSet||catalog.tableName!=='Base_JsonData'||dataSet.destroyed)throw new Error('JSON_DOCUMENT_TARGET: 目录实例身份不匹配')
  const rows=catalog.rows.filter(row=>catalog.getPkKey(row)===jsonId),row=rows[0]
  if(!row||rows.length!==1||catalog.fieldAccess(row,'rowid').read!=='visible'||catalog.fieldAccess(row,'path').read!=='visible')throw new Error('JSON_DOCUMENT_TARGET: 当前正式目录未返回唯一可读目标')
  return row
 }
 const locate=():string=>{
  const path=currentRow()['path']
  if(path!==null&&path!==undefined&&typeof path!=='string')throw new Error('JSON_DOCUMENT_TARGET: 文件路径不是文本')
  const name=typeof path==='string'&&path.trim()?path.slice(path.lastIndexOf('/')+1):`${jsonId}.json`
  if(name.length===0||name.trim()!==name||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('JSON_DOCUMENT_TARGET: 文件名无效')
  return name
 }
 const fileName=locate()
 const assertCurrent=()=>{if(locate()!==fileName)throw new Error('JSON_DOCUMENT_TARGET: 正式目录的文件定位已变化，请重开')}
 const document=getOrCreateFileResourceView({dataSet,tableName:JSON_DOCUMENT_TABLE,viewId:`document-${jsonId}`,columns,resourceId:JSON_DOCUMENT_RESOURCE_ID,contentField:'content',
  queryContext:{jsonId},target:view=>{if(view.queryContext['jsonId']!==jsonId)throw new Error('JSON_DOCUMENT_TARGET: 文档视图目标不可改绑');return {key:jsonId,fields:{jsonId,fileName}}},
  assertCurrent,canCreate:()=>false,canDelete:()=>false,canWrite:()=>catalog.editActionState(currentRow())==='enabled',
  transport:{
   read:async()=>{assertCurrent();const text=await options.api.readTextFile({appType:'jsondatapath',customPath:'',fileName});assertCurrent();return {text,revision:null}},
   write:async({text})=>{assertCurrent();try{parseJsonDocument(text)}catch(error){throw new SyntaxError(error instanceof Error?error.message:String(error))}await options.fileUpload.uploadWorkingText({appType:'jsondatapath',customPath:'',fileName,text});assertCurrent()},
   isUnknown:error=>!(error instanceof SyntaxError)&&!(error instanceof LowcodeApiError&&error.code>=400&&error.code<500&&error.code!==408),
  },
 })
 document.configure({autoCurrentFirst:true,commitMode:'staged'})
 return document
}
