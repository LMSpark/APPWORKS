import {bindFileDirectoryQueryAdapter, bindFileResourceAdapter, bindDataSetCommandSubmit, ensureDataSetFileCommandView, type DataSet, type DataRow, type DataView, type FileResourceTransport} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {isRequestError} from '@spark-appworks/spark-utils'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'

const TABLE='PageToolFilesCommand'
const FILES=PAGE_TOOL_FILE_NAMES
type PageToolFileUploadCommand=Readonly<{appId:string;pageId:string;fileName:PageToolFileName;text:string}>
type FileIo=Readonly<{list:(appId:string,pageId:string)=>Promise<readonly string[]>;read:(appId:string,pageId:string,name:PageToolFileName)=>Promise<string|null>;upload:(command:PageToolFileUploadCommand)=>Promise<void>;restoreWorkingFile?:(command:PageToolFileUploadCommand)=>Promise<void>;remove:(appId:string,pageId:string,name:string)=>Promise<void>}>
  & Partial<SnapshotFileIo>
type Action='create'|'compensate'|'snapshot'|'restore'|'delete'
export type PageToolSnapshotInput=Readonly<{
  /** 当前蓝图工作区中正在交付的页面身份，用于校验命令目标。 */
  pageId:string
  /** 由当前导航 DataView 解析并经应用范围校验的文件目录。 */
  customPath:string
  /** 仅允许页面工具三文件之一。 */
  fileName:PageToolFileName
  /** 当前工具编辑器读取的完整文件原文，允许空字符串。 */
  text:string
  /** 在每次异步边界校验页面、节点与请求作用域仍为原目标。 */
  assertCurrent:()=>void
  /** 获得版本号且即将提交快照时记录可核验的文件名。 */
  onAttempt?:(result:PageToolSnapshotResult)=>void
}>
export type PageToolSnapshotResult=Readonly<{
  /** 经文件目录及原文回读确认的版本号。 */
  version:number
  /** 经回执确认的 version__fileName。 */
  fileName:string
}>
export type PageToolRestoreInput=Readonly<{
  pageId:string
  customPath:string
  fileName:PageToolFileName
  version:number
  baselineText:string
  assertCurrent:()=>void
}>
type FileVersion=Readonly<{version:number;fileName:string;lastModified:number|null}>
type FileVersionListCommand=Readonly<{appId:string;customPath:string;fileName:PageToolFileName}>
type FileVersionReadCommand=Readonly<{appId:string;customPath:string;fileName:PageToolFileName;version:number}>
type FileVersionWriteCommand=FileVersionReadCommand&Readonly<{text:string}>
type SnapshotFileIo=Readonly<{
  listVersions:(command:FileVersionListCommand)=>Promise<readonly FileVersion[]>
  uploadVersion:(command:FileVersionWriteCommand)=>Promise<void>
  readVersion:(command:FileVersionReadCommand)=>Promise<string|null>
}>
type PageToolFileSaveInput=Readonly<{
  page:PageTool
  fileName:PageToolFileName
  text:string
  revision:number
  /** Whether this save requires the original page to remain the active page. */
  requireActive?:boolean
  assertCurrent:()=>void
}>
const SAVE_TABLE='PageToolFileSave'
const DIRECTORY_TABLE='PageToolFilesDirectory'
function isPageToolFileName(value:unknown):value is PageToolFileName{return FILES.some(name=>name===value)}
function parseAction(value:unknown):Action{
  if(value==='create'||value==='compensate'||value==='snapshot'||value==='restore'||value==='delete')return value
  throw new Error(`PAGE_TOOL_FILE_ACTION: 不支持的文件命令 ${String(value)}`)
}
export async function createChildPageWithFiles(input:Readonly<{parentId:string;assertParent:()=>void;createFiles:(parentId:string)=>Promise<string>;addNode:(pageId:string)=>Promise<void>;isNodeReceiptUnknown:()=>boolean;compensate:(pageId:string,parentId:string)=>Promise<void>}>):Promise<string>{
  input.assertParent()
  const pageId=await input.createFiles(input.parentId)
  try{await input.addNode(pageId);return pageId}
  catch(error){if(!input.isNodeReceiptUnknown())await input.compensate(pageId,input.parentId);throw error}
}
export async function assertRecoveredChildPermission(input:Readonly<{parentId:string;pageId:string;assertParent:()=>void;compensate:(pageId:string,parentId:string)=>Promise<void>}>):Promise<void>{
  try{input.assertParent()}catch(error){await input.compensate(input.pageId,input.parentId);throw error}
}
function defaults(pageId:string):Record<PageToolFileName,string>{const page=new PageTool({pageId});page.markLoaded();return {'rule.json':page.getFileText('rule.json'),'script.js':page.getFileText('script.js'),'style.css':page.getFileText('style.css')}}
function confirmedText(text:string|null,expected:string):boolean{return text===expected}
function unconfirmedRestoreWrite(error:unknown):Error{
  const cause=error instanceof Error?error.message:String(error),result=new Error(`PAGE_TOOL_RESTORE_UNCONFIRMED: ${cause}`)
  result.name='RequestError';Object.assign(result,{config:{url:'/api/File/UploadFile'}});return result
}
function isDefiniteRestoreRejection(error:unknown):boolean{
  // uploadWorkingText includes a post-dispatch readback; a response-bearing RequestError may come from that read.
  // Only an explicit SPARK upload rejection is definite here. Everything else must retain the original command for verification.
  return error instanceof LowcodeApiError&&error.code!==0
}

