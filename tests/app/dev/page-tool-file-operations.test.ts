import {describe,expect,it,vi} from 'vitest'
import { LowcodeDesignApi } from '@/platform-adapters/api'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-data'
import {ProjectWorkspace, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import appConfig from '../../../config/pages/application/project-blueprint/pagedata.json'
import {LowcodeDataSpaceAssembler} from '../../../src/platform-adapters/data-space/lowcode-data-space-assembler'
import {createPageFileDirectoryEntryView,createPageFileResourceView,createPagePublicationManifestFileView,createPageToolFileResourceExecutor} from '../../../src/services/project/page-tool-file-dataview'
import {beginPageToolFileCreation,compensatePageToolFiles,createPageToolFiles,deletePageToolFiles,findPendingPageToolFileHistory,listPageToolFileNames,retainSharedPageToolFiles,type PageFileOperationScope} from '../../../src/services/project/page-tool-file-operations'
import type {createPageToolFilesIo} from '../../../src/platform-adapters/lowcode-runtime'

const storage=vi.hoisted(()=>({io:undefined as unknown}))
vi.mock('@/platform-adapters/lowcode-runtime',async importOriginal=>({...await importOriginal<typeof import('@/platform-adapters/lowcode-runtime')>(),createPageToolFilesIo:()=>storage.io}))

function timeoutAfterAccept():Error{const error=new Error('timeout after accept');error.name='RequestError';Object.assign(error,{config:{url:'/test'}});return error}
function createScope(files:Map<string,string>,remove:(appId:string,pageId:string,fileName:string)=>Promise<void>):
  PageFileOperationScope & Readonly<{io:ReturnType<typeof createPageToolFilesIo>}>{
  const io={list:vi.fn(async(_appId:string,pageId:string)=>[...files.keys()].filter(path=>path.startsWith(`${pageId}/`)).map(path=>path.slice(pageId.length+1))),
    read:vi.fn(async(_appId:string,pageId:string,fileName:string)=>files.get(`${pageId}/${fileName}`)??null),
    upload:vi.fn(async({pageId,fileName,text}:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${pageId}/${fileName}`,text)}),
    remove:vi.fn(async(appId:string,pageId:string,fileName:string)=>remove(appId,pageId,fileName)),
    listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null),
  } as unknown as ReturnType<typeof createPageToolFilesIo>
  storage.io=io
  const scenarioId=appConfig.scenarioId,projectId='APP',workspace=new ProjectWorkspace({projectId,blueprint:{}})
  const http=new class extends HttpClientBase {
    protected override executeRequest(): Promise<HttpResponse<unknown>> {return Promise.reject(new Error('Unexpected model request'))}
  }()
  const runtime=new DataSpaceRuntimeApi({http,readScope:()=>({token:'SCOPE',headers:{'X-AppId':projectId}})})
  const {dataSet}=new LowcodeDataSpaceAssembler(runtime,http).assemble({
    config:new ScenarioViewConfig(scenarioId,JSON.stringify({scenarioId,tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})),
    space:{dataSpaceId:scenarioId,name:'Blueprint'},models:[],relations:[],
    fileExecutors:{ProjectToolFile:createPageToolFileResourceExecutor({appId:projectId,workspace,assertCurrent:()=>{}})},
  })
  return {dataSet,appId:'APP',pageId:'PAGE',assertCurrent:()=>{},io}
}

describe('PageTool files use the formal ProjectToolFile DataView chain',()=>{
  it('keeps the declared file query usable alongside an independently saved publication manifest',async()=>{
    const files=new Map([['PAGE/script.js','working script']])
    const scope=createScope(files,async()=>{throw new Error('Unexpected file deletion')})
    try{
      const declared=scope.dataSet.getView('ProjectToolFile')!
      const query=declared.createQueryView('modelRenameTool')
      query.queryContext={pageId:'PAGE',fileName:'script.js',versionId:''}
      expect((await query.requestRefresh()).success).toBe(true)
      expect(query.rows[0]?.['text']).toBe('working script')

      const manifest=createPagePublicationManifestFileView(scope)
      expect((await manifest.requestRefresh()).success).toBe(true)
      const entry=await manifest.addRow({text:'{"publication":"sample"}'})
      if ('success' in entry) throw new Error('Expected a staged manifest')
      const id=manifest.getPkKey(entry)
      if (id===undefined) throw new Error('Expected a manifest identity')
      const result=await scope.dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:manifest.viewId,ids:[id]}]})
      expect(result.success).toBe(true)
      expect(files.get('PAGE/publication-manifest.json')).toBe('{"publication":"sample"}')
      expect(files.get('PAGE/script.js')).toBe('working script')
    }finally{scope.dataSet.destroy()}
  })

  it('removes a listed file without reusing a different tool’s working file view',async()=>{
    const files=new Map([['PAGE/backup-rule.json','backup'],['PAGE-backup/rule.json','[]']])
    const scope=createScope(files,async(_appId,pageId,fileName)=>{files.delete(`${pageId}/${fileName}`)})
    try{
      const working=createPageFileResourceView({...scope,pageId:'PAGE-backup',fileName:'rule.json'})
      expect((await working.requestRefresh()).success).toBe(true)

      await deletePageToolFiles(scope)

      expect(await listPageToolFileNames(scope)).toEqual([])
      expect(files.get('PAGE-backup/rule.json')).toBe('[]')
      expect(working.rows[0]).toMatchObject({pageId:'PAGE-backup',fileName:'rule.json',text:'[]'})
    }finally{scope.dataSet.destroy()}
  })

  it('binds a published snapshot independently of a listed basename that contains its release suffix',()=>{
    const scope=createScope(new Map(),async()=>{throw new Error('Unexpected file deletion')})
    try{
      const versionId='r=1;s=1;t=1;m=1'
      const published=createPageFileResourceView({...scope,fileName:'rule.json',versionId})
      const entry=createPageFileDirectoryEntryView({...scope,fileName:'rule.json-release-r=1;s=1;t=1;m=1'})

      expect(published).not.toBe(entry)
      expect(published.queryContext).toMatchObject({pageId:'PAGE',fileName:'rule.json',versionId})
      expect(entry.queryContext).toMatchObject({pageId:'PAGE',fileName:'rule.json-release-r=1;s=1;t=1;m=1',versionId:''})
    }finally{scope.dataSet.destroy()}
  })

  it('creates and compensates only unchanged standard files while preserving snapshots and extra basenames',async()=>{
    const files=new Map<string,string>([['PAGE/4__script.js','snapshot'],['PAGE/extra-template.txt','extra']])
    const remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      const creation=beginPageToolFileCreation(scope)
      await createPageToolFiles(scope,creation)
      expect(save.mock.calls.flatMap(([request])=>request?.views??[]).filter(view=>view.tableName==='ProjectToolFile')).toHaveLength(3)
      expect(files.size).toBe(5)
      files.set('PAGE/script.js','user edited')
      await compensatePageToolFiles(scope,creation)
      expect(remove.mock.calls.map(([,pageId,name])=>`${pageId}/${name}`)).toEqual(['PAGE/rule.json','PAGE/style.css'])
      expect([...files.keys()].sort()).toEqual(['PAGE/4__script.js','PAGE/extra-template.txt','PAGE/script.js'])
      expect(scope.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(scope.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
    }finally{scope.dataSet.destroy()}
  })

  it('confirms an unknown default-file create through the same DataView before continuing without replay',async()=>{
    const files=new Map<string,string>(),scope=createScope(files,async(_app,pageId,fileName)=>{files.delete(`${pageId}/${fileName}`)})
    const io=storage.io as ReturnType<typeof createPageToolFilesIo>,upload=vi.mocked(io.upload)
    upload.mockImplementationOnce(async({pageId,fileName,text})=>{files.set(`${pageId}/${fileName}`,text);throw timeoutAfterAccept()})
    try{
      const creation=beginPageToolFileCreation(scope)
      await expect(createPageToolFiles(scope,creation)).rejects.toThrow('timeout after accept')
      const ruleView=scope.dataSet.getTable('ProjectToolFile')?.viewList.find(view=>view.queryContext['pageId']==='PAGE'&&view.queryContext['fileName']==='rule.json')
      expect(ruleView?.hasUnconfirmedSave).toBe(true)
      await createPageToolFiles(scope,creation)
      expect(ruleView?.hasUnconfirmedSave).toBe(false)
      expect(upload).toHaveBeenCalledTimes(3)
      expect(files.size).toBe(3)
      expect((io.read as ReturnType<typeof vi.fn>).mock.calls.filter(call=>call[2]==='rule.json')).toHaveLength(4)
    }finally{scope.dataSet.destroy()}
  })

  it('deletes every listed basename one resource at a time and verifies an empty directory',async()=>{
    const files=new Map([['PAGE/rule.json','{}'],['PAGE/2__script.js','snapshot'],['PAGE/extra-template.txt','extra']])
    const remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      expect(await listPageToolFileNames(scope)).toEqual(['rule.json','2__script.js','extra-template.txt'])
      await deletePageToolFiles(scope)
      const fileCommits=save.mock.calls.flatMap(([request])=>request?.views??[]).filter(view=>view.tableName==='ProjectToolFile')
      expect(fileCommits).toHaveLength(3)
      expect(remove.mock.calls.map(([,pageId,name])=>`${pageId}/${name}`)).toEqual(['PAGE/rule.json','PAGE/2__script.js','PAGE/extra-template.txt'])
      expect(files.size).toBe(0)
      expect(scope.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(scope.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
    }finally{scope.dataSet.destroy()}
  })

  it('re-resolves the exact row before compensating a handed-off default file',async()=>{
    const files=new Map<string,string>(),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove)
    try{
      const creation=beginPageToolFileCreation(scope)
      await createPageToolFiles(scope,creation)
      const view=scope.dataSet.getTable('ProjectToolFile')!.viewList.find(item=>item.viewId==='page-PAGE-rule.json')!
      const refresh=view.refresh.bind(view),row=view.rows[0]!,id=view.getPkKey(row)!
      vi.spyOn(view,'refresh').mockImplementationOnce(async()=>{
        const result=await refresh()
        queueMicrotask(()=>queueMicrotask(()=>{view.updateRowById(id,{text:'late user edit'})}))
        return result
      })
      await compensatePageToolFiles(scope,creation)
      expect(remove.mock.calls.map(([,pageId,name])=>`${pageId}/${name}`)).not.toContain('PAGE/rule.json')
      expect(view.rows[0]?.['text']).toBe('late user edit')
    }finally{scope.dataSet.destroy()}
  })

  it.each(['directory cleanup','creation compensation'])('stops %s if the first deletion has no confirmed receipt',async mode=>{
    const files=new Map([['PAGE/rule.json','{}'],['PAGE/script.js','script']])
    const remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove)
    try{
      const creation=mode==='creation compensation'?beginPageToolFileCreation(scope):undefined
      if(creation){files.clear();await createPageToolFiles(scope,creation)}
      const original=[...files]
      const cleanup=()=>creation?compensatePageToolFiles(scope,creation):deletePageToolFiles(scope)
      const save=scope.dataSet.saveChanges.bind(scope.dataSet)
      vi.spyOn(scope.dataSet,'saveChanges').mockImplementationOnce(async options=>{
        const target=options?.views?.[0]
        const id=target?.ids?.[0]
        const view=target&&scope.dataSet.getView(target.tableName,target.viewId)
        if(!view||id===undefined)throw new Error('Missing formal deletion target')
        view.discardPendingChanges([id])
        return save(options)
      })

      const error=await cleanup().catch((cause:unknown)=>cause)

      expect(remove).not.toHaveBeenCalled()
      expect([...files]).toEqual(original)
      expect(error).toEqual(new Error('原记录没有已确认的保存回执'))
      if(creation)expect([...creation.created.keys()]).toEqual(original.map(([path])=>path.slice('PAGE/'.length)))
      await cleanup()
      expect(remove).toHaveBeenCalledTimes(original.length)
      expect(files.size).toBe(0)
    }finally{scope.dataSet.destroy()}
  })

  it('keeps a confirmed first removal and resumes after a later explicit rejection',async()=>{
    const files=new Map([['PAGE/rule.json','{}'],['PAGE/script.js','script']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    remove.mockImplementationOnce(async(_app,pageId,fileName)=>{files.delete(`${pageId}/${fileName}`)})
    remove.mockImplementationOnce(async()=>{throw new Error('explicit rejection')})
    const scope=createScope(files,remove)
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('explicit rejection')
      expect([...files.keys()]).toEqual(['PAGE/script.js'])
      await expect(deletePageToolFiles(scope)).resolves.toBeUndefined()
      expect([...files.keys()]).toEqual([])
      expect(remove).toHaveBeenCalledTimes(3)
    }finally{scope.dataSet.destroy()}
  })

  it('verifies an unknown accepted removal before continuing without replay',async()=>{
    const files=new Map([['PAGE/rule.json','{}']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`);throw timeoutAfterAccept()})
    const scope=createScope(files,remove)
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('timeout after accept')
      await expect(deletePageToolFiles(scope)).resolves.toBeUndefined()
      expect(remove).toHaveBeenCalledOnce()
      expect(files.size).toBe(0)
    }finally{scope.dataSet.destroy()}
  })

  it.each([403,404,'network'] as const)('verifies the original file removal after the API acknowledgement then listing %s failure without deleting twice',async kind=>{
    const files=new Map([['PAGE/rule.json','{}']]),requests:RequestConfig[]=[]
    class DeleteThenFailedList extends HttpClientBase{
      protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
        requests.push(config)
        if(config.url==='/api/File/RemoveFile'){files.delete('PAGE/rule.json');return{data:{Code:200},status:200,statusText:'OK',headers:{}}}
        if(kind==='network')throw timeoutAfterAccept()
        return{data:{Code:kind,Message:'listing denied after delete'},status:200,statusText:'OK',headers:{}}
      }
    }
    const api=new LowcodeDesignApi({http:new DeleteThenFailedList(),readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>api.removeFile({appType:'designfile',customPath:`APP/${pageId}`,fileName})),scope=createScope(files,remove)
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('核验')
      const view=scope.dataSet.getTable('ProjectToolFile')?.viewList.find(current=>current.queryContext['pageId']==='PAGE'&&current.queryContext['fileName']==='rule.json')
      expect(files.size).toBe(0);expect(view?.hasUnconfirmedSave).toBe(true)
      await deletePageToolFiles(scope);expect(view?.hasUnconfirmedSave).toBe(false);expect(remove).toHaveBeenCalledTimes(1);expect(requests.filter(request=>request.url==='/api/File/RemoveFile')).toHaveLength(1)
    }finally{scope.dataSet.destroy()}
  })

  it.each([
    ['PAGE/../outside', 'FILE_DIRECTORY_NAMES'],
    ['PAGE/ rule.json', 'PAGE_TOOL_FILE_DIRECTORY'],
  ])('rejects an unsafe basename %s from the directory DataView before deleting anything',async(key,code)=>{
    const files=new Map([[key,'unsafe']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow(code)
      expect(remove).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(files.size).toBe(1)
    }finally{scope.dataSet.destroy()}
  })

  it.each([' PAGE','PAGE/child','PAGE?release','PAGE\u0000'])(`rejects an unsafe pageId %j before querying the directory`,async pageId=>{
    const files=new Map([['PAGE/rule.json','{}']]),scope=createScope(files,async()=>{})
    const io=storage.io as ReturnType<typeof createPageToolFilesIo>
    try{
      await expect(listPageToolFileNames({...scope,pageId})).rejects.toThrow('PAGE_TOOL_FILE_SCOPE: 应用或工具身份无效')
      expect(io.list).not.toHaveBeenCalled()
    }finally{scope.dataSet.destroy()}
  })

  it('fails closed when a listed non-text resource cannot be read as a FileResource baseline',async()=>{
    const files=new Map([['PAGE/image.bin','opaque']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),io=storage.io as ReturnType<typeof createPageToolFilesIo>,save=vi.spyOn(scope.dataSet,'saveChanges')
    vi.mocked(io.read).mockRejectedValueOnce(new Error('binary content cannot be decoded as text'))
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('binary content cannot be decoded as text')
      expect(remove).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(files.size).toBe(1)
    }finally{scope.dataSet.destroy()}
  })
})

