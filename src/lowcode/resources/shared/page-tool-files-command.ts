import {bindDataSetCommandSubmit, ensureDataSetFileCommandView, type DataSet, type DataRow} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {isRequestError} from '@spark-appworks/spark-utils'

const TABLE='PageToolFilesCommand'
const FILES=PAGE_TOOL_FILE_NAMES
type PageToolFileUploadCommand=Readonly<{appId:string;pageId:string;fileName:PageToolFileName;text:string}>
type FileIo=Readonly<{list:(appId:string,pageId:string)=>Promise<readonly string[]>;read:(appId:string,pageId:string,name:PageToolFileName)=>Promise<string|null>;upload:(command:PageToolFileUploadCommand)=>Promise<void>;remove:(appId:string,pageId:string,name:PageToolFileName)=>Promise<void>}>
  & Partial<SnapshotFileIo>
type Action='create'|'compensate'|'snapshot'
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
function isPageToolFileName(value:unknown):value is PageToolFileName{return FILES.some(name=>name===value)}
function parseAction(value:unknown):Action{
  if(value==='create'||value==='compensate'||value==='snapshot')return value
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
  readonly #snapshotVersions=new Map<string,number>()
  readonly #snapshotGuards=new Map<string,()=>void>()
  readonly #snapshotAttemptCallbacks=new Map<string,(result:PageToolSnapshotResult)=>void>()
  readonly #snapshotReceiptsNeedingDelivery=new Set<string>()
  constructor(private readonly dataSet:DataSet,private readonly appId:string,private readonly io:FileIo,private readonly assertCurrent:()=>void){
    if(!appId.trim())throw new Error('page-tool-files 缺少 appId')
    this.view=ensureDataSetFileCommandView({dataSet,tableName:TABLE,resourceId:`page-tool-files:${appId}`,columns:[{name:'commandId',primary:true},{name:'action'},{name:'pageId'},{name:'parentId'},
      {name:'customPath'},{name:'fileName'},{name:'text'},{name:'snapshotVersion'},{name:'versionedFileName'}]})
    this.view.commitMode='staged'
    bindDataSetCommandSubmit(this.view,{resource:{resourceType:'file',resourceId:`page-tool-files:${appId}`},guard:assertCurrent,
      inputFields:['commandId','action','pageId','parentId','customPath','fileName','text','snapshotVersion','versionedFileName'],createKey:()=>crypto.randomUUID(),
      submit:row=>this.submit(row),verify:row=>this.verify(row),isUnconfirmed:error=>this.isUnknown(error)})
  }
  public async create(parentId:string,pageId?:string):Promise<string>{return this.run('create',pageId??'',parentId)}
  public async compensateCreate(pageId:string,parentId:string):Promise<void>{await this.run('compensate',pageId,parentId)}
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
    }catch(error){throw error}
    try{this.assertCurrent();input.assertCurrent()}
    catch(error){this.#snapshotReceiptsNeedingDelivery.add(commandId);throw error}
    this.#snapshotReceiptsNeedingDelivery.add(commandId)
    const confirmed=this.view.rows.find(candidate=>candidate['commandId']===commandId)
    const version=Number(confirmed?.['snapshotVersion']),fileName=String(confirmed?.['versionedFileName']??'')
    if(!Number.isSafeInteger(version)||version<1||fileName!==`${version}__${input.fileName}`)throw new Error('PAGE_TOOL_SNAPSHOT_RECEIPT: DataView 未返回有效快照回执')
    this.#snapshotReceiptsNeedingDelivery.delete(commandId);this.#snapshotGuards.delete(commandId);this.#snapshotVersions.delete(commandId)
    this.#snapshotAttemptCallbacks.delete(commandId)
    return {version,fileName}
  }
  public hasPendingCommandForParent(parentId:string):boolean{return this.pendingCommandForParent(parentId)!==undefined}
  public get dirty():boolean{return this.view.rows.some(row=>{const id=this.view.getPkKey(row);return id!==undefined&&this.view.dirtyTracking.hasPendingChanges(id)})}
  public get hasUnconfirmedSave():boolean{return this.view.hasUnconfirmedSave}
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
    const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,...(ids.length?{ids}:{})}]})
    if(!result.success)throw result.error??new Error(result.message??'page-tool-files DataView 保存失败')
  }
  private async run(action:Action,pageId:string,parentId:string):Promise<string>{
    this.assertCurrent();const parent=parentId.trim();if(!parent)throw new Error('FILE_SCOPE: parentId 不能为空')
    let created=this.view.rows.find(row=>row['action']===action&&row['parentId']===parent&&(()=>{const key=this.view.getPkKey(row);return key!==undefined&&this.view.dirtyTracking.hasPendingChanges(key)})())
    if(!created){await this.view.refresh();this.assertCurrent()}
    if(!created){const normalized=pageId.trim()||`child-${crypto.randomUUID()}`
      created=undefined
      const added=await this.view.addRow({commandId:crypto.randomUUID(),action,pageId:normalized,parentId:parent});if('success' in added)throw new Error('page-tool-files command row could not be created');created=added}
    const normalized=String(created['pageId']??''),id=this.view.getPkKey(created)
    if(!normalized||typeof id!=='string'||!id)throw new Error('page-tool-files 缺少命令身份')
    try{
      const result=await this.dataSet.saveChanges({views:[{tableName:this.view.tableName,viewId:this.view.viewId,ids:[id]}]})
      if(!result.success)throw result.error??new Error(result.message??'page-tool-files 命令失败')
    }catch(error){if(error instanceof Error&&/^(FILE_EXISTS|FILE_SCOPE):/.test(error.message)&&this.view.dirtyTracking.hasPendingChanges(id))await this.view.removeRow(id);throw error}
    return normalized
  }
  private async submit(row:DataRow):Promise<DataRow>{
    this.assertCurrent();const pageId=String(row['pageId']??''),action=parseAction(row['action'])
    if(action==='snapshot')return this.submitSnapshot(row)
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