/** File resource command owner; page identity and request guard are captured per command. */
export class PageToolFilesDataView {
  readonly view
  public get ownerDataSet():DataSet{return this.dataSet}
  readonly #snapshotVersions=new Map<string,number>()
  readonly #snapshotGuards=new Map<string,()=>void>()
  readonly #snapshotAttemptCallbacks=new Map<string,(result:PageToolSnapshotResult)=>void>()
  readonly #snapshotReceiptsNeedingDelivery=new Set<string>()
  readonly #restoreGuards=new Map<string,()=>void>()
  readonly #restoreReceiptsNeedingDelivery=new Set<string>()
  readonly #pendingUnknownActions=new Map<string,Action>()
  readonly saveView:DataView
  readonly directoryView:DataView
  readonly #fileSaveViews=new Map<string,DataView>()
  readonly #releasedPageFileViews=new Set<string>()
  #bindFileSaveView:((view:DataView)=>void)|undefined
  #savingFileView=false
  readonly #fileSaveAttempts=new Map<string,PageToolFileSaveInput>()
  constructor(private readonly dataSet:DataSet,private readonly appId:string,private readonly io:FileIo,private assertCurrent:()=>void){
    if(!appId.trim())throw new Error('page-tool-files 缺少 appId')
    this.view=ensureDataSetFileCommandView({dataSet,tableName:TABLE,resourceId:`page-tool-files:${appId}`,columns:[{name:'commandId',primary:true},{name:'action'},{name:'pageId'},{name:'parentId'},
      {name:'customPath'},{name:'fileName'},{name:'text'},{name:'snapshotVersion'},{name:'versionedFileName'},{name:'baselineText'}]})
    this.view.commitMode='staged'
    bindDataSetCommandSubmit(this.view,{resource:{resourceType:'file',resourceId:`page-tool-files:${appId}`},guard:()=>this.assertCurrent(),
      inputFields:['commandId','action','pageId','parentId','customPath','fileName','text','snapshotVersion','versionedFileName','baselineText'],createKey:()=>crypto.randomUUID(),
      submit:row=>this.submit(row),verify:row=>this.verify(row),isUnconfirmed:error=>this.isUnknown(error)})
    const saveTable=dataSet.getTable(SAVE_TABLE)??dataSet.addTable(SAVE_TABLE,[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},{name:'text',type:'string'},{name:'revision',type:'string'}])
    if(saveTable.modelBinding!==undefined||(saveTable.resourceType!==undefined&&saveTable.resourceType!=='file'))throw new Error('PAGE_TOOL_FILE_SAVE_IDENTITY: 保存表不是file资源')
    saveTable.resourceType='file';saveTable.resourceId=`page-tool-files-save:${appId}`
    const saveView=dataSet.getView(SAVE_TABLE,'default')
    if(!saveView)throw new Error('PAGE_TOOL_FILE_SAVE_VIEW: 保存视图缺失')
    this.saveView=saveView
    const directoryTable=dataSet.getTable(DIRECTORY_TABLE)??dataSet.addTable(DIRECTORY_TABLE,[{name:'fileName',type:'string',isPrimaryKey:true},{name:'appId',type:'string'},{name:'pageId',type:'string'}])
    if(directoryTable.modelBinding!==undefined||(directoryTable.resourceType!==undefined&&directoryTable.resourceType!=='file'))throw new Error('PAGE_TOOL_FILE_DIRECTORY_IDENTITY: 目录表不是file资源')
    directoryTable.resourceType='file';directoryTable.resourceId=`page-tool-files-directory:${appId}`
    const directoryView=directoryTable.getOrCreateView('default')
    this.directoryView=directoryView
    bindFileDirectoryQueryAdapter(directoryView,{resourceId:`page-tool-files-directory:${appId}`,
      target:current=>{
        const targetAppId=String(current.queryContext['appId']??''),pageId=String(current.queryContext['pageId']??''),customPath=String(current.queryContext['customPath']??'')
        if(targetAppId!==this.appId||!this.isValidDeleteTarget(pageId,customPath))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 页面目录身份无效')
        return {key:JSON.stringify([targetAppId,pageId,customPath]),fields:{appId:targetAppId,pageId,customPath}}
      },
      list:target=>this.io.list(String(target.fields['appId']),String(target.fields['pageId'])),assertCurrent:()=>this.assertCurrent()})
    const assertFileAttempt=(pageId:string,fileName:unknown):void=>{
      this.assertCurrent()
      if(!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 文件名无效')
      this.#fileSaveAttempts.get(JSON.stringify([this.appId,pageId,fileName]))?.assertCurrent()
    }
    const listVersions=this.io.listVersions,readVersion=this.io.readVersion
    const history:FileResourceTransport['history']=listVersions&&readVersion?{
      list:async target=>{const {pageId,fileName}=this.fileTarget(target);return listVersions({appId:this.appId,customPath:`${this.appId}/${pageId}`,fileName})},
      preview:async(target,version)=>{const {pageId,fileName}=this.fileTarget(target),numericVersion=Number(version)
        if(!Number.isSafeInteger(numericVersion)||numericVersion<0)throw new Error('FILE_RESOURCE_VERSION: 版本号无效')
        const text=await readVersion({appId:this.appId,customPath:`${this.appId}/${pageId}`,fileName,version:numericVersion})
        if(text===null)throw new Error('FILE_RESOURCE_VERSION_MISSING: 历史文件不存在');return text},
      create:()=>Promise.reject(new Error('PAGE_TOOL_SNAPSHOT_COMMAND_REQUIRED: 快照必须通过PageTool DataSet命令提交')),
      verify:async(target,attempt,expectedText)=>{const {pageId,fileName}=this.fileTarget(target),customPath=`${this.appId}/${pageId}`
        const version=Number(attempt.version)
        if(!Number.isSafeInteger(version)||version<1||attempt.fileName!==`${version}__${fileName}`)return false
        const [versions,text]=await Promise.all([listVersions({appId:this.appId,customPath,fileName}),readVersion({appId:this.appId,customPath,fileName,version})])
        return versions.some(item=>item.version===version&&item.fileName===attempt.fileName)&&text===expectedText},
    }:undefined
    const transport:FileResourceTransport={
      read:async target=>{this.assertCurrent();const pageId=String(target.fields['pageId']??''),fileName=target.fields['fileName']
        if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_QUERY_SCOPE: 查询需绑定页面和文件')
        assertFileAttempt(pageId,fileName)
        const text=await this.io.read(this.appId,pageId,fileName);assertFileAttempt(pageId,fileName)
        return text===null?null:{text,revision:'0'}},
      write:async({target,text})=>{this.assertCurrent();const pageId=String(target.fields['pageId']??''),fileName=target.fields['fileName']
        if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 提交身份改变')
        assertFileAttempt(pageId,fileName)
        await this.io.upload({appId:this.appId,pageId,fileName,text});assertFileAttempt(pageId,fileName)},
      isUnknown:error=>this.isUnknown(error),...(history?{history}:{}),
    }
    this.#bindFileSaveView=view=>{
      view.commitMode='staged'
      bindFileResourceAdapter(view,{resourceId:`page-tool-files-save:${appId}`,contentField:'text',revisionField:'revision',
        target:currentView=>{const pageId=String(currentView.queryContext['pageId']??''),fileName=currentView.queryContext['fileName']
          if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_QUERY_SCOPE: 查询需绑定页面和文件')
          return {key:JSON.stringify([appId,pageId,fileName]),fields:{pageId,fileName}}},transport,assertCurrent:()=>this.assertCurrent()})
    }
    this.#bindFileSaveView(saveView)
  }
  private fileTarget(target:{fields:Readonly<DataRow>}):{pageId:string;fileName:PageToolFileName}{
    const pageId=String(target.fields['pageId']??''),fileName=target.fields['fileName']
    if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 文件来源身份无效')
    return {pageId,fileName}
  }
  /** Rebind a parked command owner to a newly acquired same-project DevSystem scope. */
  public rebindScope(input:Readonly<{assertCurrent:()=>void;assertPendingFileSavePage?:(page:PageTool,fileName:PageToolFileName,requireActive:boolean)=>void}>):void{
    this.assertCurrent=input.assertCurrent
    for(const [key,attempt] of this.#fileSaveAttempts){
      const assertCurrent=()=>{this.assertCurrent();input.assertPendingFileSavePage?.(attempt.page,attempt.fileName,attempt.requireActive===true)}
      this.#fileSaveAttempts.set(key,{...attempt,assertCurrent})
    }
  }
  public async savePageFile(input:PageToolFileSaveInput):Promise<void>{
    if(this.#savingFileView)throw new Error('PAGE_TOOL_FILE_SAVE_PENDING: 当前文件DataView正在处理另一目标')
    this.#savingFileView=true
    try{
      const pageId=input.page.pageId,key=JSON.stringify([this.appId,pageId,input.fileName]),view=this.pageFileDataView(pageId)
      if(input.page.isLoaded===false||!isPageToolFileName(input.fileName)||typeof input.text!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0){
        throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 页面/文件/revision 无效')
      }
      if(!view.hasUnconfirmedSave&&(view.queryContext['pageId']!==pageId||view.queryContext['fileName']!==input.fileName||view.rows.length===0)){
        await this.loadPageFileDataView(pageId,input.fileName)
      }
      if(!view.hasUnconfirmedSave){
        const recovered=await view.verifySourceWriteAttempt()
        if(recovered.state==='unknown')throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 重开视图后原提交仍无法核验')
        if(recovered.state==='confirmed'){
          input.assertCurrent()
          if(view.dirtyTracking.hasPendingChanges())throw new Error('PAGE_TOOL_FILE_SAVE_PENDING: 原提交已确认；请先处理当前DataView草稿')
          input.page.markFileSaved(input.fileName,recovered.text??'')
          view.acknowledgeSourceWriteAttempt();await view.refresh();this.assertCurrent();input.assertCurrent()
        }else if(recovered.state==='not-applied')view.acknowledgeSourceWriteAttempt()
      }
      const prior=this.#fileSaveAttempts.get(key)
      if(view.hasUnconfirmedSave){
        if(prior?.page !== input.page||prior.text!==input.text)throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 只能核验原页面及原文件提交')
        prior.assertCurrent()
      }else{
        const row=view.rows.find(item=>item['pageId']===pageId&&item['fileName']===input.fileName),id=row&&view.getPkKey(row)
        if(!row||id===undefined||typeof row['text']!=='string')throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 查询没有返回目标文件行')
        if(row['text']!==input.page.getSavedFileText(input.fileName))throw new Error('PAGE_TOOL_FILE_CONFLICT: DataView与PageTool保存基线不一致')
        const edited=view.getEditingRow(id)??row
        if(edited['text']!==input.text){
          if(view.dirtyTracking.hasPendingChanges(id))throw new Error('PAGE_TOOL_FILE_SAVE_DRAFT: DataView草稿与PageTool运行投影不一致')
          await view.editRowById(id,{text:input.text})
        }
        if(input.page.getFileText(input.fileName)!==input.text)throw new Error('PAGE_TOOL_FILE_SAVE_DRAFT: DataView草稿与PageTool运行投影不一致')
        this.assertCurrent();input.assertCurrent();this.#fileSaveAttempts.set(key,input)
      }
      const row=view.rows.find(item=>item['pageId']===pageId&&item['fileName']===input.fileName),id=row&&view.getPkKey(row)
      if(id===undefined)throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 提交行身份缺失')
      const outcome=await this.dataSet.saveChanges({views:[{tableName:SAVE_TABLE,viewId:view.viewId,ids:[id]}]})
      this.assertCurrent();input.assertCurrent();if(!outcome.success)throw outcome.error??new Error(outcome.message??'文件 DataView 保存未确认')
      input.page.markFileSaved(input.fileName,input.text);this.#fileSaveAttempts.delete(key)
      this.releasePageFileDataViewIfIdle(input.page.pageId)
    }finally{this.#savingFileView=false}
  }
  /** Bind one page's rule-file edit surface to its own view so switching pages retains each DataView draft. */
  public getPageFileDataView(pageId:string):DataView{this.#releasedPageFileViews.delete(pageId);return this.pageFileDataView(pageId)}
  /** Release a page editor's view; clean views are destroyed, while pending submissions remain owned for recovery. */
  public releasePageFileDataView(pageId:string):boolean{
    const view=this.#fileSaveViews.get(pageId)
    if(!view)return true
    if(view.dirtyTracking.hasPendingChanges()||view.hasUnconfirmedSave){this.#releasedPageFileViews.add(pageId);return false}
    this.destroyPageFileDataView(pageId,view)
    return true
  }
  /** Load the exact file row into the page-scoped DataView and select it for standard field components. */
  public async loadPageFileDataView(pageId:string,fileName:PageToolFileName,discardPending=false):Promise<DataView>{
    this.assertCurrent()
    this.#releasedPageFileViews.delete(pageId)
    const view=this.pageFileDataView(pageId),existing=view.rows.find(row=>row['pageId']===pageId&&row['fileName']===fileName)
    if(view.hasUnconfirmedSave){
      if(view.queryContext['pageId']===pageId&&view.queryContext['fileName']===fileName&&existing){const id=view.getPkKey(existing);if(id!==undefined)view.setCurrentRowById(id);return view}
      throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 原页面文件提交仍待核验')
    }
    if(view.dirtyTracking.hasPendingChanges()){
      if(!discardPending&&existing?.['fileName']===fileName){const id=view.getPkKey(existing);if(id!==undefined)view.setCurrentRowById(id);return view}
      if(!discardPending)throw new Error('PAGE_TOOL_FILE_SAVE_PENDING: 当前页面 DataView 草稿目标不匹配')
      view.discardPendingChanges()
    }
    view.queryContext={...view.queryContext,appId:this.appId,pageId,fileName}
    await view.refresh();this.assertCurrent()
    const row=view.rows.find(item=>item['pageId']===pageId&&item['fileName']===fileName)
    if(!row)throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 查询没有返回目标页面文件')
    const id=view.getPkKey(row);if(id===undefined)throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 查询结果缺少稳定身份')
    view.setCurrentRowById(id)
    return view
  }
  /** Register the PageTool runtime projection and immutable save attempt after the bound DataView field changed. */
  public preparePageFileDataViewSave(input:PageToolFileSaveInput):void{
    this.assertCurrent();input.assertCurrent()
    const pageId=input.page.pageId,name=input.fileName
    if(input.page.isLoaded===false||pageId.length===0||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)||!isPageToolFileName(name)
      ||typeof input.text!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 页面/文件/revision 无效')
    const view=this.pageFileDataView(pageId),source=view.currentRow,id=source&&view.getPkKey(source),row=id===null||id===undefined?null:view.getEditingRow(id)??source
    if(!source||!row||id===null||id===undefined||source['pageId']!==pageId||source['fileName']!==name||row['text']!==input.text||input.page.getFileText(name)!==input.text
      ||!view.dirtyTracking.hasPendingChanges(id))throw new Error('PAGE_TOOL_FILE_SAVE_DRAFT: DataView、PageTool运行投影与提交文本不一致')
    this.#fileSaveAttempts.set(JSON.stringify([this.appId,pageId,name]),input)
  }
  public cancelPageFileDataView(pageId:string,fileName:PageToolFileName):string|undefined{
    const view=this.#fileSaveViews.get(pageId)
    if(!view)return undefined
    if(view.hasUnconfirmedSave)throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 原提交须先核验，不能取消')
    const row=view.rows.find(item=>item['pageId']===pageId&&item['fileName']===fileName),id=row&&view.getPkKey(row)
    if(id!==undefined&&view.dirtyTracking.hasPendingChanges(id))view.discardPendingChanges([id])
    this.#fileSaveAttempts.delete(JSON.stringify([this.appId,pageId,fileName]))
    const current=view.rows.find(item=>item['pageId']===pageId&&item['fileName']===fileName)
    return typeof current?.['text']==='string'?current['text']:undefined
  }
  private pageFileDataView(pageId:string):DataView{
    if(!pageId.trim()||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId))throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 页面身份无效')
    const existing=this.#fileSaveViews.get(pageId);if(existing)return existing
    const table=this.dataSet.getTable(SAVE_TABLE);if(!table)throw new Error('PAGE_TOOL_FILE_SAVE_VIEW: 保存表缺失')
    const viewId=`page-${encodeURIComponent(pageId)}`,view=table.getOrCreateView(viewId)
    if(!this.#bindFileSaveView)throw new Error('PAGE_TOOL_FILE_SAVE_VIEW: 文件视图 executor 未就绪')
    this.#bindFileSaveView(view);this.#fileSaveViews.set(pageId,view);return view
  }
  public async create(parentId:string,pageId?:string):Promise<string>{return this.run('create',pageId??'',parentId)}
  public async compensateCreate(pageId:string,parentId:string):Promise<void>{await this.run('compensate',pageId,parentId)}
  /** Read and validate the whole page directory before another resource is mutated. */
  public async preflightDeletePageFiles(pageId:string,customPath:string):Promise<void>{
    this.assertCurrent()
    if(!this.isValidDeleteTarget(pageId,customPath))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 页面目录身份无效')
    this.directoryView.queryContext={...this.directoryView.queryContext,appId:this.appId,pageId,customPath}
    await this.directoryView.refresh()
    this.assertCurrent()
    if(this.directoryView.loadingError)throw this.directoryView.loadingError
    const names=this.directoryView.rows.map(row=>row['fileName'])
    for(const name of names){
      if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 文件目录返回了非法名称')
    }
  }
  /** Delete a complete mounted page directory through the shared file command DataView. */
  public async deletePageFiles(pageId:string,customPath:string):Promise<void>{
    this.assertNoPendingRestoreDelivery()
    await this.preflightDeletePageFiles(pageId,customPath)
    const page=pageId.trim(),path=customPath.trim()
    let row=this.view.rows.find(candidate=>candidate['action']==='delete'&&candidate['pageId']===page&&candidate['customPath']===path
      &&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})())
    if(!row){
      const pending=this.view.rows.find(candidate=>candidate['action']==='delete'&&candidate['pageId']===page&&candidate['customPath']===path
        &&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&this.view.hasUnconfirmedSave})())
      if(pending)row=pending
    }
    if(!row){
      await this.view.refresh();this.assertCurrent()
      if(this.view.loadingError)throw this.view.loadingError
      const added=await this.view.addRow({commandId:crypto.randomUUID(),action:'delete',pageId:page,parentId:'',customPath:path,fileName:'',text:'',snapshotVersion:'',versionedFileName:''})
      if('success' in added)throw new Error('PAGE_TOOL_FILE_DELETE_COMMAND: 无法创建目录删除命令')
      row=added
    }
    const commandId=String(row['commandId']??''),id=this.view.getPkKey(row)
    if(!commandId||id!==commandId)throw new Error('PAGE_TOOL_FILE_DELETE_COMMAND: 缺少稳定命令身份')
    try{
      const saved=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
      this.assertCurrent()
      if(!saved.success)throw saved.error??new Error(saved.message??'页面文件目录删除未确认')
      this.#pendingUnknownActions.delete(commandId)
    }catch(error){if(this.view.hasUnconfirmedSave)this.#pendingUnknownActions.set(commandId,'delete');throw error}
  }
  /**
   * 创建发布快照是一个 file DataView 命令。版本号在 owner 内由真实目录计算；上传后同时回读目录与原文，
   * 失败时保留 DataView 命令行及原版本号，后续保存只核验/接续这条命令。
   */
  public async createSnapshot(input:PageToolSnapshotInput):Promise<PageToolSnapshotResult>{
    this.assertCurrent();input.assertCurrent()
    this.assertNoPendingRestoreDelivery()
    const pageId=input.pageId.trim(),customPath=input.customPath.trim()
    if(!pageId||pageId!==input.pageId||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
      ||customPath!==input.customPath||customPath!==`${this.appId}/${pageId}`||/[\\%\u0000-\u001f\u007f?#]/.test(customPath)
      ||customPath.split('/').some(segment=>!segment||segment==='.'||segment==='..'||segment.trim()!==segment)
      ||!FILES.some(name=>name===input.fileName)||typeof input.text!=='string')throw new Error('PAGE_TOOL_SNAPSHOT_TARGET: 快照目标无效')
    const same=(row:DataRow):boolean=>row['action']==='snapshot'&&row['pageId']===pageId&&row['customPath']===customPath
      &&row['fileName']===input.fileName&&row['text']===input.text
    const acceptedUndelivered=this.view.rows.find(candidate=>same(candidate)&&(()=>{
      const key=this.view.getPkKey(candidate)
      return key!==undefined&&this.#snapshotReceiptsNeedingDelivery.has(String(key))&&!this.view.dirtyTracking.hasPendingChanges(key)
    })())
    if(acceptedUndelivered){
      this.assertCurrent();input.assertCurrent()
      const commandId=String(acceptedUndelivered['commandId']??''),version=Number(acceptedUndelivered['snapshotVersion']),fileName=String(acceptedUndelivered['versionedFileName']??'')
      if(!commandId||!Number.isSafeInteger(version)||version<1||fileName!==`${version}__${input.fileName}`)throw new Error('PAGE_TOOL_SNAPSHOT_RECEIPT: 已接受快照缺少有效回执')
      this.#snapshotReceiptsNeedingDelivery.delete(commandId);this.#snapshotGuards.delete(commandId);this.#snapshotVersions.delete(commandId);this.#snapshotAttemptCallbacks.delete(commandId)
      return {version,fileName}
    }
    let row=this.view.rows.find(candidate=>same(candidate)&&(()=>{const key=this.view.getPkKey(candidate);return key!==undefined&&this.view.dirtyTracking.hasPendingChanges(key)})())
    if(!row){
      const other=this.view.rows.find(candidate=>candidate['action']==='snapshot'&&candidate['customPath']===customPath&&candidate['fileName']===input.fileName
        &&(()=>{const key=this.view.getPkKey(candidate);return key!==undefined&&this.view.dirtyTracking.hasPendingChanges(key)})())
      if(other)throw new Error('PAGE_TOOL_SNAPSHOT_PENDING: 同一目标已有未确认快照命令')
      await this.view.refresh();this.assertCurrent();input.assertCurrent()
      const added=await this.view.addRow({commandId:crypto.randomUUID(),action:'snapshot',pageId,parentId:'',customPath,fileName:input.fileName,text:input.text,snapshotVersion:'',versionedFileName:''})
      if('success' in added)throw new Error('PAGE_TOOL_SNAPSHOT_COMMAND: 无法创建快照命令')
      row=added
    }
    const commandId=String(row['commandId']??''),id=this.view.getPkKey(row)
    if(!commandId||id!==commandId)throw new Error('PAGE_TOOL_SNAPSHOT_COMMAND: 缺少稳定命令身份')
    this.#snapshotGuards.set(commandId,input.assertCurrent)
    if(input.onAttempt)this.#snapshotAttemptCallbacks.set(commandId,input.onAttempt)
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
      if(!result.success)throw result.error??new Error(result.message??'快照 DataView 命令失败')
    }catch(error){if(this.view.hasUnconfirmedSave)this.#pendingUnknownActions.set(commandId,'snapshot');throw error}
    try{this.assertCurrent();input.assertCurrent()}
    catch(error){this.#snapshotReceiptsNeedingDelivery.add(commandId);throw error}
    this.#snapshotReceiptsNeedingDelivery.add(commandId)
    const confirmed=this.view.rows.find(candidate=>candidate['commandId']===commandId)
    const version=Number(confirmed?.['snapshotVersion']),fileName=String(confirmed?.['versionedFileName']??'')
    if(!Number.isSafeInteger(version)||version<1||fileName!==`${version}__${input.fileName}`)throw new Error('PAGE_TOOL_SNAPSHOT_RECEIPT: DataView 未返回有效快照回执')
    this.#snapshotReceiptsNeedingDelivery.delete(commandId);this.#snapshotGuards.delete(commandId);this.#snapshotVersions.delete(commandId);this.#pendingUnknownActions.delete(commandId)
    this.#snapshotAttemptCallbacks.delete(commandId)
    return {version,fileName}
  }
  /** 将版本恢复作为原文件 DataView 命令提交；未知回执只核验原命令。 */
  public async restoreVersion(input:PageToolRestoreInput):Promise<string>{
    this.assertCurrent()
    const pageId=input.pageId.trim(),customPath=input.customPath.trim(),version=input.version
    if(!pageId||pageId!==input.pageId||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
      ||customPath!==input.customPath||customPath!==`${this.appId}/${pageId}`||/[\\%\u0000-\u001f\u007f?#]/.test(customPath)
      ||customPath.split('/').some(segment=>!segment||segment==='.'||segment==='..'||segment.trim()!==segment)
      ||!isPageToolFileName(input.fileName)||!Number.isSafeInteger(version)||version<0||typeof input.baselineText!=='string')throw new Error('PAGE_TOOL_RESTORE_TARGET: 恢复目标无效')
    const same=(row:DataRow):boolean=>row['action']==='restore'&&row['pageId']===pageId&&row['customPath']===customPath
      &&row['fileName']===input.fileName&&Number(row['snapshotVersion'])===version
    const accepted=this.view.rows.find(row=>same(row)&&(()=>{const key=this.view.getPkKey(row);return key!==undefined&&this.#restoreReceiptsNeedingDelivery.has(String(key))&&!this.view.dirtyTracking.hasPendingChanges(key)})())
    if(accepted){this.assertCurrent();input.assertCurrent();const text=accepted['text'];
      if(typeof text!=='string')throw new Error('PAGE_TOOL_RESTORE_RECEIPT: 恢复回执缺少文本')
      return text}
    this.assertNoPendingRestoreDelivery()
    const priorUnknown=this.view.rows.find(candidate=>same(candidate)&&(()=>{const key=this.view.getPkKey(candidate);return key!==undefined&&this.#pendingUnknownActions.get(String(key))==='restore'})())
    if(!priorUnknown)input.assertCurrent()
    let row=this.view.rows.find(candidate=>same(candidate)&&(()=>{const key=this.view.getPkKey(candidate);return key!==undefined&&(this.view.dirtyTracking.hasPendingChanges(key)||this.#pendingUnknownActions.get(String(key))==='restore')})())
    if(!row){
      this.saveView.queryContext={...this.saveView.queryContext,appId:this.appId,pageId,fileName:input.fileName}
      await this.saveView.refresh();this.assertCurrent();input.assertCurrent()
      if(this.saveView.loadingError)throw this.saveView.loadingError
      const working=this.saveView.rows.find(candidate=>candidate['pageId']===pageId&&candidate['fileName']===input.fileName)
      if(!working||typeof working['text']!=='string')throw new Error('PAGE_TOOL_RESTORE_WORKING_FILE_MISSING: 工作文件不存在')
      let versions
      try{versions=await this.saveView.listSourceVersions()}
      catch(error){if(error instanceof Error&&error.message.startsWith('DATA_VIEW_SOURCE_UNSUPPORTED'))throw new Error(`PAGE_TOOL_RESTORE_OWNER: ${error.message}`);throw error}
      this.assertCurrent();input.assertCurrent()
      const versionedFileName=`${version}__${input.fileName}`
      if(!versions.some(item=>item.version===version&&item.label===versionedFileName))throw new Error('PAGE_TOOL_RESTORE_VERSION_MISSING: 目标版本不存在')
      const [text,baselineText]=await Promise.all([this.saveView.previewSourceVersion(version),Promise.resolve(working['text'])])
      this.assertCurrent();input.assertCurrent()
      if(typeof text!=='string')throw new Error('PAGE_TOOL_RESTORE_VERSION_UNREADABLE: 目标版本不是有效文本')
      if(typeof baselineText!=='string')throw new Error('PAGE_TOOL_RESTORE_WORKING_FILE_MISSING: 工作文件不存在')
      if(baselineText!==input.baselineText)throw new Error('PAGE_TOOL_RESTORE_CONFLICT: 工作文件已改变')
      await this.view.refresh();this.assertCurrent();input.assertCurrent()
      const pending=this.view.rows.find(candidate=>candidate['action']==='restore'&&candidate['pageId']===pageId&&candidate['customPath']===customPath
        &&candidate['fileName']===input.fileName&&Number(candidate['snapshotVersion'])===version
        &&(()=>{const key=this.view.getPkKey(candidate);return key!==undefined&&(this.view.dirtyTracking.hasPendingChanges(key)||this.#pendingUnknownActions.get(String(key))==='restore')})())
      if(pending){row=pending}
      else {
      const added=await this.view.addRow({commandId:crypto.randomUUID(),action:'restore',pageId,parentId:'',customPath,fileName:input.fileName,
        text,snapshotVersion:String(version),versionedFileName,baselineText:input.baselineText})
      if('success'in added)throw new Error('PAGE_TOOL_RESTORE_COMMAND: 无法创建恢复命令')
      row=added
      }
    }
    const commandId=String(row['commandId']??''),id=this.view.getPkKey(row)
    if(!commandId||id!==commandId)throw new Error('PAGE_TOOL_RESTORE_COMMAND: 缺少稳定命令身份')
    this.#restoreGuards.set(commandId,input.assertCurrent)
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
      if(!result.success)throw result.error??new Error(result.message??'版本恢复 DataView 命令失败')
    }catch(error){if(this.view.hasUnconfirmedSave)this.#pendingUnknownActions.set(commandId,'restore');throw error}
    this.#restoreReceiptsNeedingDelivery.add(commandId)
    this.assertCurrent();input.assertCurrent()
    const confirmed=this.view.rows.find(candidate=>candidate['commandId']===commandId)
    if(!confirmed||confirmed['text']!==row['text']||confirmed['snapshotVersion']!==String(version))throw new Error('PAGE_TOOL_RESTORE_RECEIPT: DataView 未确认目标版本恢复')
    const text=confirmed['text'];if(typeof text!=='string')throw new Error('PAGE_TOOL_RESTORE_RECEIPT: 恢复回执缺少文本')
    this.#pendingUnknownActions.delete(commandId)
    return text
  }
  /** 仅在 PageTool 已接收或明确保留本次恢复结果后消费确认回执。 */
  public acknowledgeRestoreDelivery(pageId:string,fileName:PageToolFileName,version:number):void{
    const row=this.view.rows.find(candidate=>candidate['action']==='restore'&&candidate['pageId']===pageId
      &&candidate['fileName']===fileName&&Number(candidate['snapshotVersion'])===version)
    const commandId=row?.['commandId']
    if(typeof commandId!=='string'||!this.#restoreReceiptsNeedingDelivery.has(commandId))return
    this.#restoreReceiptsNeedingDelivery.delete(commandId);this.#restoreGuards.delete(commandId);this.#pendingUnknownActions.delete(commandId)
  }
  public hasPendingCommandForParent(parentId:string):boolean{return this.pendingCommandForParent(parentId)!==undefined}
  public get hasPendingRestoreDelivery():boolean{return this.#restoreReceiptsNeedingDelivery.size>0}
  private fileSaveViews():DataView[]{return [this.saveView,...this.#fileSaveViews.values()]}
  public get dirty():boolean{return this.hasPendingRestoreDelivery||this.view.rows.some(row=>{const id=this.view.getPkKey(row);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})||this.fileSaveViews().some(view=>view.dirtyTracking.hasPendingChanges())}
  public get hasUnconfirmedSave():boolean{return this.view.hasUnconfirmedSave||this.fileSaveViews().some(view=>view.hasUnconfirmedSave)}
  public get hasPendingFileSave():boolean{return this.fileSaveViews().some(view=>view.hasUnconfirmedSave||view.dirtyTracking.hasPendingChanges())}
  public hasUnconfirmedPageFile(pageId:string,fileName:PageToolFileName):boolean{
    const view=this.#fileSaveViews.get(pageId)
    return view?.hasUnconfirmedSave===true&&view.queryContext['pageId']===pageId&&view.queryContext['fileName']===fileName
  }
  public get hasPendingPageDelete():boolean{return this.view.rows.some(candidate=>candidate['action']==='delete'&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&(this.view.dirtyTracking.hasPendingChanges(id)||this.#pendingUnknownActions.get(String(id))==='delete')})())}
  public get hasPendingNonDeleteCommand():boolean{return this.view.rows.some(candidate=>candidate['action']!=='delete'&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&(this.view.dirtyTracking.hasPendingChanges(id)||this.#pendingUnknownActions.has(String(id)))})())}
  public pendingCommandForParent(parentId:string):Readonly<{action:'create'|'compensate';pageId:string}>|undefined{
    const row=this.view.rows.find(candidate=>candidate['parentId']===parentId&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})())
    if(!row||!(row['action']==='create'||row['action']==='compensate'))return undefined
    return {action:row['action'],pageId:String(row['pageId']??'')}
  }
  public async save():Promise<void>{
    this.assertCurrent()
    await this.savePageFiles()
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.dirtyTracking.hasPendingChanges(id))
    if(ids.length===0&&!this.hasUnconfirmedSave)return
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,...(ids.length?{ids}:{})}]})
      if(!result.success)throw result.error??new Error(result.message??'page-tool-files DataView 保存失败')
      for(const id of ids)this.#pendingUnknownActions.delete(String(id))
    }catch(error){if(this.hasUnconfirmedSave)for(const id of ids){const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id);if(row)this.#pendingUnknownActions.set(String(id),parseAction(row['action']))}throw error}
  }
  public async savePageFiles():Promise<void>{
    this.assertCurrent()
    if(!this.hasPendingFileSave){for(const pageId of this.#releasedPageFileViews)this.releasePageFileDataViewIfIdle(pageId);return}
    const views=this.fileSaveViews().flatMap(view=>{
      const ids=view.rows.map(row=>view.getPkKey(row)).filter((id):id is string|number=>id!==undefined&&view.dirtyTracking.hasPendingChanges(id))
      return ids.length||view.hasUnconfirmedSave?[{tableName:SAVE_TABLE,viewId:view.viewId,...(ids.length?{ids}:{})}]:[]
    })
    if(!views.length)return
    const result=await this.dataSet.saveChanges({views})
    if(!result.success)throw result.error??new Error(result.message??'工具文件DataView保存未确认')
    for(const [key,attempt] of this.#fileSaveAttempts){
      const view=this.#fileSaveViews.get(attempt.page.pageId),row=view?.rows.find(item=>item['pageId']===attempt.page.pageId&&item['fileName']===attempt.fileName)
      if(view&&!view.hasUnconfirmedSave&&!view.dirtyTracking.hasPendingChanges()&&row?.['text']===attempt.text){
        attempt.assertCurrent();attempt.page.markFileSaved(attempt.fileName,attempt.text);this.#fileSaveAttempts.delete(key)
      }
    }
    for(const pageId of this.#releasedPageFileViews)this.releasePageFileDataViewIfIdle(pageId)
  }
  private releasePageFileDataViewIfIdle(pageId:string):void{
    if(!this.#releasedPageFileViews.has(pageId))return
    const view=this.#fileSaveViews.get(pageId)
    if(!view){this.#releasedPageFileViews.delete(pageId);return}
    if(!view.dirtyTracking.hasPendingChanges()&&!view.hasUnconfirmedSave)this.destroyPageFileDataView(pageId,view)
  }
  private destroyPageFileDataView(pageId:string,view:DataView):void{
    this.dataSet.getTable(SAVE_TABLE)?.destroyView(view.viewId)
    this.#fileSaveViews.delete(pageId);this.#releasedPageFileViews.delete(pageId)
  }
  private async run(action:Action,pageId:string,parentId:string):Promise<string>{
    this.assertCurrent();this.assertNoPendingRestoreDelivery();const parent=parentId.trim();if(!parent)throw new Error('FILE_SCOPE: parentId 不能为空')
    const requestedPageId=pageId.trim()
    const sameRequestedPage=(row:DataRow)=>action!=='create'||!requestedPageId||String(row['pageId']??'')===requestedPageId
    let created=this.view.rows.find(row=>row['action']===action&&row['parentId']===parent&&sameRequestedPage(row)&&(()=>{const key=this.view.getPkKey(row);return key!==undefined&&(this.view.dirtyTracking.hasPendingChanges(key)||this.#pendingUnknownActions.get(String(key))===action)})())
    const accepted=this.view.rows.find(row=>row['action']===action&&row['parentId']===parent&&sameRequestedPage(row)
      &&row['result']===(action==='create'?'created':'compensated')&&(()=>{const key=this.view.getPkKey(row);return key!==undefined&&!this.view.dirtyTracking.hasPendingChanges(key)})())
    if(!created&&accepted)return String(accepted['pageId']??'')
    if(!created){await this.view.refresh();this.assertCurrent()}
    if(!created){const normalized=pageId.trim()||`child-${crypto.randomUUID()}`
      created=undefined
      const added=await this.view.addRow({commandId:crypto.randomUUID(),action,pageId:normalized,parentId:parent});if('success' in added)throw new Error('page-tool-files command row could not be created');created=added}
    const normalized=String(created['pageId']??''),id=this.view.getPkKey(created)
    if(!normalized||typeof id!=='string'||!id)throw new Error('page-tool-files 缺少命令身份')
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
      if(!result.success)throw result.error??new Error(result.message??'page-tool-files 命令失败')
    }catch(error){if(this.view.hasUnconfirmedSave)this.#pendingUnknownActions.set(String(id),action);if(error instanceof Error&&/^(FILE_EXISTS|FILE_SCOPE):/.test(error.message)&&this.view.dirtyTracking.hasPendingChanges(id))await this.view.removeRow(id);throw error}
    this.#pendingUnknownActions.delete(String(id))
    return normalized
  }
  private async submit(row:DataRow):Promise<DataRow>{
    this.assertCurrent();const pageId=String(row['pageId']??''),action=parseAction(row['action'])
    if(action==='snapshot')return this.submitSnapshot(row)
    if(action==='restore')return this.submitRestore(row)
    if(action==='delete')return this.submitPageDelete(row)
    const texts=defaults(pageId),existing=await this.io.list(this.appId,pageId)
    if(action==='create'){
      if(FILES.some(name=>existing.includes(name)))throw new Error('FILE_EXISTS: 目标目录已有工具文件')
      const done:PageToolFileName[]=[]
      try{for(const name of FILES){this.assertCurrent();await this.io.upload({appId:this.appId,pageId,fileName:name,text:texts[name]});done.push(name)}}
      catch(error){if(!this.isUnknown(error)){for(const name of [...new Set([...done,...FILES])].reverse()){if(await this.io.read(this.appId,pageId,name)===texts[name])await this.io.remove(this.appId,pageId,name)}};throw error}
      return {...row,result:'created'}
    }
    for(const name of FILES){const text=await this.io.read(this.appId,pageId,name);if(text===texts[name])await this.io.remove(this.appId,pageId,name)}
    return {...row,result:'compensated'}
  }
  private async verify(row:DataRow):Promise<DataRow|undefined>{
    this.assertCurrent();const pageId=String(row['pageId']??''),action=parseAction(row['action']),texts=defaults(pageId)
    if(action==='snapshot')return this.verifySnapshot(row)
    if(action==='restore')return this.verifyRestore(row)
    if(action==='delete'){
      const customPath=String(row['customPath']??'')
      if(!this.isValidDeleteTarget(pageId,customPath))return undefined
      const remaining=await this.io.list(this.appId,pageId);this.assertCurrent()
      return remaining.length===0?{...row,result:'deleted'}:undefined
    }
    if(action==='compensate'){
      for(const name of FILES){const text=await this.io.read(this.appId,pageId,name);if(text===texts[name])await this.io.remove(this.appId,pageId,name)}
      const remaining=await Promise.all(FILES.map(name=>this.io.read(this.appId,pageId,name)))
      return remaining.every((text,index)=>{const name=FILES[index];return name===undefined||text===null||text!==texts[name]})?{...row,result:'compensated'}:undefined
    }
    const observed=await Promise.all(FILES.map(name=>this.io.read(this.appId,pageId,name)))
    if(FILES.every((name,index)=>confirmedText(observed[index]??null,texts[name])))return {...row,result:'created'}
    for(let index=0;index<FILES.length;index++){const name=FILES[index];if(name!==undefined&&observed[index]===texts[name])await this.io.remove(this.appId,pageId,name)}
    return undefined
  }
  private isValidDeleteTarget(pageId:string,customPath:string):boolean{return Boolean(pageId)&&!/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
    &&pageId===pageId.trim()&&pageId!=='.'&&pageId!=='..'&&customPath===customPath.trim()&&customPath===`${this.appId}/${pageId}`
    &&customPath.split('/').every(segment=>Boolean(segment)&&segment!=='.'&&segment!=='..'&&segment.trim()===segment)}
  private async submitPageDelete(row:DataRow):Promise<DataRow>{
    const pageId=String(row['pageId']??''),customPath=String(row['customPath']??'')
    if(!this.isValidDeleteTarget(pageId,customPath))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 页面目录身份无效')
    const names=await this.io.list(this.appId,pageId);this.assertCurrent()
    for(const name of names){
      if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 文件目录返回了非法名称')
      this.assertCurrent();await this.io.remove(this.appId,pageId,name)
    }
    const remaining=await this.io.list(this.appId,pageId);this.assertCurrent()
    if(remaining.length!==0)throw new Error('PAGE_TOOL_FILE_DELETE_UNCONFIRMED: 文件目录回读仍有残留')
    return {...row,result:'deleted'}
  }
  private async submitSnapshot(row:DataRow):Promise<DataRow>{
    const io=this.io,commandId=String(row['commandId']??''),pageId=String(row['pageId']??''),
      customPath=String(row['customPath']??''),fileName=row['fileName'],text=row['text'],guard=this.#snapshotGuards.get(commandId)
    if(!io.listVersions||!io.uploadVersion||!io.readVersion||!guard||!commandId||!pageId||!customPath||!isPageToolFileName(fileName)||typeof text!=='string') {
      throw new Error('PAGE_TOOL_SNAPSHOT_OWNER: 快照文件 owner 不可用或命令无效')
    }
    const check=()=>{this.assertCurrent();guard()}
    check()
    let version=this.#snapshotVersions.get(commandId)??Number(row['snapshotVersion'])
    if(!Number.isSafeInteger(version)||version<1){
      const versions=await io.listVersions({appId:this.appId,customPath,fileName});check()
      version=Math.max(0,...versions.map(item=>item.version))+1
      if(!Number.isSafeInteger(version)||version<1)throw new Error('PAGE_TOOL_SNAPSHOT_VERSION: 快照编号超出安全范围')
      this.#snapshotVersions.set(commandId,version)
    }
    const versionedFileName=`${version}__${String(fileName)}`
    const before=await io.listVersions({appId:this.appId,customPath,fileName});check()
    const already=before.some(item=>item.version===version&&item.fileName===versionedFileName)
    if(already){
      const content=await io.readVersion({appId:this.appId,customPath,fileName,version});check()
      if(content!==text)throw new Error(`PAGE_TOOL_SNAPSHOT_CONFLICT: ${versionedFileName} 已存在且内容不同`)
      return {...row,snapshotVersion:String(version),versionedFileName}
    }
    this.#snapshotAttemptCallbacks.get(commandId)?.({version,fileName:versionedFileName})
    check()
    await io.uploadVersion({appId:this.appId,customPath,fileName,version,text});check()
    const [after,content]=await Promise.all([
      io.listVersions({appId:this.appId,customPath,fileName}),
      io.readVersion({appId:this.appId,customPath,fileName,version}),
    ]);check()
    if(!after.some(item=>item.version===version&&item.fileName===versionedFileName)||content!==text) {
      throw new Error(`PAGE_TOOL_SNAPSHOT_UNCONFIRMED: ${versionedFileName} 上传后目录或原文回读不一致`)
    }
    return {...row,snapshotVersion:String(version),versionedFileName}
  }
  private async verifySnapshot(row:DataRow):Promise<DataRow|undefined>{
    const io=this.io,commandId=String(row['commandId']??''),guard=this.#snapshotGuards.get(commandId),
      version=this.#snapshotVersions.get(commandId),pageId=String(row['pageId']??''),customPath=String(row['customPath']??''),
      fileName=row['fileName'],text=row['text']
    if(!io.listVersions||!io.readVersion||!guard||!version||!isPageToolFileName(fileName)||typeof text!=='string'||!pageId||!customPath)return undefined
    const check=()=>{this.assertCurrent();guard()}
    check()
    const [versions,content]=await Promise.all([
      io.listVersions({appId:this.appId,customPath,fileName}),io.readVersion({appId:this.appId,customPath,fileName,version}),
    ]);check()
    const versionedFileName=`${version}__${String(fileName)}`
    if(!versions.some(item=>item.version===version&&item.fileName===versionedFileName)||content!==text)return undefined
    return {...row,snapshotVersion:String(version),versionedFileName}
  }
  private async submitRestore(row:DataRow):Promise<DataRow>{
    const io=this.io,commandId=String(row['commandId']??''),pageId=String(row['pageId']??''),customPath=String(row['customPath']??''),
      fileName=row['fileName'],version=Number(row['snapshotVersion']),text=row['text'],baselineText=row['baselineText'],guard=this.#restoreGuards.get(commandId)
    if(!io.listVersions||!io.readVersion||!guard||!commandId||!pageId||!customPath||!isPageToolFileName(fileName)
      ||!Number.isSafeInteger(version)||version<0||typeof text!=='string'||typeof baselineText!=='string')throw new Error('PAGE_TOOL_RESTORE_OWNER: 恢复命令无效')
    const check=()=>{this.assertCurrent();guard()};check()
    const versionedFileName=`${version}__${fileName}`
    const versions=await io.listVersions({appId:this.appId,customPath,fileName});check()
    if(!versions.some(item=>item.version===version&&item.fileName===versionedFileName))throw new Error('PAGE_TOOL_RESTORE_VERSION_MISSING: 目标版本不存在')
    const [versionText,currentText]=await Promise.all([
      io.readVersion({appId:this.appId,customPath,fileName,version}),io.read(this.appId,pageId,fileName),
    ]);check()
    if(versionText!==text)throw new Error('PAGE_TOOL_RESTORE_VERSION_CHANGED: 目标版本内容已改变')
    if(currentText!==baselineText)throw new Error('PAGE_TOOL_RESTORE_CONFLICT: 工作文件已改变')
    if(!io.restoreWorkingFile)throw new Error('PAGE_TOOL_RESTORE_OWNER: 工作文件替换适配器不可用')
    try{await io.restoreWorkingFile({appId:this.appId,pageId,fileName,text})}
    catch(error){if(isDefiniteRestoreRejection(error))throw error;throw unconfirmedRestoreWrite(error)}
    let restored:string|null
    try{this.assertCurrent();restored=await io.read(this.appId,pageId,fileName);this.assertCurrent()}
    catch(error){throw unconfirmedRestoreWrite(error)}
    if(restored!==text)throw unconfirmedRestoreWrite(new Error('恢复后工作文件回读不一致'))
    return row
  }
  private async verifyRestore(row:DataRow):Promise<DataRow|undefined>{
    const io=this.io,commandId=String(row['commandId']??''),pageId=String(row['pageId']??''),customPath=String(row['customPath']??''),
      fileName=row['fileName'],version=Number(row['snapshotVersion']),text=row['text']
    if(!io.listVersions||!io.readVersion||!pageId||!customPath||!commandId||!isPageToolFileName(fileName)
      ||!Number.isSafeInteger(version)||version<0||typeof text!=='string')return undefined
    this.assertCurrent()
    const versionedFileName=`${version}__${fileName}`
    const [versions,versionText,currentText]=await Promise.all([
      io.listVersions({appId:this.appId,customPath,fileName}),io.readVersion({appId:this.appId,customPath,fileName,version}),io.read(this.appId,pageId,fileName),
    ]);this.assertCurrent()
    if(!versions.some(item=>item.version===version&&item.fileName===versionedFileName)||versionText!==text||currentText!==text)return undefined
    this.#restoreReceiptsNeedingDelivery.add(commandId);this.#pendingUnknownActions.delete(commandId)
    return row
  }
  private isUnknown(error:unknown):boolean{return isRequestError(error)&&error.response===undefined}
  private assertNoPendingRestoreDelivery():void{
    if(this.hasPendingRestoreDelivery)throw new Error('PAGE_TOOL_RESTORE_DELIVERY_PENDING: 请先将已确认恢复结果交付到原 PageTool')
  }
}