describe('publication manifest and directory entry keep separate capabilities', () => {
  it.each(['manifest-first','entry-first'] as const)('keeps the original view capabilities (%s)', async order => {
    const files = new Map([['PAGE/publication-manifest.json', 'current manifest']])
    const remove = vi.fn(async () => { throw new Error('Unexpected removal') })
    const scope = createScope(files, remove)
    const openManifest = () => createPagePublicationManifestFileView(scope)
    const openEntry = () => createPageFileDirectoryEntryView({...scope, fileName: 'publication-manifest.json'})
    try {
      let manifest, entry
      if (order === 'manifest-first') {manifest = openManifest(); entry = openEntry()}
      else {entry = openEntry(); manifest = openManifest()}
      expect(manifest).not.toBe(entry)
      expect((await manifest.requestRefresh()).success).toBe(true)
      expect((await entry.requestRefresh()).success).toBe(true)
      const [manifestRow] = manifest.rows, [entryRow] = entry.rows
      if (!manifestRow || !entryRow) throw new Error('Missing manifest rows')
      expect(manifest.getPkKey(manifestRow)).toBe(entry.getPkKey(entryRow))
      expect(manifest.fieldAccess(manifestRow, 'text').write).toBe('allowed')
      expect(entry.fieldAccess(entryRow, 'text').write).toBe('denied')
      await expect(manifest.listSourceVersions()).resolves.toEqual([])
      expect(remove).not.toHaveBeenCalled()
    } finally {scope.dataSet.destroy()}
  })

  it('rejects cleanup before deleting another basename when the work manifest has an unsaved edit', async () => {
    const files = new Map([['PAGE/rule.json', '{}'], ['PAGE/publication-manifest.json', 'current manifest']])
    const remove = vi.fn(async (_appId: string, pageId: string, fileName: string) => {files.delete(`${pageId}/${fileName}`)})
    const scope = createScope(files, remove)
    const {io} = scope
    try {
      const manifest = createPagePublicationManifestFileView(scope)
      expect((await manifest.requestRefresh()).success).toBe(true)
      const [row] = manifest.rows
      if (!row) throw new Error('Missing manifest')
      const id = manifest.getPkKey(row)
      if (id === undefined) throw new Error('Missing manifest identity')
      await manifest.editRowById(id, {text: 'local draft'})
      const result = await deletePageToolFiles(scope).then(() => 'deleted', (failure: unknown) =>
        failure instanceof Error ? failure.message : String(failure))
      expect(files.has('PAGE/rule.json')).toBe(true)
      expect(remove).not.toHaveBeenCalled()
      expect(io.upload).not.toHaveBeenCalled()
      expect(result).toContain('PAGE_TOOL_FILE_PENDING')
      expect(manifest.fieldAccess(row, 'text').write).toBe('allowed')
      await expect(manifest.listSourceVersions()).resolves.toEqual([])
      expect(files.get('PAGE/publication-manifest.json')).toBe('current manifest')
    } finally {scope.dataSet.destroy()}
  })
})

