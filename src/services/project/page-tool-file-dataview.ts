/**
 * @module app:services/project/page-tool-file-dataview
 * 职责：将正式 ProjectToolFile DataTable 绑定到工作文件存储适配器。
 * 边界：只提供 SPARK data 的 FileResource 适配，不提供页面级读写或保存入口。
 */
import {bindFileDirectoryQueryAdapter, createFileResourceAdapterExecutor, getOrCreateFileResourceView, type DataSet, type DataView, type FileResourceTarget, type FileResourceTransport} from '@spark-appworks/spark-data'
import {PageTool, ProjectToolResource, type PageToolFileName, type ProjectWorkspace} from '@spark-appworks/spark-project-model'
import * as LowcodePlatform from '@spark-appworks/spark-lowcode-api'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {isRequestError} from '@spark-appworks/spark-utils'
import {createPageToolFilesIo} from '@/lowcode/lowcode-runtime'

const TABLE='ProjectToolFile'
type PageFileIo=ReturnType<typeof createPageToolFilesIo>
function pageFileResourceIdentity(resource:FileResourceTarget):{pageId:string;fileName:string}{
  const pageId=String(resource.fields['pageId']??''),fileName=resource.fields['fileName']
  if(!pageId||!isSafeFileName(fileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 来源文件身份无效')
  return {pageId,fileName}
}
function isPageToolFileName(value:unknown):value is PageToolFileName{
  return value==='rule.json'||value==='script.js'||value==='style.css'
}
function isSafeFileName(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value===value.trim()
  &&value!=='.'&&value!=='..'&&!/[\\/\u0000-\u001f\u007f]/.test(value)}
function mutationMayHaveApplied(error:unknown):Error{
  return Object.assign(new Error(error instanceof Error?error.message:String(error),{cause:error}),{fileResourceMutationMayHaveApplied:true})
}

/** Bind one fully identified page/file query to the formal file table in its DataSet. */
export function createPageFileResourceView(input:Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  fileName:PageToolFileName
  assertCurrent:()=>void
  workspace?:ProjectWorkspace
  rejectLocalDirty?:boolean
}>):DataView{
  return createPageFileView({...input,io:createPageToolFilesIo(input.appId),allowDirectoryEntry:false})
}

/** Creates the same FileResource executor for declared ProjectToolFile tables and named query clones. */
export function createPageToolFileResourceExecutor(input:Readonly<{
  appId:string
  workspace:ProjectWorkspace
  assertCurrent:()=>void
  readOnly?:boolean
}>):Parameters<DataView['bindQueryExecutor']>[0]{
  const io=createPageToolFilesIo(input.appId),transport=createPageFileTransport({appId:input.appId,io,assertCurrent:input.assertCurrent,workspace:input.workspace,rejectLocalDirty:true,requireExisting:true})
  return createFileResourceAdapterExecutor({resourceId:ProjectToolResource.resources.ProjectToolFile,contentField:'text',
    target:view=>{
      const appId=view.queryContext['appId']??input.appId,pageId=view.queryContext['pageId'],fileName=view.queryContext['fileName'],versionId=view.queryContext['versionId']??''
      if(appId!==input.appId||typeof pageId!=='string'||!pageId.trim()||pageId!==pageId.trim()
        ||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)||!isPageToolFileName(fileName)
        ||typeof versionId!=='string'||versionId!==''&&!versionId.trim())throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 查询需绑定应用、工具、文件和发布版本')
      return {key:JSON.stringify([appId,pageId,fileName,versionId]),fields:{pageId,fileName,versionId}}
    },
    canWrite:target=>input.readOnly!==true&&target.fields['versionId']===''&&isPageToolFileName(target.fields['fileName'])
      &&!input.workspace.project.findPageTool(String(target.fields['pageId']))?.isDirty(),
    canCreate:()=>false,
    canDelete:()=>false,
    transport,
    assertCurrent:()=>{input.assertCurrent();if(input.workspace.project.projectId!==input.appId)throw new Error('PAGE_TOOL_FILE_VIEW_STALE: 应用已改变')},
  })
}

