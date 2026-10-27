import {DataViewLocalQuery, bindDataSetCommandSubmit, ensureDataSetFileCommandView, type DataSet, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {isRequestError} from '@spark-appworks/spark-utils'

const TABLE='PageToolFilesCommand'
const FILES=PAGE_TOOL_FILE_NAMES
type PageToolFileUploadCommand=Readonly<{appId:string;pageId:string;fileName:PageToolFileName;text:string}>
type FileIo=Readonly<{list:(appId:string,pageId:string)=>Promise<readonly string[]>;read:(appId:string,pageId:string,name:PageToolFileName)=>Promise<string|null>;upload:(command:PageToolFileUploadCommand)=>Promise<void>;remove:(appId:string,pageId:string,name:string)=>Promise<void>}>
  & Partial<SnapshotFileIo>
type Action='create'|'compensate'|'snapshot'|'delete'
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
type FileVersion=Readonly<{version:number;fileName:string;lastModified:number|null}>
type FileVersionListCommand=Readonly<{appId:string;customPath:string;fileName:PageToolFileName}>
type FileVersionReadCommand=Readonly<{appId:string;customPath:string;fileName:PageToolFileName;version:number}>
type FileVersionWriteCommand=FileVersionReadCommand&Readonly<{text:string}>
type SnapshotFileIo=Readonly<{
  listVersions:(command:FileVersionListCommand)=>Promise<readonly FileVersion[]>
  uploadVersion:(command:FileVersionWriteCommand)=>Promise<void>
  readVersion:(command:FileVersionReadCommand)=>Promise<string|null>
}>
type FileSaveExecutor=Parameters<DataView['bindQueryExecutor']>[0]
type FileSaveCommand=Parameters<NonNullable<FileSaveExecutor['save']>>[0]
type FileSaveReceipt=Awaited<ReturnType<NonNullable<FileSaveExecutor['save']>>>[number]
type PageToolFileSaveInput=Readonly<{page:PageTool;fileName:PageToolFileName;text:string;revision:number;assertCurrent:()=>void}>
const SAVE_TABLE='PageToolFileSave'
function isPageToolFileName(value:unknown):value is PageToolFileName{return FILES.some(name=>name===value)}
function parseAction(value:unknown):Action{
  if(value==='create'||value==='compensate'||value==='snapshot'||value==='delete')return value
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

/** File resource command owner; page identity and request guard are captured per command. */
export class PageToolFilesDataView {
  readonly view
  public get ownerDataSet():DataSet{return this.dataSet}
  readonly #snapshotVersions=new Map<string,number>()
  readonly #snapshotGuards=new Map<string,()=>void>()
  readonly #snapshotAttemptCallbacks=new Map<string,(result:PageToolSnapshotResult)=>void>()
  readonly #snapshotReceiptsNeedingDelivery=new Set<string>()
  readonly #pendingUnknownActions=new Map<string,Action>()
  readonly saveView:DataView
  #savingFileView=false
  readonly #fileSavePending=new Map<string,Readonly<{page:PageTool;fileName:PageToolFileName;text:string;baseline:string;revision:number;context:object;guard:()=>void}>>()
  readonly #fileSaveAttempts=new Map<string,PageToolFileSaveInput>()
  constructor(private readonly dataSet:DataSet,private readonly appId:string,private readonly io:FileIo,private readonly assertCurrent:()=>void){
    if(!appId.trim())throw new Error('page-tool-files 缺少 appId')
    this.view=ensureDataSetFileCommandView({dataSet,tableName:TABLE,resourceId:`page-tool-files:${appId}`,columns:[{name:'commandId',primary:true},{name:'action'},{name:'pageId'},{name:'parentId'},
      {name:'customPath'},{name:'fileName'},{name:'text'},{name:'snapshotVersion'},{name:'versionedFileName'}]})
    this.view.commitMode='staged'
    bindDataSetCommandSubmit(this.view,{resource:{resourceType:'file',resourceId:`page-tool-files:${appId}`},guard:assertCurrent,
      inputFields:['commandId','action','pageId','parentId','customPath','fileName','text','snapshotVersion','versionedFileName'],createKey:()=>crypto.randomUUID(),
      submit:row=>this.submit(row),verify:row=>this.verify(row),isUnconfirmed:error=>this.isUnknown(error)})
    const saveTable=dataSet.getTable(SAVE_TABLE)??dataSet.addTable(SAVE_TABLE,[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},{name:'text',type:'string'},{name:'revision',type:'string'}])
    if(saveTable.modelBinding!==undefined||(saveTable.resourceType!==undefined&&saveTable.resourceType!=='file'))throw new Error('PAGE_TOOL_FILE_SAVE_IDENTITY: 保存表不是file资源')
    saveTable.resourceType='file';saveTable.resourceId=`page-tool-files-save:${appId}`
    const saveView=dataSet.getView(SAVE_TABLE,'default')
    if(!saveView)throw new Error('PAGE_TOOL_FILE_SAVE_VIEW: 保存视图缺失')
    saveView.commitMode='staged';this.saveView=saveView
    const contexts=new WeakMap<object,Readonly<{view:DataView;rows:readonly DataRow[]}>>()
    const makeResult=(view:DataView,rows:readonly DataRow[])=>{
      const selected=DataViewLocalQuery.select({rows,fields:new Set(['fileKey','pageId','fileName','text','revision']),primaryKeys:['fileKey'],params:{page:1,allPages:true,treeMode:'flat'}})
      const keys=new Set(selected.rows.map(row=>String(row['fileKey'])))
      const result={rows:selected.rows,total:selected.total,rowKey:(row:Readonly<Record<string,unknown>>)=>row['fileKey'],
        assertIdentity:()=>this.assertCurrent(),fieldAccess:(key:unknown,field:string)=>{const visible=keys.has(String(key))&&['fileKey','pageId','fileName','text','revision'].includes(field),write=visible&&field==='text';return {read:visible?'visible' as const:'invisible' as const,write:write?'allowed' as const:'denied' as const,component:!visible?'hidden' as const:write?'editable' as const:'readonly' as const,required:false,writeMode:write?'editable' as const:'readonly' as const}},
        readFieldAccess:(row:Readonly<Record<string,unknown>>,field:string)=>selected.rows.includes(row)&&['fileKey','pageId','fileName','text','revision'].includes(field)?'visible' as const:'invisible' as const,
        addActionState:()=> 'disabled' as const,editActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const,deleteActionState:()=> 'disabled' as const,createChildActionState:()=> 'disabled' as const,viewActionState:(key:unknown)=>keys.has(String(key))?'enabled' as const:'disabled' as const}
      contexts.set(result,{view,rows});return result
    }
    const executor:FileSaveExecutor={localAggregates:false,executeQuery:async view=>{this.assertCurrent();const pageId=String(view.queryContext['pageId']??''),fileName=view.queryContext['fileName'];
      if(!pageId||!isPageToolFileName(fileName))throw new Error('PAGE_TOOL_FILE_SAVE_QUERY_SCOPE: 查询需绑定页面和文件')
      const text=await this.io.read(this.appId,pageId,fileName);this.assertCurrent();if(text===null)throw new Error('PAGE_TOOL_FILE_SAVE_MISSING: 文件不存在')
      return makeResult(view,[{fileKey:JSON.stringify([this.appId,pageId,fileName]),pageId,fileName,text,revision:'0'}])},save:command=>this.saveFileChanges(command,contexts,makeResult),
      hasUnconfirmedSave:context=>[...this.#fileSavePending.values()].some(item=>item.context===context),abandonUnconfirmedSave:context=>{for(const [key,item] of this.#fileSavePending)if(item.context===context)this.#fileSavePending.delete(key)}}
    saveView.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:`page-tool-files-save:${appId}`}})
  }
  public async savePageFile(input:PageToolFileSaveInput):Promise<void>{
    if(this.#savingFileView)throw new Error('PAGE_TOOL_FILE_SAVE_PENDING: 当前文件DataView正在处理另一目标')
    this.#savingFileView=true
    try{await this.savePageFileCore(input)}finally{this.#savingFileView=false}
  }
  private async savePageFileCore(input:PageToolFileSaveInput):Promise<void>{
    this.assertCurrent();input.assertCurrent()
    const pageId=input.page.pageId,name=input.fileName
    if(input.page.isLoaded===false||pageId.length===0||pageId!==pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)||!isPageToolFileName(name)
      ||typeof input.text!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 页面/文件/revision 无效')
    const key=JSON.stringify([this.appId,pageId,name]), pending=this.#fileSavePending.get(key)
    if(pending&&pending.page!==input.page)throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 原PageTool身份已变化，不能替代核验')
    if(pending){const row=this.saveView.rows.find(item=>item['pageId']===pageId&&item['fileName']===name);if(!row)throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 原查询行丢失')
      const id=this.saveView.getPkKey(row);if(id===undefined)throw new Error('PAGE_TOOL_FILE_SAVE_UNKNOWN: 原查询行身份丢失')
      const result=await this.dataSet.saveChanges({views:[{tableName:SAVE_TABLE,viewId:'default',ids:[id]}]});if(!result.success)throw result.error??new Error(result.message??'文件原提交核验失败');return}
    this.saveView.queryContext={...this.saveView.queryContext,appId:this.appId,pageId,fileName:name}
    await this.saveView.refresh();this.assertCurrent();input.assertCurrent()
    const row=this.saveView.rows.find(item=>item['pageId']===pageId&&item['fileName']===name)
    if(!row)throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 提交行丢失')
    try{
      const id=this.saveView.getPkKey(row);if(id===undefined)throw new Error('PAGE_TOOL_FILE_SAVE_ROW: 查询结果缺少稳定身份')
      if(row['text']!==input.page.getSavedFileText(name))throw new Error('PAGE_TOOL_FILE_CONFLICT: DataView读取基线与PageTool保存基线不一致')
      await this.saveView.editRowById(id,{text:input.text,revision:String(input.revision)})
      this.#fileSaveAttempts.set(key,input)
      const outcome=await this.dataSet.saveChanges({views:[{tableName:SAVE_TABLE,viewId:'default',ids:[id]}]})
      this.assertCurrent();input.assertCurrent();if(!outcome.success)throw outcome.error??new Error(outcome.message??'文件保存未确认')
      input.page.markFileSaved(name,input.text)
    }catch(error){throw error}finally{this.#fileSaveAttempts.delete(key)}
  }
  private async saveFileChanges(command:FileSaveCommand,contexts:WeakMap<object,Readonly<{view:DataView;rows:readonly DataRow[]}>>,makeResult:(view:DataView,rows:readonly DataRow[])=>Awaited<ReturnType<FileSaveExecutor['executeQuery']>>):Promise<FileSaveReceipt[]>{
    this.assertCurrent();const receipts:FileSaveReceipt[]=[]
    for(const change of command.changes){
      const context=contexts.get(change.context),original=context?.rows[0],submitted=change.changes.changed?.[0]
      if(context===undefined||original===undefined||submitted===undefined||(change.changes.added?.length??0)>0||(change.changes.deleted?.length??0)>0||change.changes.changed?.length!==1)throw new Error('PAGE_TOOL_FILE_SAVE_CHANGE: 提交必须匹配单文件更新')
      const pageId=String(submitted['pageId']??''),name=submitted['fileName'],text=submitted['text'],revision=Number(submitted['revision'])
      if(pageId!==String(original['pageId'])||name!==original['fileName']||!isPageToolFileName(name)||typeof text!=='string'||!Number.isSafeInteger(revision))throw new Error('PAGE_TOOL_FILE_SAVE_SCOPE: 提交身份或revision改变')
      const key=JSON.stringify([this.appId,pageId,name]),pending=this.#fileSavePending.get(key)
      const check=()=>{this.assertCurrent();pending?.guard()}
      check()
      if(pending){
        const remote=await this.io.read(this.appId,pageId,name);check()
        if(remote===pending.text){pending.page.markFileSaved(name,pending.text);this.#fileSavePending.delete(key)}
        else if(remote===pending.baseline)this.#fileSavePending.delete(key)
        else throw new Error('PAGE_TOOL_FILE_CONFLICT: 远端与原提交及原基线不一致')
        if(remote!==pending.text)throw new Error('PAGE_TOOL_FILE_NOT_APPLIED: 原提交未应用，保留草稿')
      }else{
        const baseline=await this.io.read(this.appId,pageId,name);check()
        if(baseline===null)throw new Error('PAGE_TOOL_FILE_MISSING: 目标文件不存在')
        if(typeof original['text']!=='string'||baseline!==original['text'])throw new Error('PAGE_TOOL_FILE_CONFLICT: 远端已不同于查询基线')
        const attempt=this.#fileSaveAttempts.get(key)
        if(attempt?.page.pageId!==pageId||attempt.revision!==revision||attempt.text!==text)throw new Error('PAGE_TOOL_FILE_SAVE_ATTEMPT: 缺少同一活跃PageTool及revision提交上下文')
        try{await this.io.upload({appId:this.appId,pageId,fileName:name,text})}
        catch(error){if(this.isUnknown(error))this.#fileSavePending.set(key,{page:attempt.page,fileName:name,text,baseline,revision,context:change.context,guard:attempt.assertCurrent});throw error}
        try{
          check()
          const readback=await this.io.read(this.appId,pageId,name);check()
          if(readback!==text)throw new Error('PAGE_TOOL_FILE_READBACK: 文件保存回读不一致')
        }catch(error){this.#fileSavePending.set(key,{page:attempt.page,fileName:name,text,baseline,revision,context:change.context,guard:attempt.assertCurrent});throw error}
        attempt.page.markFileSaved(name,text)
      }
      const saved={...submitted}
      receipts.push({metaName:context.view.tableName,added:[],changed:[saved],deleted:[],changedFields:[['text','revision']],context:makeResult(context.view,[saved])})
    }
    return receipts
  }
  public async create(parentId:string,pageId?:string):Promise<string>{return this.run('create',pageId??'',parentId)}
  public async compensateCreate(pageId:string,parentId:string):Promise<void>{await this.run('compensate',pageId,parentId)}
  /** Read and validate the whole page directory before another resource is mutated. */
  public async preflightDeletePageFiles(pageId:string,customPath:string):Promise<void>{
    this.assertCurrent()
    if(!this.isValidDeleteTarget(pageId,customPath))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 页面目录身份无效')
    const names=await this.io.list(this.appId,pageId)
    this.assertCurrent()
    for(const name of names){
      if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\u0000-\u001f\u007f]/.test(name))throw new Error('PAGE_TOOL_FILE_DELETE_SCOPE: 文件目录返回了非法名称')
    }
  }
  /** Delete a complete mounted page directory through the shared file command DataView. */
  public async deletePageFiles(pageId:string,customPath:string):Promise<void>{
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
    const pageId=input.pageId.trim(),customPath=input.customPath.trim()
    if(!pageId||pageId!==input.pageId||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
      ||customPath!==input.customPath||!customPath.startsWith(`${this.appId}/`)||/[\\%\u0000-\u001f\u007f?#]/.test(customPath)
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
  public hasPendingCommandForParent(parentId:string):boolean{return this.pendingCommandForParent(parentId)!==undefined}
  public get dirty():boolean{return this.view.rows.some(row=>{const id=this.view.getPkKey(row);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})||this.saveView.dirtyTracking.hasPendingChanges()}
  public get hasUnconfirmedSave():boolean{return this.view.hasUnconfirmedSave||this.saveView.hasUnconfirmedSave}
  public get hasPendingFileSave():boolean{return this.saveView.hasUnconfirmedSave||this.saveView.dirtyTracking.hasPendingChanges()}
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
    if(!this.hasPendingFileSave)return
    const ids=this.saveView.rows.map(row=>this.saveView.getPkKey(row)).filter((id):id is string|number=>id!==undefined&&this.saveView.dirtyTracking.hasPendingChanges(id))
    const result=await this.dataSet.saveChanges({views:[{tableName:SAVE_TABLE,viewId:'default',...(ids.length?{ids}:{})}]})
    if(!result.success)throw result.error??new Error(result.message??'工具文件DataView保存未确认')
  }
  private async run(action:Action,pageId:string,parentId:string):Promise<string>{
    this.assertCurrent();const parent=parentId.trim();if(!parent)throw new Error('FILE_SCOPE: parentId 不能为空')
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
  private isUnknown(error:unknown):boolean{return isRequestError(error)&&error.response===undefined}
}