it('retains the original manifest history request when the same basename opens as a directory entry', async () => {
  const scope = createScope(new Map([['PAGE/publication-manifest.json', 'current']]), async () => {})
  const {io} = scope
  let giveHistory: ((text: string) => void) | undefined
  try {
    const manifest = createPagePublicationManifestFileView(scope)
    const readVersion = vi.mocked(io.readVersion)
    readVersion.mockImplementationOnce(() => new Promise(resolve => {giveHistory = resolve}))
    const history = manifest.previewSourceVersion(4).then(text => ({text}), (error: unknown) => ({error}))
    await vi.waitFor(() => expect(giveHistory).toBeDefined())
    const entry = createPageFileDirectoryEntryView({...scope, fileName: 'publication-manifest.json'})
    const result = await entry.requestRefresh()
    expect(result.success).toBe(true)
    giveHistory?.('history from version 4')
    expect(await history).toEqual({text: 'history from version 4'})
    expect(readVersion).toHaveBeenCalledWith(expect.objectContaining({appId:'APP',fileName:'publication-manifest.json',version:4}))
  } finally {scope.dataSet.destroy()}
})

it('rechecks working-manifest edits after directory enumeration and before removal', async () => {
  const files = new Map([['PAGE/rule.json', '{}'], ['PAGE/publication-manifest.json', 'initial']])
  const remove = vi.fn(async (_appId: string, pageId: string, fileName: string) => {files.delete(`${pageId}/${fileName}`)})
  const scope = createScope(files, remove)
  const {io} = scope
  try {
    const manifest = createPagePublicationManifestFileView(scope)
    expect((await manifest.requestRefresh()).success).toBe(true)
    const row = manifest.rows[0]
    const id = row && manifest.getPkKey(row)
    if (id === undefined) throw new Error('Missing manifest identity')
    vi.mocked(io.list).mockImplementationOnce(async () => {
      await manifest.editRowById(id, {text: 'draft with directory read in flight'})
      return ['rule.json','publication-manifest.json']
    })
    await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_PENDING')
    expect(remove).not.toHaveBeenCalled()
    expect(io.upload).not.toHaveBeenCalled()
    expect(files.size).toBe(2)
  } finally {scope.dataSet.destroy()}
})

