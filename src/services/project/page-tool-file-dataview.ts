/**
 * @module app:services/project/page-tool-file-dataview
 * 职责：将正式 ProjectToolFile DataTable 绑定到工作文件存储适配器。
 * 边界：只提供 SPARK data 的 FileResource 适配，不提供页面级读写或保存入口。
 */
import {getOrCreateFileResourceView, type DataSet, type DataView, type FileResourceTarget, type FileResourceTransport} from '@spark-appworks/spark-data'
import {ProjectToolResource, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {isRequestError} from '@spark-appworks/spark-utils'
import type {createPageToolFilesIo} from '@/lowcode/lowcode-runtime'

const TABLE='ProjectToolFile'
type PageFileIo=ReturnType<typeof createPageToolFilesIo>
function pageFileResourceIdentity(resource:FileResourceTarget):{pageId:string;fileName:PageToolFileName}{
  const pageId=String(resource.fields['pageId']??''),fileName=resource.fields['fileName']
  if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 来源文件身份无效')
  return {pageId,fileName}
}
function isPageToolFileName(value:unknown):value is PageToolFileName{
  return value==='rule.json'||value==='script.js'||value==='style.css'
}

/** Bind one fully identified page/file query to the formal file table in its DataSet. */
export function createPageFileResourceView(input:Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  fileName:PageToolFileName
  io:PageFileIo
  assertCurrent:()=>void
}>):DataView{
  const {dataSet,appId,pageId,io,assertCurrent}=input,resourceFileName=input.fileName
  if(!pageId.trim()||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 页面身份无效')
  const formalTable=dataSet.getTable(TABLE)
  if(formalTable?.resourceType!=='file'||formalTable.resourceId!==ProjectToolResource.resources.ProjectToolFile
    ||formalTable.modelBinding!==undefined||!formalTable.columns.some(column=>column.name==='fileKey'&&column.isPrimaryKey)
    ||!formalTable.columns.some(column=>column.name==='text'))throw new Error('PAGE_TOOL_FILE_MAPPING: 正式 ProjectToolFile 映射缺失或无效')
  const target=(view:DataView)=>{
    const targetPageId=String(view.queryContext['pageId']??''),fileName=view.queryContext['fileName']
    if(!targetPageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 查询需绑定页面和文件')
    return {key:JSON.stringify([appId,targetPageId,fileName]),fields:{pageId:targetPageId,fileName}}
  }
  const history:NonNullable<FileResourceTransport['history']>={
    list:async resource=>{const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      return (await io.listVersions({appId,customPath:`${appId}/${filePage}`,fileName})).map(item=>({version:item.version,fileName:item.fileName,lastModified:item.lastModified}))},
    preview:async(resource,version)=>{const {pageId:filePage,fileName}=pageFileResourceIdentity(resource),numeric=Number(version)
      if(!Number.isSafeInteger(numeric)||numeric<0)throw new Error('FILE_RESOURCE_VERSION: 版本号无效')
      const text=await io.readVersion({appId,customPath:`${appId}/${filePage}`,fileName,version:numeric});if(text===null)throw new Error('FILE_RESOURCE_VERSION_MISSING: 历史文件不存在');return text},
    create:async(resource,text,onAttempt)=>{const {pageId:filePage,fileName}=pageFileResourceIdentity(resource),customPath=`${appId}/${filePage}`
      const versions=await io.listVersions({appId,customPath,fileName});assertCurrent()
      const version=Math.max(0,...versions.map(item=>item.version))+1,versionedFileName=`${version}__${fileName}`
      if(!Number.isSafeInteger(version)||version<1||versions.some(item=>item.version===version&&item.fileName===versionedFileName))throw new Error('FILE_RESOURCE_VERSION: 快照版本无效或冲突')
      onAttempt({version,fileName:versionedFileName});assertCurrent()
      try{await io.uploadVersion({appId,customPath,fileName,version,text})}catch(error){if(error instanceof LowcodeApiError&&error.code!==0){const rejection=new Error(error.message);Object.assign(rejection,{definiteNotApplied:true});throw rejection}throw error}
      assertCurrent();const [after,readback]=await Promise.all([io.listVersions({appId,customPath,fileName}),io.readVersion({appId,customPath,fileName,version})]);assertCurrent()
      if(!after.some(item=>item.version===version&&item.fileName===versionedFileName)||readback!==text)throw new Error(`FILE_RESOURCE_VERSION_UNCONFIRMED: ${versionedFileName} 目录或原文回读不一致`)},
    verify:async(resource,attempt,text)=>{const {pageId:filePage,fileName}=pageFileResourceIdentity(resource),customPath=`${appId}/${filePage}`,version=Number(attempt.version)
      if(!Number.isSafeInteger(version)||version<1||attempt.fileName!==`${version}__${fileName}`)return false
      const [versions,readback]=await Promise.all([io.listVersions({appId,customPath,fileName}),io.readVersion({appId,customPath,fileName,version})])
      return versions.some(item=>item.version===version&&item.fileName===attempt.fileName)&&readback===text},
  }
  const transport:FileResourceTransport={
    read:async resource=>{assertCurrent();const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      const text=await io.read(appId,filePage,fileName);assertCurrent();return text===null?null:{text,revision:'0'}},
    write:async({target:resource,text})=>{assertCurrent();const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      await io.upload({appId,pageId:filePage,fileName,text});assertCurrent()},
    isUnknown:error=>isRequestError(error)&&error.response===undefined,
    history,
  }
  return getOrCreateFileResourceView({dataSet,tableName:TABLE,viewId:`page-${encodeURIComponent(pageId)}-${encodeURIComponent(resourceFileName)}`,resourceId:ProjectToolResource.resources.ProjectToolFile,
    columns:formalTable.columns,contentField:'text',target,transport,assertCurrent})
}
