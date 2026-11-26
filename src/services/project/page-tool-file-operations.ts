import {listDetachedFileResourceDeletionTargets, listPendingFileResourceHistoryTargets, verifyDetachedFileResourceDeletion, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageTool, PAGE_TOOL_FILE_NAMES, ProjectToolResource, type PageToolFileName} from '@spark-appworks/spark-project-model'
import {createPageFileDirectoryEntryView, createPageFileDirectoryView, createPageFileResourceTarget, createPageFileResourceView, isSafePageToolFileBasename,
  isValidPageToolFilePageId,pageFileResourceViewId,type PageToolFileBindingScope} from '@/services/project/page-tool-file-dataview'

const TABLE='ProjectToolFile'
const FILES=PAGE_TOOL_FILE_NAMES
const WORKING_FILES=new Set<string>([...FILES,'publication-manifest.json'])
/** The command guard belongs to the current caller. The optional binding survives owner handoff for recovery. */
export type PageFileOperationScope=Readonly<{
  dataSet:DataSet
  appId:string
  pageId:string
  assertCurrent:()=>void
  viewScope?:PageToolFileBindingScope
}>

/** Read an exact working file or release pointer through the formal tool DataView. */
export async function readPageToolFileText(
  input: PageFileOperationScope & Readonly<{fileName: PageToolFileName; versionId?: string}>,
): Promise<string> {
  assertPageTarget(input)
  if (input.versionId !== undefined && !input.versionId.trim()) {
    throw new Error('PAGE_TOOL_FILE_VERSION_SCOPE: 发布指针不能为空')
  }
  const view = createPageFileResourceView({...input,...input.viewScope})
  await view.refresh()
  assertPageTarget(input)
  if (view.loadingError) throw view.loadingError
  const row = view.rows[0]
  if (view.rows.length !== 1 || !row || typeof row['text'] !== 'string') {
    throw new Error('PAGE_TOOL_FILE_MISSING: 未找到指定工具文件')
  }
  view.captureReadRow(row, ['text'])()
  return row['text']
}
function defaults(pageId:string):Record<PageToolFileName,string>{const page=new PageTool({pageId});page.markLoaded();return {'rule.json':page.getFileText('rule.json'),'script.js':page.getFileText('script.js'),'style.css':page.getFileText('style.css')}}
function assertPageTarget(input:PageFileOperationScope):void{
  input.assertCurrent()
  if(!input.appId.trim()||!isValidPageToolFilePageId(input.pageId)){
    throw new Error('PAGE_TOOL_FILE_SCOPE: 应用或工具身份无效')
  }
  if(input.dataSet.destroyed||!(input.dataSet.scenarioId??'').trim())throw new Error('PAGE_TOOL_FILE_DATASET: 正式 DataSet 不可用')
}
function assertDirectoryEntryNames(names:readonly unknown[]):asserts names is readonly string[]{
  const seen=new Set<string>()
  for(const name of names){
    if(!isSafePageToolFileBasename(name)||seen.has(name))throw new Error('PAGE_TOOL_FILE_DIRECTORY: 文件目录含非法或重复 basename')
    seen.add(name)
  }
}
/** Read the complete formal directory through its ProjectToolFile DataView. */
export async function listPageToolFileNames(input:PageFileOperationScope):Promise<string[]>{
  assertPageTarget(input)
  const view=createPageFileDirectoryView({...input,...input.viewScope})
  await view.refresh();assertPageTarget(input)
  if(view.loadingError)throw view.loadingError
  const names=view.rows.map(row=>row['fileName'])
  assertDirectoryEntryNames(names)
  return [...names]
}
function fileView(input:PageFileOperationScope,fileName:string):DataView{
  assertPageTarget(input)
  const target={...input,...input.viewScope,fileName}
  if(fileName==='rule.json'||fileName==='script.js'||fileName==='style.css')return createPageFileResourceView({...target,fileName})
  return createPageFileDirectoryEntryView(target)
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
async function loadSettledFileView(input:PageFileOperationScope,fileName:string):Promise<DataView>{
  assertPageTarget(input)
  const view=fileView(input,fileName)
  await settleFileView(input,view)
  assertPageTarget(input)
  view.queryContext={...view.queryContext,pageId:input.pageId,fileName,versionId:''}
  await view.refresh()
  assertPageTarget(input)
  if(view.loadingError)throw view.loadingError
  return view
}

type PendingPageToolFileCreate=Readonly<{fileName:PageToolFileName;viewId:string;id:string|number;batchId:string}>
/** 本次工具命令确认的文件身份，以及仍需按原 DataSet 保存批次核验的单次新增。 */
export type PageToolFileCreation={
  readonly target:Pick<PageFileOperationScope,'dataSet'|'appId'|'pageId'>
  readonly created:Map<PageToolFileName,string|number>
  pending:PendingPageToolFileCreate|undefined
}

export function beginPageToolFileCreation(input:PageFileOperationScope):PageToolFileCreation{
  assertPageTarget(input)
  return {target:{dataSet:input.dataSet,appId:input.appId,pageId:input.pageId},created:new Map(),pending:undefined}
}

function assertFileCreateTarget(input:PageFileOperationScope,creation:PageToolFileCreation):void{
  assertPageTarget(input)
  const target=creation.target
  if(target.dataSet!==input.dataSet||target.appId!==input.appId||target.pageId!==input.pageId){
    throw new Error('PAGE_TOOL_FILE_CREATE_SCOPE: 本次创建所属工具或 DataSet 已变化')
  }
}

function readFileCreateReceipt(input:PageFileOperationScope,pending:PendingPageToolFileCreate){
  const journal=input.dataSet.saveJournal
  const [entry]=journal.views
  if(journal.batchId!==pending.batchId||journal.views.length!==1||entry?.tableName!==TABLE||entry.viewId!==pending.viewId
    ||entry.ids.length!==1||entry.ids[0]!==pending.id){
    throw new Error('PAGE_TOOL_FILE_CREATE_RECEIPT: 原工具文件新增批次或行身份不匹配')
  }
  return entry
}

/** A pending create may only be settled from its original file save journal, including in the successor workspace. */
async function settleFileCreate(input:PageFileOperationScope,creation:PageToolFileCreation):Promise<'applied'|'not-applied'|undefined>{
  const pending=creation.pending
  if(!pending)return undefined
  assertFileCreateTarget(input,creation)
  let receipt=readFileCreateReceipt(input,pending)
  if(receipt.state==='unknown'){
    await input.dataSet.verifySaveJournal()
    assertFileCreateTarget(input,creation)
    receipt=readFileCreateReceipt(input,pending)
  }
  if(receipt.state==='applied')creation.created.set(pending.fileName,pending.id)
  else if(receipt.state==='not-applied')input.dataSet.discardSaveJournalNotApplied()
  else throw new Error('PAGE_TOOL_FILE_CREATE_UNKNOWN: 原工具文件新增仍待核验')
  creation.pending=undefined
  return receipt.state
}

/** Create each standard file exactly once for this tool command, verifying a captured result before proceeding. */
export async function createPageToolFiles(input:PageFileOperationScope,creation:PageToolFileCreation):Promise<void>{
  assertFileCreateTarget(input,creation)
  if(await settleFileCreate(input,creation)==='not-applied')throw new Error('PAGE_TOOL_FILE_CREATE_NOT_APPLIED: 原文件新增明确未应用')
  assertFileCreateTarget(input,creation)
  const names=await listPageToolFileNames(input),texts=defaults(input.pageId)
  if(FILES.some(name=>names.includes(name)&&!creation.created.has(name)))throw new Error('FILE_EXISTS: 目标目录已有工具文件')
  for(const fileName of FILES){
    assertFileCreateTarget(input,creation)
    const view=fileView(input,fileName)
    if(view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()){
      throw new Error('PAGE_TOOL_FILE_CREATE_PENDING: 工具文件仍有其他本地变更或原提交待核')
    }
    await view.refresh()
    assertFileCreateTarget(input,creation)
    if(view.loadingError)throw view.loadingError
    const existing=rowFor(view,input.pageId,fileName),confirmed=creation.created.get(fileName)
    if(confirmed!==undefined){
      if(!existing||view.getPkKey(existing)!==confirmed||existing['text']!==texts[fileName]){
        throw new Error('PAGE_TOOL_FILE_CREATE_STALE: 已确认新增的工具文件已变化')
      }
      continue
    }
    if(existing)throw new Error('FILE_EXISTS: 目标目录已有工具文件')
    const added=await view.addRow({pageId:input.pageId,fileName,text:texts[fileName],versionId:'',localDirty:false})
    if('success'in added)throw new Error('PAGE_TOOL_FILE_CREATE: 无法暂存正式文件资源')
    const id=view.getPkKey(added)
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_CREATE: 新文件缺少正式身份')
    assertFileCreateTarget(input,creation)
    try{
      const journal=input.dataSet.prepareSaveJournal({views:[{tableName:TABLE,viewId:view.viewId,ids:[id]}]})
      if(journal.batchId===null)throw new Error('PAGE_TOOL_FILE_CREATE_RECEIPT: 无法捕获原创建批次')
      creation.pending={fileName,viewId:view.viewId,id,batchId:journal.batchId}
    }catch(error){
      view.discardPendingChanges([id])
      throw error
    }
    await commitFileView(input,view,id)
    if(await settleFileCreate(input,creation)!=='applied')throw new Error('PAGE_TOOL_FILE_CREATE_RECEIPT: 本次新增缺少原保存回执')
  }
}

/** Compensate only working files confirmed by this create command under their original formal key. */
export async function compensatePageToolFiles(input:PageFileOperationScope,creation:PageToolFileCreation):Promise<void>{
  assertFileCreateTarget(input,creation)
  await settleFileCreate(input,creation)
  const texts=defaults(input.pageId)
  for(const [fileName,id]of creation.created){
    assertPageToolFileDeletionReady(input)
    const view=await loadSettledFileView(input,fileName)
    assertFileCreateTarget(input,creation)
    const row=rowFor(view,input.pageId,fileName)
    if(row?.['text']===texts[fileName]&&view.getPkKey(row)===id){
      assertPageToolFileDeletionReady(input)
      await view.removeRow(id)
      assertPageToolFileDeletionReady(input)
      await commitFileView(input,view,id)
    }
    creation.created.delete(fileName)
  }
}

/** 从当前 DataSet 的原 FileResource 检查未决工作快照，可限定应用和工具。 */
export function findPendingPageToolFileHistory(dataSet:DataSet,target?:Pick<PageFileOperationScope,'appId'|'pageId'>):string|undefined{
  for(const pending of listPendingFileResourceHistoryTargets(dataSet,ProjectToolResource.resources.ProjectToolFile)){
    const {fileName,versionId}=pending.fields
    if(versionId!==''||typeof fileName!=='string'||!WORKING_FILES.has(fileName))continue
    if(target&&pending.key!==createPageFileResourceTarget({...target,fileName}).key)continue
    return fileName
  }
  return undefined
}

/** Verify the mounted tool's current working file states without creating or rebinding a view. */
export function assertPageToolFileDeletionReady(input:PageFileOperationScope):void{
  assertPageTarget(input)
  const manifest=input.dataSet.getView(TABLE,pageFileResourceViewId(input.pageId,'publication-manifest.json'))
  if(manifest&&(manifest.mutating||manifest.hasUnconfirmedSave||manifest.hasEditingChanges()||manifest.dirtyTracking.hasPendingChanges())){
    throw new Error('PAGE_TOOL_FILE_PENDING: 工作发布清单仍有本地改动或原提交待核')
  }
  const fileName=findPendingPageToolFileHistory(input.dataSet,input)
  if(fileName!==undefined)throw new Error(`PAGE_TOOL_FILE_PENDING: 工作文件 ${fileName} 的原快照仍在提交或待核`)
}

/** 在提交蓝图节点删除前核工作清单状态和正式文件目录，原保存与历史回执沿各自入口核验。 */
export async function preparePageToolFileDeletion(input:PageFileOperationScope):Promise<void>{
  assertPageToolFileDeletionReady(input)
  await listPageToolFileNames(input)
  assertPageToolFileDeletionReady(input)
}

/** Recover exact original deletions before handling the current directory or its remaining references. */
async function settleDetachedFileDeletes(input:PageFileOperationScope):Promise<void>{
  for(const target of listDetachedFileResourceDeletionTargets(input.dataSet,ProjectToolResource.resources.ProjectToolFile)){
    const {fileName,versionId}=target.fields
    if(versionId!==''||typeof fileName!=='string'||target.key!==createPageFileResourceTarget({...input,fileName}).key)continue
    const view=fileView(input,fileName)
    const confirmed=await verifyDetachedFileResourceDeletion(view,target)
    assertPageTarget(input)
    if(!confirmed)throw new Error('PAGE_TOOL_FILE_DELETE_RECOVERY: 原文件删除结果仍待核验')
    input.dataSet.settleConfirmedDetachedSaves()
    assertPageTarget(input)
    view.acknowledgeSourceWriteAttempt()
  }
}

/** 工具仍被引用时停止目录清理，只核验已捕获的原删除。 */
export async function retainSharedPageToolFiles(input:PageFileOperationScope):Promise<void>{
  assertPageTarget(input)
  await settleDetachedFileDeletes(input)
  assertPageTarget(input)
  const table=input.dataSet.getTable(TABLE)
  if(!table)throw new Error('PAGE_TOOL_FILE_MAPPING: 正式 ProjectToolFile DataTable 缺失')
  const pending=table.viewList.filter(view=>view.queryContext['appId']===input.appId&&view.queryContext['pageId']===input.pageId
    &&view.queryContext['versionId']===''&&view.dirtyTracking.pendingDeleteIds.size>0)
  if(pending.length===0)return
  const [view]=pending
  const journal=input.dataSet.saveJournal
  const [receipt]=journal.views
  if(pending.length!==1||!view||journal.views.length!==1||receipt?.tableName!==TABLE||receipt.viewId!==view.viewId
    ||receipt.ids.length!==view.dirtyTracking.pendingDeleteIds.size||receipt.ids.some(id=>!view.dirtyTracking.pendingDeleteIds.has(id))){
    throw new Error('PAGE_TOOL_FILE_DELETE_RECOVERY: 工具仍被引用，需先核验原文件删除')
  }
  const confirmed=receipt.state==='unknown'?(await input.dataSet.verifySaveJournal()).views[0]:receipt
  assertPageTarget(input)
  if(input.dataSet.saveJournal.batchId!==journal.batchId){
    throw new Error('PAGE_TOOL_FILE_DELETE_RECOVERY: 原文件删除批次已变化')
  }
  if(confirmed?.state==='applied')return
  if(confirmed?.state!=='not-applied')throw new Error('PAGE_TOOL_FILE_DELETE_RECOVERY: 工具仍被引用，原文件删除结果待核')
  input.dataSet.discardSaveJournalNotApplied()
}

/** Delete every basename returned by the formal file-directory view, including snapshots and extra files. */
export async function deletePageToolFiles(input:PageFileOperationScope):Promise<void>{
  assertPageToolFileDeletionReady(input)
  await settleDetachedFileDeletes(input)
  const table=input.dataSet.getTable(TABLE)
  if(!table)throw new Error('PAGE_TOOL_FILE_MAPPING: 正式 ProjectToolFile DataTable 缺失')
  for(const view of table.viewList){
    if(view.queryContext['pageId']===input.pageId&&view.hasUnconfirmedSave)await settleFileView(input,view)
  }
  const names=await listPageToolFileNames(input)
  assertPageToolFileDeletionReady(input)
  for(const fileName of names){
    assertPageTarget(input)
    const view=await loadSettledFileView(input,fileName)
    assertPageTarget(input)
    const row=rowFor(view,input.pageId,fileName)
    if(!row)continue
    const id=view.getPkKey(row)
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_DELETE: 文件行缺少正式身份')
    assertPageToolFileDeletionReady(input)
    await view.removeRow(id)
    assertPageToolFileDeletionReady(input)
    await commitFileView(input,view,id)
  }
  const remaining=await listPageToolFileNames(input)
  if(remaining.length)throw new Error(`PAGE_TOOL_FILE_DELETE_UNCONFIRMED: 目录仍有文件：${remaining.join(', ')}`)
}