it('requires the original manifest write to settle before directory cleanup can start', async () => {
  const files = new Map([['PAGE/rule.json', '{}'], ['PAGE/publication-manifest.json', 'initial']])
  const remove = vi.fn(async (_appId: string, pageId: string, fileName: string) => {files.delete(`${pageId}/${fileName}`)})
  const scope = createScope(files, remove)
  const {io} = scope
  const upload = vi.mocked(io.upload)
  try {
    const manifest = createPagePublicationManifestFileView(scope)
    expect((await manifest.requestRefresh()).success).toBe(true)
    const row = manifest.rows[0]
    const id = row && manifest.getPkKey(row)
    if (id === undefined) throw new Error('Missing manifest identity')
    await manifest.editRowById(id, {text: 'committed but unacknowledged'})
    upload.mockImplementationOnce(async command => {
      files.set(`${command.pageId}/${command.fileName}`, command.text)
      throw timeoutAfterAccept()
    })
    const save = {views: [{tableName:'ProjectToolFile',viewId:manifest.viewId,ids:[id]}]}
    await expect(scope.dataSet.saveChanges(save)).rejects.toThrow('timeout after accept')
    expect(manifest.hasUnconfirmedSave).toBe(true)
    await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_PENDING')
    expect(manifest.hasUnconfirmedSave).toBe(true)
    expect(remove).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
    await expect(scope.dataSet.verifySaveJournal()).resolves.toMatchObject({completed:true,views:[{state:'applied'}]})
    expect(manifest.hasUnconfirmedSave).toBe(false)
    await deletePageToolFiles(scope)
    expect(files.size).toBe(0)
    expect(upload).toHaveBeenCalledTimes(1)
  } finally {scope.dataSet.destroy()}
})

