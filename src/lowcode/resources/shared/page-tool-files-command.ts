import {bindDataSetCommandSubmit, ensureDataSetFileCommandView, type DataSet, type DataRow} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {isRequestError} from '@spark-appworks/spark-utils'

const TABLE='PageToolFilesCommand'
const FILES=PAGE_TOOL_FILE_NAMES
type PageToolFileUploadCommand=Readonly<{appId:string;pageId:string;fileName:PageToolFileName;text:string}>
type FileIo=Readonly<{list:(appId:string,pageId:string)=>Promise<readonly string[]>;read:(appId:string,pageId:string,name:PageToolFileName)=>Promise<string|null>;upload:(command:PageToolFileUploadCommand)=>Promise<void>;remove:(appId:string,pageId:string,name:PageToolFileName)=>Promise<void>}>
type Action='create'|'compensate'
function parseAction(value:unknown):Action{
  if(value==='create'||value==='compensate')return value
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
  constructor(private readonly dataSet:DataSet,private readonly appId:string,private readonly io:FileIo,private readonly assertCurrent:()=>void){
    if(!appId.trim())throw new Error('page-tool-files 缺少 appId')
    this.view=ensureDataSetFileCommandView({dataSet,tableName:TABLE,resourceId:`page-tool-files:${appId}`,columns:[{name:'commandId',primary:true},{name:'action'},{name:'pageId'},{name:'parentId'}]})
    this.view.commitMode='staged'
    bindDataSetCommandSubmit(this.view,{resource:{resourceType:'file',resourceId:`page-tool-files:${appId}`},guard:assertCurrent,
      inputFields:['commandId','action','pageId'],createKey:()=>crypto.randomUUID(),
      submit:row=>this.submit(row),verify:row=>this.verify(row),isUnconfirmed:error=>this.isUnknown(error)})
  }
  public async create(parentId:string,pageId?:string):Promise<string>{return this.run('create',pageId??'',parentId)}
  public async compensateCreate(pageId:string,parentId:string):Promise<void>{await this.run('compensate',pageId,parentId)}
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
  private isUnknown(error:unknown):boolean{return isRequestError(error)&&error.response===undefined}
}
