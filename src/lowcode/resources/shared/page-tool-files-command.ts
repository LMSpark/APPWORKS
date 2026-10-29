import {bindFileDirectoryQueryAdapter, bindDataSetCommandSubmit, ensureDataSetFileCommandView, type DataSet, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {isRequestError} from '@spark-appworks/spark-utils'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'

const TABLE='PageToolFilesCommand'
const FILES=PAGE_TOOL_FILE_NAMES
type PageToolFileUploadCommand=Readonly<{appId:string;pageId:string;fileName:PageToolFileName;text:string}>
type FileIo=Readonly<{list:(appId:string,pageId:string)=>Promise<readonly string[]>;read:(appId:string,pageId:string,name:PageToolFileName)=>Promise<string|null>;upload:(command:PageToolFileUploadCommand)=>Promise<void>;restoreWorkingFile?:(command:PageToolFileUploadCommand)=>Promise<void>;remove:(appId:string,pageId:string,name:string)=>Promise<void>}>
  & Partial<SnapshotFileIo>
type Action='create'|'compensate'|'restore'|'delete'
export type PageToolRestoreInput=Readonly<{
  pageId:string
  customPath:string
  fileName:PageToolFileName
  version:number
  baselineText:string
  /** 历史原文由正式文件 DataView 的 previewSourceVersion 读取。 */
  sourceText:string
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
const DIRECTORY_TABLE='PageToolFilesDirectory'
function isPageToolFileName(value:unknown):value is PageToolFileName{return FILES.some(name=>name===value)}
function parseAction(value:unknown):Action{
  if(value==='create'||value==='compensate'||value==='restore'||value==='delete')return value
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

/** PageTool-only file creation/deletion/restoration commands; ordinary reads and saves use DataView directly. */
export class PageToolFileCommands {
  readonly view
  readonly #restoreGuards=new Map<string,()=>void>()
  readonly #restoreReceiptsNeedingDelivery=new Set<string>()
  readonly #pendingUnknownActions=new Map<string,Action>()
  readonly directoryView:DataView
  constructor(private readonly dataSet:DataSet,private readonly appId:string,private readonly io:FileIo,private assertCurrent:()=>void){
    if(!appId.trim())throw new Error('page-tool-files 缺少 appId')
    this.view=ensureDataSetFileCommandView({dataSet,tableName:TABLE,resourceId:`page-tool-files:${appId}`,columns:[{name:'commandId',primary:true},{name:'action'},{name:'pageId'},{name:'parentId'},
      {name:'customPath'},{name:'fileName'},{name:'text'},{name:'snapshotVersion'},{name:'versionedFileName'},{name:'baselineText'}]})
    this.view.commitMode='staged'
    bindDataSetCommandSubmit(this.view,{resource:{resourceType:'file',resourceId:`page-tool-files:${appId}`},guard:()=>this.assertCurrent(),
      inputFields:['commandId','action','pageId','parentId','customPath','fileName','text','snapshotVersion','versionedFileName','baselineText'],createKey:()=>crypto.randomUUID(),
      submit:row=>this.submit(row),verify:row=>this.verify(row),isUnconfirmed:error=>this.isUnknown(error)})
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
  }
  public rebindScope(assertCurrent:()=>void):void{this.assertCurrent=assertCurrent}
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
  /** 将版本恢复作为原文件 DataView 命令提交；未知回执只核验原命令。 */
  public async restoreVersion(input:PageToolRestoreInput):Promise<string>{
    this.assertCurrent()
    const pageId=input.pageId.trim(),customPath=input.customPath.trim(),version=input.version
    if(!pageId||pageId!==input.pageId||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
      ||customPath!==input.customPath||customPath!==`${this.appId}/${pageId}`||/[\\%\u0000-\u001f\u007f?#]/.test(customPath)
      ||customPath.split('/').some(segment=>!segment||segment==='.'||segment==='..'||segment.trim()!==segment)
      ||!isPageToolFileName(input.fileName)||!Number.isSafeInteger(version)||version<0||typeof input.baselineText!=='string'||typeof input.sourceText!=='string')throw new Error('PAGE_TOOL_RESTORE_TARGET: 恢复目标无效')
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
      const text=input.sourceText
      const versionedFileName=`${version}__${input.fileName}`
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
  public get dirty():boolean{return this.hasPendingRestoreDelivery||this.view.rows.some(row=>{const id=this.view.getPkKey(row);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})}
  public get hasUnconfirmedSave():boolean{return this.view.hasUnconfirmedSave}
  public get hasPendingPageDelete():boolean{return this.view.rows.some(candidate=>candidate['action']==='delete'&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&(this.view.dirtyTracking.hasPendingChanges(id)||this.#pendingUnknownActions.get(String(id))==='delete')})())}
  public get hasPendingNonDeleteCommand():boolean{return this.view.rows.some(candidate=>candidate['action']!=='delete'&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&(this.view.dirtyTracking.hasPendingChanges(id)||this.#pendingUnknownActions.has(String(id)))})())}
  public pendingCommandForParent(parentId:string):Readonly<{action:'create'|'compensate';pageId:string}>|undefined{
    const row=this.view.rows.find(candidate=>candidate['parentId']===parentId&&(()=>{const id=this.view.getPkKey(candidate);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})())
    if(!row||!(row['action']==='create'||row['action']==='compensate'))return undefined
    return {action:row['action'],pageId:String(row['pageId']??'')}
  }
  public async save():Promise<void>{
    this.assertCurrent()
    const ids=this.view.rows.map(row=>this.view.getPkKey(row)).filter((id):id is string|number=>id!==undefined)
      .filter(id=>this.view.dirtyTracking.hasPendingChanges(id))
    if(ids.length===0&&!this.hasUnconfirmedSave)return
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,...(ids.length?{ids}:{})}]})
      if(!result.success)throw result.error??new Error(result.message??'page-tool-files DataView 保存失败')
      for(const id of ids)this.#pendingUnknownActions.delete(String(id))
    }catch(error){if(this.hasUnconfirmedSave)for(const id of ids){const row=this.view.rows.find(candidate=>this.view.getPkKey(candidate)===id);if(row)this.#pendingUnknownActions.set(String(id),parseAction(row['action']))}throw error}
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