describe('tool file history reserves the original storage target before allocation', () => {
  function createHistoryFixture() {
    const scope=createScope(new Map([['PAGE/script.js','working script'],['PAGE/style.css','working style']]), async()=>{})
    const {io}=scope
    const versions = new Map<string, {version:number;fileName:string;text:string}>()
    vi.mocked(io.listVersions).mockImplementation(async ({fileName}) => [...versions.values()]
      .filter(version => version.fileName.endsWith(`__${fileName}`))
      .map(version => ({version: version.version, fileName: version.fileName, lastModified: null})))
    vi.mocked(io.uploadVersion).mockImplementation(async ({fileName,version,text}) => {
      const basename = `${version}__${fileName}`
      versions.set(basename, {version,fileName:basename,text})
    })
    vi.mocked(io.readVersion).mockImplementation(async ({fileName,version}) => versions.get(`${version}__${fileName}`)?.text ?? null)
    return scope
  }

  it.each(['same-file','same-file-other-view','different-file'] as const)('serializes allocation only for the same file (%s)', async variant => {
    const scope=createHistoryFixture()
    let release: (() => void)|undefined
    try {
      const script=createPageFileResourceView({...scope,fileName:'script.js'})
      const style=createPageFileResourceView({...scope,fileName:'style.css'})
      expect((await script.requestRefresh()).success).toBe(true)
      expect((await style.requestRefresh()).success).toBe(true)
      const peer = variant==='same-file-other-view' ? script.createQueryView('parallel-history') : script
      if(peer!==script){
        peer.queryContext={...script.queryContext}
        expect((await peer.requestRefresh()).success).toBe(true)
      }
      vi.mocked(scope.io.listVersions).mockImplementationOnce(() => new Promise(resolve=>{release=()=>resolve([])}))
      const first=script.createSourceVersion().then(value=>({value}),(error:unknown)=>({error}))
      await vi.waitFor(()=>expect(release).toBeDefined())
      const nextView=variant==='different-file'?style:peer
      const second=await nextView.createSourceVersion().then(value=>({value}),(error:unknown)=>({error}))
      release?.()
      expect(await first).toMatchObject({value:{state:'confirmed',version:1,fileName:'1__script.js'}})
      if(variant!=='different-file'){
        expect(second).toMatchObject({error:expect.objectContaining({message:expect.stringContaining('FILE_RESOURCE_HISTORY_PENDING')})})
        expect(scope.io.uploadVersion).toHaveBeenCalledTimes(1)
      } else {
        expect(second).toMatchObject({value:{state:'confirmed',version:1,fileName:'1__style.css'}})
        expect(scope.io.uploadVersion).toHaveBeenCalledTimes(2)
      }
    }finally{release?.();scope.dataSet.destroy()}
  })

  it('allows an explicit retry after failure before the attempt was captured',async()=>{
    const scope=createHistoryFixture()
    try {
      const view=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await view.requestRefresh()).success).toBe(true)
      vi.mocked(scope.io.listVersions).mockRejectedValueOnce(new Error('history listing unavailable'))
      await expect(view.createSourceVersion()).rejects.toThrow('history listing unavailable')
      expect(view.getSourceHistoryStatus()).toMatchObject({state:'idle'})
      expect(scope.io.uploadVersion).not.toHaveBeenCalled()
      await expect(view.createSourceVersion()).resolves.toMatchObject({state:'confirmed',version:1,fileName:'1__script.js'})
      expect(scope.io.uploadVersion).toHaveBeenCalledOnce()
    }finally{scope.dataSet.destroy()}
  })

  it('keeps the original history confirmed when an older verification finishes later',async()=>{
    const scope=createHistoryFixture()
    let answerOlderRead: ((text: string | null) => void)|undefined
    try {
      const view=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await view.requestRefresh()).success).toBe(true)
      let writtenText: string|null=null
      const upload=vi.mocked(scope.io.uploadVersion)
      upload.mockImplementationOnce(async ({text})=>{writtenText=text;throw timeoutAfterAccept()})
      await expect(view.createSourceVersion()).rejects.toThrow('timeout after accept')
      expect(view.getSourceHistoryStatus()).toMatchObject({state:'unknown',version:1})
      vi.mocked(scope.io.listVersions).mockResolvedValue([{version:1,fileName:'1__script.js',lastModified:null}])
      vi.mocked(scope.io.readVersion)
        .mockImplementationOnce(()=>new Promise(resolve=>{answerOlderRead=resolve}))
        .mockImplementation(async()=>writtenText)
      const older=view.verifySourceHistoryAttempt()
      await vi.waitFor(()=>expect(answerOlderRead).toBeDefined())
      await expect(view.verifySourceHistoryAttempt()).resolves.toMatchObject({state:'confirmed',version:1})
      answerOlderRead?.(null)
      expect(await older).toMatchObject({state:'confirmed',version:1})
      expect(view.getSourceHistoryStatus()).toMatchObject({state:'confirmed',version:1})
      expect(upload).toHaveBeenCalledOnce()
    }finally{answerOlderRead?.(null);scope.dataSet.destroy()}
  })
})

