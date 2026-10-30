import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {createPageFileDirectoryEntryView, createPageFileDirectoryView, createPageFileResourceView} from '@/services/project/page-tool-file-dataview'

const TABLE='ProjectToolFile'
const FILES=PAGE_TOOL_FILE_NAMES
export type PageFileOperationScope=Readonly<{dataSet:DataSet;appId:string;pageId:string;assertCurrent:()=>void}>
function defaults(pageId:string):Record<PageToolFileName,string>{const page=new PageTool({pageId});page.markLoaded();return {'rule.json':page.getFileText('rule.json'),'script.js':page.getFileText('script.js'),'style.css':page.getFileText('style.css')}}
function safeFileName(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value===value.trim()
  &&value!=='.'&&value!=='..'&&!/[\\/\u0000-\u001f\u007f]/.test(value)}
function assertPageTarget(input:PageFileOperationScope):void{
  input.assertCurrent()
  if(!input.appId.trim()||!input.pageId.trim()||input.pageId!==input.pageId.trim()||/[\\/%\u0000-\u001f\u007f?#]/.test(input.pageId)){
    throw new Error('PAGE_TOOL_FILE_SCOPE: 应用或工具身份无效')
  }
  if(input.dataSet.destroyed||!(input.dataSet.scenarioId??'').trim())throw new Error('PAGE_TOOL_FILE_DATASET: 正式 DataSet 不可用')
}
function assertDirectoryEntryNames(names:readonly unknown[]):asserts names is readonly string[]{
  const seen=new Set<string>()
  for(const name of names){
    if(!safeFileName(name)||seen.has(name))throw new Error('PAGE_TOOL_FILE_DIRECTORY: 文件目录含非法或重复 basename')
    seen.add(name)
  }
}
async function listDirectory(input:PageFileOperationScope):Promise<string[]>{
  assertPageTarget(input)
  const view=createPageFileDirectoryView(input)
  await view.refresh();assertPageTarget(input)
  if(view.loadingError)throw view.loadingError
  const names=view.rows.map(row=>row['fileName'])
  assertDirectoryEntryNames(names)
  return [...names]
}
export async function listPageToolFileNames(input:PageFileOperationScope):Promise<string[]>{return listDirectory(input)}
function fileView(input:PageFileOperationScope,fileName:string):DataView{
  assertPageTarget(input)
  if(fileName==='rule.json'||fileName==='script.js'||fileName==='style.css')return createPageFileResourceView({...input,fileName})
  return createPageFileDirectoryEntryView({...input,fileName})
}
async function commitFileView(input:PageFileOperationScope,view:DataView,id?:string|number):Promise<void>{
  assertPageTarget(input)
  const result=await input.dataSet.saveChanges({views:[{tableName:TABLE,viewId:view.viewId,...(id===undefined?{}:{ids:[id]})}]})
  assertPageTarget(input)
  if(!result.success)throw result.error??new Error(result.message??'ProjectToolFile DataView 保存未确认')
  if(view.hasUnconfirmedSave)throw new Error('PAGE_TOOL_FILE_UNKNOWN: 文件 DataView 回执仍待核验')
}
async function settleFileView(input:PageFileOperationScope,view:DataView):Promise<void>{
  if(view.hasUnconfirmedSave||view.dirtyTracking.hasPendingChanges()||view.hasEditingChanges())await commitFileView(input,view)
  if(view.hasUnconfirmedSave)throw new Error('PAGE_TOOL_FILE_UNKNOWN: 文件 DataView 原回执仍待核验')
}
function rowFor(view:DataView,pageId:string,fileName:string){
  return view.rows.find(row=>row['pageId']===pageId&&row['fileName']===fileName)
}

/** Create the three standard files through their formal FileResource DataViews. */
export async function createPageToolFiles(input:PageFileOperationScope,options:Readonly<{resume?:boolean}>={}):Promise<void>{
  assertPageTarget(input)
  const names=await listDirectory(input),texts=defaults(input.pageId)
  if(!options.resume&&FILES.some(name=>names.includes(name)))throw new Error('FILE_EXISTS: 目标目录已有工具文件')
  for(const fileName of FILES){
    assertPageTarget(input)
    const view=fileView(input,fileName)
    await settleFileView(input,view)
    view.queryContext={...view.queryContext,pageId:input.pageId,fileName,versionId:''}
    await view.refresh();assertPageTarget(input)
    if(view.loadingError)throw view.loadingError
    const existing=rowFor(view,input.pageId,fileName)
    if(existing){
      if(options.resume&&existing['text']===texts[fileName])continue
      throw new Error('FILE_EXISTS: 目标目录已有工具文件')
    }
    const added=await view.addRow({pageId:input.pageId,fileName,text:texts[fileName],versionId:'',localDirty:false})
    if('success'in added)throw new Error('PAGE_TOOL_FILE_CREATE: 无法暂存正式文件资源')
    const id=view.getPkKey(added)
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_CREATE: 新文件缺少正式身份')
    await commitFileView(input,view,id)
  }
}

/** Compensate only unchanged default files; preserve user edits, snapshots and extra files. */
export async function compensatePageToolFiles(input:PageFileOperationScope):Promise<void>{
  assertPageTarget(input)
  const texts=defaults(input.pageId)
  for(const fileName of FILES){
    assertPageTarget(input)
    const view=fileView(input,fileName)
    await settleFileView(input,view)
    view.queryContext={...view.queryContext,pageId:input.pageId,fileName,versionId:''}
    await view.refresh();assertPageTarget(input)
    if(view.loadingError)throw view.loadingError
    const row=rowFor(view,input.pageId,fileName)
    if(row?.['text']!==texts[fileName])continue
    const id=view.getPkKey(row)
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_COMPENSATE: 目标文件缺少正式身份')
    await view.removeRow(id)
    await commitFileView(input,view,id)
  }
}

/** Delete every basename returned by the formal file-directory view, including snapshots and extra files. */
export async function deletePageToolFiles(input:PageFileOperationScope):Promise<void>{
  assertPageTarget(input)
  const table=input.dataSet.getTable(TABLE)
  if(!table)throw new Error('PAGE_TOOL_FILE_MAPPING: 正式 ProjectToolFile DataTable 缺失')
  for(const view of table.viewList){
    if(view.queryContext['pageId']===input.pageId&&view.hasUnconfirmedSave)await settleFileView(input,view)
  }
  const names=await listDirectory(input)
  for(const fileName of names){
    assertPageTarget(input)
    const view=fileView(input,fileName)
    await settleFileView(input,view)
    view.queryContext={...view.queryContext,pageId:input.pageId,fileName,versionId:''}
    await view.refresh();assertPageTarget(input)
    if(view.loadingError)throw view.loadingError
    const row=rowFor(view,input.pageId,fileName)
    if(!row)continue
    const id=view.getPkKey(row)
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_DELETE: 文件行缺少正式身份')
    await view.removeRow(id)
    await commitFileView(input,view,id)
  }
  const remaining=await listDirectory(input)
  if(remaining.length)throw new Error(`PAGE_TOOL_FILE_DELETE_UNCONFIRMED: 目录仍有文件：${remaining.join(', ')}`)
}