/** Bind one safe basename from a complete directory listing for deletion through the same FileResource. */
export function createPageFileDirectoryEntryView(input:Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  fileName:string
  assertCurrent:()=>void
}>):DataView{
  if(!isSafeFileName(input.fileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 目录文件名无效')
  return createPageFileView({...input,io:createPageToolFilesIo(input.appId),allowDirectoryEntry:true})
}

/** Bind the complete basename listing on the formal ProjectToolFile table. */
export function createPageFileDirectoryView(input:Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  assertCurrent:()=>void
}>):DataView{
  const {dataSet,appId,pageId,assertCurrent}=input,io=createPageToolFilesIo(input.appId)
  const table=assertProjectToolFileTable(dataSet)
  if(!pageId.trim()||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 页面身份无效')
  const view=table.getOrCreateView(`directory-${encodeURIComponent(pageId)}`)
  view.queryContext={...view.queryContext,appId,pageId,customPath:`${appId}/${pageId}`}
  bindFileDirectoryQueryAdapter(view,{resourceId:ProjectToolResource.resources.ProjectToolFile,
    target:current=>{
      const targetAppId=String(current.queryContext['appId']??''),targetPageId=String(current.queryContext['pageId']??''),customPath=String(current.queryContext['customPath']??'')
      if(targetAppId!==appId||targetPageId!==pageId||customPath!==`${appId}/${pageId}`)throw new Error('PAGE_TOOL_FILE_DIRECTORY_SCOPE: 目录目标身份无效')
      return {key:JSON.stringify([targetAppId,targetPageId]),fields:{appId:targetAppId,pageId:targetPageId}}
    },
    list:target=>io.list(String(target.fields['appId']),String(target.fields['pageId'])),assertCurrent})
  return view
}

function createPageFileView(input:Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  fileName:string
  io:PageFileIo
  assertCurrent:()=>void
  allowDirectoryEntry:boolean
  workspace?:ProjectWorkspace
  rejectLocalDirty?:boolean
}>):DataView{
  const {dataSet,appId,pageId,io,assertCurrent}=input,resourceFileName=input.fileName
  if(!isSafeFileName(resourceFileName)||!input.allowDirectoryEntry&&!isPageToolFileName(resourceFileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 文件名无效')
  if(!pageId.trim()||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 页面身份无效')
  const formalTable=assertProjectToolFileTable(dataSet)
  const target=(view:DataView)=>{
    const targetAppId=view.queryContext['appId']??appId,targetPageId=String(view.queryContext['pageId']??''),fileName=view.queryContext['fileName']
    if(targetAppId!==appId)throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 应用身份与绑定资源不一致')
    if(!targetPageId||!isSafeFileName(fileName)||!input.allowDirectoryEntry&&!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 查询需绑定页面和文件')
    const versionId=view.queryContext['versionId']??''
    if(typeof versionId!=='string'||versionId!==''&&!versionId.trim())throw new Error('PAGE_TOOL_FILE_VIEW_SCOPE: 发布目标无效')
    return {key:JSON.stringify([targetAppId,targetPageId,fileName,versionId]),fields:{pageId:targetPageId,fileName,versionId}}
  }
  const transport=createPageFileTransport({appId,io,assertCurrent,...(input.workspace?{workspace:input.workspace}:{}),history:!input.allowDirectoryEntry})
  const view=getOrCreateFileResourceView({dataSet,tableName:TABLE,viewId:`page-${encodeURIComponent(pageId)}-${encodeURIComponent(resourceFileName)}`,resourceId:ProjectToolResource.resources.ProjectToolFile,
    columns:formalTable.columns,contentField:'text',queryContext:{pageId,fileName:resourceFileName,versionId:''},target,transport,assertCurrent,
    ...(input.allowDirectoryEntry?{canCreate:()=>false}:{}),
    ...(input.rejectLocalDirty?{canWrite:resource=>resource.fields['versionId']===''&&(!isPageToolFileName(resource.fields['fileName'])||!input.workspace?.project.findPageTool(String(resource.fields['pageId']))?.isDirty())}:{}),
    ...(input.allowDirectoryEntry?{canWrite:()=>false,canDelete:()=>true}:{})})
  return view
}

function createPageFileTransport(input:Readonly<{appId:string;io:PageFileIo;assertCurrent:()=>void;workspace?:ProjectWorkspace;history?:boolean;rejectLocalDirty?:boolean;requireExisting?:boolean}>):FileResourceTransport{
  const {appId,io,assertCurrent,workspace}=input
  const history:NonNullable<FileResourceTransport['history']>={
    list:async resource=>{const {pageId:filePage,fileName}=knownPageFileResourceIdentity(resource)
      return (await io.listVersions({appId,customPath:`${appId}/${filePage}`,fileName})).map(item=>({version:item.version,fileName:item.fileName,lastModified:item.lastModified}))},
    preview:async(resource,version)=>{const {pageId:filePage,fileName}=knownPageFileResourceIdentity(resource),numeric=Number(version)
      if(!Number.isSafeInteger(numeric)||numeric<0)throw new Error('FILE_RESOURCE_VERSION: 版本号无效')
      const text=await io.readVersion({appId,customPath:`${appId}/${filePage}`,fileName,version:numeric});if(text===null)throw new Error('FILE_RESOURCE_VERSION_MISSING: 历史文件不存在');return text},
    create:async(resource,text,onAttempt)=>{const {pageId:filePage,fileName}=knownPageFileResourceIdentity(resource),customPath=`${appId}/${filePage}`
      const versions=await io.listVersions({appId,customPath,fileName});assertCurrent()
      const version=Math.max(0,...versions.map(item=>item.version))+1,versionedFileName=`${version}__${fileName}`
      if(!Number.isSafeInteger(version)||version<1||versions.some(item=>item.version===version&&item.fileName===versionedFileName))throw new Error('FILE_RESOURCE_VERSION: 快照版本无效或冲突')
      onAttempt({version,fileName:versionedFileName});assertCurrent()
      try{await io.uploadVersion({appId,customPath,fileName,version,text})}catch(error){if(error instanceof LowcodeApiError&&error.code!==0){const rejection=new Error(error.message);Object.assign(rejection,{definiteNotApplied:true});throw rejection}throw error}
      assertCurrent();const [after,readback]=await Promise.all([io.listVersions({appId,customPath,fileName}),io.readVersion({appId,customPath,fileName,version})]);assertCurrent()
      if(!after.some(item=>item.version===version&&item.fileName===versionedFileName)||readback!==text)throw new Error(`FILE_RESOURCE_VERSION_UNCONFIRMED: ${versionedFileName} 目录或原文回读不一致`)},
    verify:async(resource,attempt,text)=>{const {pageId:filePage,fileName}=knownPageFileResourceIdentity(resource),customPath=`${appId}/${filePage}`,version=Number(attempt.version)
      if(!Number.isSafeInteger(version)||version<1||attempt.fileName!==`${version}__${fileName}`)return false
      const [versions,readback]=await Promise.all([io.listVersions({appId,customPath,fileName}),io.readVersion({appId,customPath,fileName,version})])
      return versions.some(item=>item.version===version&&item.fileName===attempt.fileName)&&readback===text},
  }
  return {
    read:async resource=>{assertCurrent();const {pageId:filePage,fileName}=pageFileResourceIdentity(resource),versionId=resource.fields['versionId']
      let text:string|null
      if(typeof versionId==='string'&&versionId){
        if(!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_VERSION_SCOPE: 只有三份工具文件有发布快照')
        const versions=LowcodePlatform.parseLowcodeBlueprintFileVersions(versionId)
        const key=fileName==='rule.json'?'rule':fileName==='script.js'?'script':'style',version=versions[key]
        if(version===null)throw new Error(`发布指针缺少 ${fileName}`)
        text=await io.readVersion({appId,customPath:`${appId}/${filePage}`,fileName,version})
      }else text=await io.read(appId,filePage,fileName)
      assertCurrent()
      if(text===null&&input.requireExisting){
        if(typeof versionId==='string'&&versionId)throw new Error(`FILE_RESOURCE_VERSION_MISSING: ${fileName} 发布快照不存在`)
        throw new Error(`FILE_RESOURCE_MISSING: 工具文件 ${filePage}/${fileName} 不存在`)
      }
      const page=workspace?.project.findPageTool(filePage)
      return text===null?null:{text,revision:typeof versionId==='string'&&versionId?versionId:'0',
        fields:{localDirty:page?.isDirty()??false,localText:isPageToolFileName(fileName)?page?.getFileText(fileName)??null:null}}},
    write:async({target:resource,text})=>{assertCurrent();const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      if(!isPageToolFileName(fileName)||resource.fields['versionId']!=='')throw new Error('PAGE_TOOL_FILE_WRITE_SCOPE: 只有工作三文件允许写入')
      if(fileName==='rule.json')new PageTool({pageId:filePage}).hydrateFileText(fileName,text)
      const page=workspace?.project.findPageTool(filePage),localText=page?.getFileText(fileName)
      const localDirty=page?.getDirtyFileNames().includes(fileName)??false
      if(input.rejectLocalDirty&&localDirty)throw new Error('PAGE_TOOL_CONFLICT: 工具文件有本地编辑')
      await io.upload({appId,pageId:filePage,fileName,text})
      try{assertCurrent()}catch(error){throw mutationMayHaveApplied(error)}
      if(input.rejectLocalDirty&&(workspace?.project.findPageTool(filePage)!==page||page?.getFileText(fileName)!==localText
        ||page?.getDirtyFileNames().includes(fileName)))throw mutationMayHaveApplied(new Error('PAGE_TOOL_CONFLICT: 工具文件保存期间本地内容已变化'))},
    remove:async({target:resource})=>{assertCurrent();const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      await io.remove(appId,filePage,fileName)
      try{assertCurrent()}catch(error){throw mutationMayHaveApplied(error)}},
    onWriteConfirmed:(resource,text,baseline)=>{const {pageId:filePage,fileName}=pageFileResourceIdentity(resource)
      if(!isPageToolFileName(fileName)||resource.fields['versionId']!=='')return
      const page=workspace?.project.findPageTool(filePage),previousLocal=baseline?.fields?.['localText']
      if(page&&typeof previousLocal==='string'&&page.getFileText(fileName)===previousLocal)page.hydrateFileText(fileName,text)
      workspace?.notifyPageFileChanged(filePage,fileName)},
    isUnknown:error=>isRequestError(error)&&error.response===undefined
      ||typeof error==='object'&&error!==null&&('fileResourceWriteMayHaveApplied'in error||'fileResourceMutationMayHaveApplied'in error),
    ...(input.history===false?{}:{history}),
  }
}

function assertProjectToolFileTable(dataSet:DataSet){
  const table=dataSet.getTable(TABLE)
  if(table?.resourceType!=='file'||table.resourceId!==ProjectToolResource.resources.ProjectToolFile||table.modelBinding!==undefined
    ||!table.columns.some(column=>column.name==='fileKey'&&column.isPrimaryKey)||!table.columns.some(column=>column.name==='text')){
    throw new Error('PAGE_TOOL_FILE_MAPPING: 正式 ProjectToolFile 映射缺失或无效')
  }
  return table
}
function knownPageFileResourceIdentity(resource:FileResourceTarget):{pageId:string;fileName:PageToolFileName}{
  const {pageId,fileName}=pageFileResourceIdentity(resource)
  if(!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_HISTORY_SCOPE: 只有三份工具文件具有版本历史')
  return {pageId,fileName}
}