describe('tool directory cleanup protects the original working file history',()=>{
  it('keeps an empty directory pending while the released view still has a dispatched deletion',async()=>{
    const files=new Map([['PAGE/rule.json','[]']])
    let release:()=>void=()=>{}
    const receipt=new Promise<void>(resolve=>{release=resolve})
    const scope=createScope(files,async(_app,page,name)=>{
      files.delete(`${page}/${name}`)
      await receipt
    })
    const original=createPageFileResourceView({...scope,fileName:'rule.json'})
    const deletion=deletePageToolFiles(scope).catch(error=>error)
    try{
      await vi.waitFor(()=>expect(files.has('PAGE/rule.json')).toBe(false))
      original.dataTable?.destroyView(original.viewId)
      await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_DELETE_RECOVERY')
      await expect(retainSharedPageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_DELETE_RECOVERY')
      expect(scope.io.remove).toHaveBeenCalledOnce()
    }finally{release();await deletion;scope.dataSet.destroy()}
  })

  it.each(['clean','retain'] as const)('settles the original deletion before handling remaining files (%s)',async mode=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{
      files.delete(`${page}/${name}`)
      if(name==='rule.json')throw timeoutAfterAccept()
    })
    try{
      const original=createPageFileResourceView({...scope,fileName:'rule.json'})
      await expect(deletePageToolFiles(scope)).rejects.toThrow()
      expect(original.hasUnconfirmedSave).toBe(true)
      expect(files.has('PAGE/rule.json')).toBe(false)
      original.dataTable?.destroyView(original.viewId)
      expect(original.destroyed).toBe(true)
      vi.mocked(scope.io.read).mockClear()
      if(mode==='clean')await deletePageToolFiles(scope)
      else await retainSharedPageToolFiles(scope)
      expect(vi.mocked(scope.io.read).mock.calls.some(([,page,name])=>page==='PAGE'&&name==='rule.json')).toBe(true)
      expect(vi.mocked(scope.io.remove).mock.calls.filter(([,page,name])=>page==='PAGE'&&name==='rule.json')).toHaveLength(1)
      expect(scope.dataSet.saveJournal.views.some(view=>view.state==='unknown')).toBe(false)
      expect(files.has('PAGE/script.js')).toBe(mode==='retain')
    }finally{scope.dataSet.destroy()}
  })

  it('leaves remaining files untouched while the detached original deletion stays unknown',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async()=>{throw timeoutAfterAccept()})
    try{
      const original=createPageFileResourceView({...scope,fileName:'rule.json'})
      await expect(deletePageToolFiles(scope)).rejects.toThrow()
      original.dataTable?.destroyView(original.viewId)
      const {batchId}=scope.dataSet.saveJournal
      await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_DELETE_RECOVERY')
      expect(scope.io.remove).toHaveBeenCalledOnce()
      expect(scope.dataSet.saveJournal).toMatchObject({batchId,views:[{state:'unknown'}]})
      expect(files.get('PAGE/script.js')).toBe('working')
    }finally{scope.dataSet.destroy()}
  })

  it('settles the original deletion journal after exact readback by a replacement view',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{
      files.delete(`${page}/${name}`)
      if(name==='rule.json')throw timeoutAfterAccept()
    })
    try{
      const original=createPageFileResourceView({...scope,fileName:'rule.json'})
      await expect(deletePageToolFiles(scope)).rejects.toThrow()
      expect(original.hasUnconfirmedSave).toBe(true)
      expect(files.has('PAGE/rule.json')).toBe(false)
      original.dataTable?.destroyView(original.viewId)
      expect(original.destroyed).toBe(true)
      const reopened=createPageFileResourceView({...scope,fileName:'rule.json'})
      expect(reopened).not.toBe(original)
      vi.mocked(scope.io.read).mockClear()
      await expect(reopened.verifySourceWriteAttempt()).resolves.toMatchObject({state:'confirmed'})
      expect(scope.io.read).toHaveBeenCalledWith('APP','PAGE','rule.json')
      expect(scope.io.remove).toHaveBeenCalledOnce()
      reopened.acknowledgeSourceWriteAttempt()
      const journal=await scope.dataSet.verifySaveJournal()
      expect(journal.views).toMatchObject([{state:'applied'}])
    }finally{scope.dataSet.destroy()}
  })

  it('keeps deletion from dispatching if history starts inside save preflight',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{files.delete(`${page}/${name}`)})
    let release:()=>void=()=>{}
    const hold=new Promise<void>(resolve=>{release=resolve})
    let reading=false
    vi.mocked(scope.io.listVersions).mockImplementation(async()=>files.has('PAGE/1__script.js')
      ?[{version:1,fileName:'1__script.js',lastModified:null}]:[])
      .mockImplementationOnce(async()=>{reading=true;await hold;return []})
    vi.mocked(scope.io.uploadVersion).mockImplementation(async()=>{files.set('PAGE/1__script.js','working')})
    vi.mocked(scope.io.readVersion).mockImplementation(async()=>files.get('PAGE/1__script.js')??null)
    try{
      const rules=createPageFileResourceView({...scope,fileName:'rule.json'})
      const script=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await script.requestRefresh()).success).toBe(true)
      let history:Promise<unknown>|undefined
      rules.events.on('mutatingChanged',mutating=>{
        if(mutating&&!history)history=script.createSourceVersion().catch(error=>error)
      })
      const result=await deletePageToolFiles(scope).then(()=>undefined,error=>error)
      expect(reading).toBe(true)
      expect(result).toMatchObject({message:expect.stringContaining('FILE_RESOURCE_HISTORY_PENDING')})
      expect(scope.io.remove).not.toHaveBeenCalled()
      expect(files.get('PAGE/rule.json')).toBe('[]')
      expect(rules.hasUnconfirmedSave).toBe(false)
      release()
      await expect(history).resolves.toMatchObject({state:'confirmed',version:1})
    }finally{release();scope.dataSet.destroy()}
  })

  it('keeps history from dispatching while the same tool deletion awaits its receipt',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    let release:()=>void=()=>{}
    const hold=new Promise<void>(resolve=>{release=resolve})
    let deletingRules=false
    const scope=createScope(files,async(_app,page,name)=>{
      if(name==='rule.json'){deletingRules=true;await hold}
      files.delete(`${page}/${name}`)
    })
    vi.mocked(scope.io.uploadVersion).mockImplementation(async()=>{files.set('PAGE/1__script.js','working')})
    vi.mocked(scope.io.readVersion).mockImplementation(async()=>files.get('PAGE/1__script.js')??null)
    try{
      const script=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await script.requestRefresh()).success).toBe(true)
      const deletion=deletePageToolFiles(scope).catch(error=>error)
      await vi.waitFor(()=>expect(deletingRules).toBe(true))
      const result=await script.createSourceVersion().then(()=>undefined,error=>error)
      const uploads=vi.mocked(scope.io.uploadVersion).mock.calls.length
      release()
      await expect(deletion).resolves.toBeUndefined()
      expect(uploads).toBe(0)
      expect(result).toMatchObject({message:expect.stringContaining('FILE_RESOURCE_DELETE_PENDING')})
    }finally{release();scope.dataSet.destroy()}
  })

  it('holds a deletion with a lost receipt until its original target is verified',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working'],['PEER/script.js','peer']])
    const scope=createScope(files,async()=>{throw timeoutAfterAccept()})
    vi.mocked(scope.io.uploadVersion).mockImplementation(async({customPath,text})=>{files.set(`${customPath}/1__script.js`,text)})
    vi.mocked(scope.io.listVersions).mockImplementation(async({customPath})=>files.has(`${customPath}/1__script.js`)
      ?[{version:1,fileName:'1__script.js',lastModified:null}]:[])
    vi.mocked(scope.io.readVersion).mockImplementation(async({customPath})=>files.get(`${customPath}/1__script.js`)??null)
    try{
      const rules=createPageFileResourceView({...scope,fileName:'rule.json'})
      const script=createPageFileResourceView({...scope,fileName:'script.js'})
      const peer=createPageFileResourceView({...scope,pageId:'PEER',fileName:'script.js'})
      expect((await script.requestRefresh()).success).toBe(true)
      expect((await peer.requestRefresh()).success).toBe(true)
      await expect(deletePageToolFiles(scope)).rejects.toThrow()
      expect(rules.hasUnconfirmedSave).toBe(true)
      await expect(rules.verifySourceWriteAttempt()).resolves.toMatchObject({state:'unknown'})
      await expect(script.createSourceVersion()).rejects.toThrow('FILE_RESOURCE_DELETE_PENDING')
      expect(scope.io.uploadVersion).not.toHaveBeenCalled()
      await expect(peer.createSourceVersion()).resolves.toMatchObject({state:'confirmed',version:1})

      files.delete('PAGE/rule.json')
      await expect(rules.verifySourceWriteAttempt()).resolves.toMatchObject({state:'confirmed'})
      await expect(script.createSourceVersion()).resolves.toMatchObject({state:'confirmed',version:1})
      expect(files.get('APP/PAGE/1__script.js')).toBe('working')
      expect(files.get('APP/PEER/1__script.js')).toBe('peer')
      expect(scope.io.remove).toHaveBeenCalledOnce()
    }finally{scope.dataSet.destroy()}
  })

  it('retains a pending working history target after its original view is released',async()=>{
    const files=new Map([['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{files.delete(`${page}/${name}`)})
    const upload=vi.mocked(scope.io.uploadVersion)
    upload.mockImplementationOnce(async ({text})=>{
      files.set('PAGE/1__script.js',text)
      throw timeoutAfterAccept()
    })
    vi.mocked(scope.io.listVersions).mockImplementation(async()=>files.has('PAGE/1__script.js')?
      [{version:1,fileName:'1__script.js',lastModified:null}]:[])
    vi.mocked(scope.io.readVersion).mockImplementation(async()=>files.get('PAGE/1__script.js')??null)
    try{
      const origin=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await origin.requestRefresh()).success).toBe(true)
      await expect(origin.createSourceVersion()).rejects.toThrow('timeout after accept')
      expect(origin.getSourceHistoryStatus()).toMatchObject({state:'unknown',version:1})
      origin.dataTable?.destroyView(origin.viewId)
      expect(origin.destroyed).toBe(true)
      expect(findPendingPageToolFileHistory(scope.dataSet,scope)).toBe('script.js')
      expect(findPendingPageToolFileHistory(scope.dataSet)).toBe('script.js')
      expect(findPendingPageToolFileHistory(scope.dataSet,{appId:scope.appId,pageId:'OTHER'})).toBeUndefined()
      await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_PENDING')
      expect(scope.io.remove).not.toHaveBeenCalled()

      const reopened=createPageFileResourceView({...scope,fileName:'script.js'})
      expect(reopened).not.toBe(origin)
      await expect(reopened.verifySourceHistoryAttempt()).resolves.toMatchObject({state:'confirmed',version:1})
      expect(files.get('PAGE/script.js')).toBe('working')
      expect(files.get('PAGE/1__script.js')).toBe('working')
      expect(upload).toHaveBeenCalledOnce()
    }finally{scope.dataSet.destroy()}
  })

  it.each(['allocating','pending','unknown'] as const)('leaves the target files alone while working history is %s',async phase=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{files.delete(`${page}/${name}`)})
    const listing=vi.mocked(scope.io.listVersions)
    const upload=vi.mocked(scope.io.uploadVersion)
    vi.mocked(scope.io.readVersion).mockImplementation(async()=>files.get('PAGE/1__script.js')??null)
    listing.mockImplementation(async()=>files.has('PAGE/1__script.js')?[{version:1,fileName:'1__script.js',lastModified:null}]:[])
    let release: (()=>void)|undefined
    const wait=new Promise<void>(resolve=>{release=resolve})
    let entered=false
    async function writeVersion() {files.set('PAGE/1__script.js','working')}
    upload.mockImplementation(writeVersion)
    if(phase==='allocating'){
      listing.mockImplementationOnce(async()=>{entered=true;await wait;return []})
    }else{
      upload.mockImplementationOnce(async()=>{
        entered=true
        if(phase==='pending')await wait
        await writeVersion()
        if(phase==='unknown')throw timeoutAfterAccept()
      })
    }
    const script=createPageFileResourceView({...scope,fileName:'script.js'})
    try{
      expect((await script.requestRefresh()).success).toBe(true)
      const history=script.createSourceVersion().then(result=>({result}),(error:unknown)=>({error}))
      await vi.waitFor(()=>expect(entered).toBe(true))
      if(phase==='unknown')expect(await history).toMatchObject({error:expect.objectContaining({message:'timeout after accept'})})
      const deletion=await deletePageToolFiles(scope).then(()=>({deleted:true}),(error:unknown)=>({error}))
      release?.()
      const settlement=await history
      expect(deletion).toMatchObject({error:expect.objectContaining({message:expect.stringContaining('PAGE_TOOL_FILE_PENDING')})})
      expect(scope.io.remove).not.toHaveBeenCalled()
      expect(files.get('PAGE/rule.json')).toBe('[]')
      expect(files.get('PAGE/script.js')).toBe('working')
      if(phase==='unknown'){
        expect(await script.verifySourceHistoryAttempt()).toMatchObject({state:'confirmed',version:1})
      }else{
        expect(settlement).toMatchObject({result:{state:'confirmed',version:1}})
      }
      expect(upload).toHaveBeenCalledOnce()
      expect(files.get('PAGE/1__script.js')).toBe('working')
    }finally{release?.();scope.dataSet.destroy()}
  })

  it('checks again when a working snapshot starts during the directory read',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PAGE/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{files.delete(`${page}/${name}`)})
    const directory=vi.mocked(scope.io.list),versions=vi.mocked(scope.io.listVersions)
    let completeDirectory: ((value: string[])=>void)|undefined
    let releaseVersion: (()=>void)|undefined
    directory.mockImplementationOnce(()=>new Promise(resolve=>{completeDirectory=resolve}))
    versions.mockImplementation(async()=>files.has('PAGE/1__script.js')?[{version:1,fileName:'1__script.js',lastModified:null}]:[])
    versions.mockImplementationOnce(()=>new Promise(resolve=>{releaseVersion=()=>resolve([])}))
    vi.mocked(scope.io.uploadVersion).mockImplementation(async()=>{files.set('PAGE/1__script.js','working')})
    vi.mocked(scope.io.readVersion).mockImplementation(async()=>files.get('PAGE/1__script.js')??null)
    try{
      const script=createPageFileResourceView({...scope,fileName:'script.js'})
      expect((await script.requestRefresh()).success).toBe(true)
      const deletion=deletePageToolFiles(scope).then(()=>({deleted:true}),(error:unknown)=>({error}))
      await vi.waitFor(()=>expect(completeDirectory).toBeDefined())
      const history=script.createSourceVersion().then(result=>({result}),(error:unknown)=>({error}))
      await vi.waitFor(()=>expect(releaseVersion).toBeDefined())
      completeDirectory?.(['rule.json','script.js'])
      const outcome=await deletion
      releaseVersion?.()
      await history
      expect(outcome).toMatchObject({error:expect.objectContaining({message:expect.stringContaining('PAGE_TOOL_FILE_PENDING')})})
      expect(scope.io.remove).not.toHaveBeenCalled()
      expect(files.get('PAGE/rule.json')).toBe('[]')
      expect(files.get('PAGE/script.js')).toBe('working')
    }finally{completeDirectory?.([]);releaseVersion?.();scope.dataSet.destroy()}
  })
  it('keeps another tool working history out of the cleanup check',async()=>{
    const files=new Map([['PAGE/rule.json','[]'],['PEER/script.js','working']])
    const scope=createScope(files,async(_app,page,name)=>{files.delete(`${page}/${name}`)})
    vi.mocked(scope.io.listVersions).mockResolvedValue([{version:1,fileName:'1__script.js',lastModified:null}])
    vi.mocked(scope.io.uploadVersion).mockRejectedValueOnce(timeoutAfterAccept())
    try{
      const script=createPageFileResourceView({...scope,pageId:'PEER',fileName:'script.js'})
      expect((await script.requestRefresh()).success).toBe(true)
      await expect(script.createSourceVersion()).rejects.toThrow('timeout after accept')
      expect(script.getSourceHistoryStatus()).toMatchObject({state:'unknown'})
      await deletePageToolFiles(scope)
      expect(scope.io.remove).toHaveBeenCalledOnce()
      expect(files.get('PEER/script.js')).toBe('working')
    }finally{scope.dataSet.destroy()}
  })
})
