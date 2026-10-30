import {describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectToolResource} from '@spark-appworks/spark-project-model'
import appConfig from '../../../../config/pages/application/project-blueprint/pagedata.json'
import dataSpaceDesignConfig from '../../../../config/pages/data-platform/data-space-design/pagedata.json'
import {createPageFileResourceView,createPageToolFileResourceExecutor} from '@/services/project/page-tool-file-dataview'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import type {createPageToolFilesIo} from '@/lowcode/lowcode-runtime'

const storage=vi.hoisted(()=>({io:undefined as unknown}))
vi.mock('@/lowcode/lowcode-runtime',async importOriginal=>({...await importOriginal<typeof import('@/lowcode/lowcode-runtime')>(),createPageToolFilesIo:()=>storage.io}))

describe('formal ProjectToolFile DataView',()=>{
  it.each([
    {fileName:'rule.json',version:2},
    {fileName:'script.js',version:1},
    {fileName:'style.css',version:3},
  ])('reads the exact published component for $fileName and exposes a read-only DataView',async({fileName,version})=>{
    const pointer='rule=2;script=1;style=3',versionReads=vi.fn(async(input:{fileName:string;version:number})=>`${input.version}__${input.fileName}`)
    const io={list:vi.fn(async()=>[]),read:vi.fn(async()=> 'working-file'),upload:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),
      listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:versionReads} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}})
    const dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const table=dataSet.getTable('ProjectToolFile')!,view=table.getOrCreateView(`published-${fileName}`)
      view.queryContext={appId:'APP',pageId:'PAGE',fileName,versionId:pointer}
      view.bindQueryExecutor(createPageToolFileResourceExecutor({appId:'APP',workspace,assertCurrent:()=>{}}),
        {resource:{resourceType:'file',resourceId:ProjectToolResource.resources.ProjectToolFile}})
      await view.refresh()
      expect(versionReads).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({appId:'APP',customPath:'APP/PAGE',fileName,version}))
      expect(io.read).not.toHaveBeenCalled()
      expect(view.rows[0]?.['text']).toBe(`${version}__${fileName}`)
      expect(view.fieldAccess(view.rows[0]!, 'text').write).toBe('denied')
      expect(view.editActionState(view.rows[0]!)).toBe('disabled')
      expect(view.addActionState()).toBe('disabled')
      expect(view.deleteActionState(view.rows[0]!)).toBe('disabled')
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('preserves existing rows when the working file or exact published component disappears',async()=>{
    const pointer='style=3;rule=2;script=1',working=new Map([['APP/PAGE/script.js','working']])
    let publishedPresent=true
    const io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>working.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:async()=>{},remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},
      readVersion:async()=>publishedPresent?'published':null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const table=dataSet.getTable('ProjectToolFile')!
      const work=table.getOrCreateView('existing-working')
      work.queryContext={appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      work.bindQueryExecutor(createPageToolFileResourceExecutor({appId:'APP',workspace,assertCurrent:()=>{}}),
        {resource:{resourceType:'file',resourceId:ProjectToolResource.resources.ProjectToolFile}})
      await work.refresh();const workingRows=structuredClone(work.rows)
      working.clear()
      await expect(work.loadFromServer({singleFlight:false})).rejects.toThrow('FILE_RESOURCE_MISSING')
      expect(work.rows).toEqual(workingRows)

      const published=table.getOrCreateView('existing-published')
      published.queryContext={appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:pointer}
      published.bindQueryExecutor(createPageToolFileResourceExecutor({appId:'APP',workspace,assertCurrent:()=>{}}),
        {resource:{resourceType:'file',resourceId:ProjectToolResource.resources.ProjectToolFile}})
      await published.refresh();const publishedRows=structuredClone(published.rows)
      publishedPresent=false
      await expect(published.loadFromServer({singleFlight:false})).rejects.toThrow('FILE_RESOURCE_VERSION_MISSING')
      expect(published.rows).toEqual(publishedRows)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('keeps declared ProjectToolFile views update-only while DevSystem named views own create and delete',async()=>{
    const files=new Map([['APP/PAGE/script.js','baseline']]),io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:async(input:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)},
      remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=dataSet.getView('ProjectToolFile')!
      view.queryContext={appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      view.bindQueryExecutor(createPageToolFileResourceExecutor({appId:'APP',workspace,assertCurrent:()=>{}}),
        {resource:{resourceType:'file',resourceId:ProjectToolResource.resources.ProjectToolFile}})
      await view.refresh()
      const row=view.rows[0]!,id=view.getPkKey(row)!
      expect(view.editActionState(row)).toBe('enabled')
      expect(view.addActionState()).toBe('disabled')
      expect(view.deleteActionState(row)).toBe('disabled')
      await expect(view.addRow({pageId:'PAGE',fileName:'style.css',text:'created'})).rejects.toThrow()
      await view.editRowById(id,{text:'updated'})
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(files.get('APP/PAGE/script.js')).toBe('updated')
      expect(await view.removeRow(id)).toBe(true)
      await expect(dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).rejects.toThrow('FILE_RESOURCE_READ_ONLY')
      expect(files.get('APP/PAGE/script.js')).toBe('updated')
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('saves and reopens a configured clone through the formal ProjectToolFile DataTable without a synthetic revision column',async()=>{
    const files=new Map([['PAGE/script.js','before']]),writes:string[]=[]
    const io={list:async()=>[],read:async(_appId:string,pageId:string,fileName:string)=>files.get(`${pageId}/${fileName}`)??null,
      upload:async(input:{pageId:string;fileName:string;text:string})=>{files.set(`${input.pageId}/${input.fileName}`,input.text);writes.push(`${input.pageId}/${input.fileName}`)},
      remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:dataSpaceDesignConfig.scenarioId,
      tables:{ProjectToolFile:dataSpaceDesignConfig.tables.ProjectToolFile}})
    try{
      const table=dataSet.getTable('ProjectToolFile')!,declaration=table.getView('default')!
      expect(table.columns.some(column=>column.name==='revision')).toBe(false)
      declaration.bindQueryExecutor(createPageToolFileResourceExecutor({appId:'APP',workspace,assertCurrent:()=>{}}),
        {resource:{resourceType:'file',resourceId:ProjectToolResource.resources.ProjectToolFile}})
      const edit=declaration.createQueryView('configured-rule')
      edit.queryContext={...edit.queryContext,appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      await edit.loadFromServer({singleFlight:false})
      const id=edit.getPkKey(edit.rows[0]!)!
      await edit.editRowById(id,{text:'after'})
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:edit.viewId,ids:[id]}]})).success).toBe(true)
      expect(edit.rows[0]).not.toHaveProperty('localText')
      const reopened=declaration.createQueryView('reopened-rule')
      reopened.queryContext={...reopened.queryContext,appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      await reopened.loadFromServer({singleFlight:false})
      expect(reopened.rows).toMatchObject([{pageId:'PAGE',fileName:'script.js',text:'after'}])
      expect(reopened.rows[0]).not.toHaveProperty('localText')
      expect(writes).toEqual(['PAGE/script.js'])
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('stages create and delete against one page/file binding and confirms both source receipts',async()=>{
    const files=new Map<string,string>(),key='APP/PAGE/script.js'
    const io={
      list:vi.fn(async()=>[]),
      read:vi.fn(async(_appId:string,_pageId:string,fileName:string)=>files.get(`APP/PAGE/${fileName}`)??null),
      upload:vi.fn(async(input:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)}),
      remove:vi.fn(async(_appId:string,_pageId:string,fileName:string)=>{files.delete(`APP/PAGE/${fileName}`)}),
      listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null),
    } as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'script.js',assertCurrent:()=>{}})
      expect(view.dataTable?.resourceId).toBe(ProjectToolResource.resources.ProjectToolFile)
      expect(view.queryContext).toMatchObject({pageId:'PAGE',fileName:'script.js'})
      await view.refresh()
      expect(view.rows).toHaveLength(0)
      const added=await view.addRow({pageId:'PAGE',fileName:'script.js',text:'created'})
      expect('success' in added).toBe(false)
      const id=view.getPkKey(added as Record<string,unknown>)!
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(files.get(key)).toBe('created')
      expect(view.rows[0]).toMatchObject({pageId:'PAGE',fileName:'script.js',text:'created'})
      expect(await view.removeRow(id)).toBe(true)
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(files.has(key)).toBe(false)
      expect(view.rows).toHaveLength(0)
      expect(io.upload).toHaveBeenCalledOnce()
      expect(io.remove).toHaveBeenCalledOnce()
    }finally{dataSet.destroy()}
  })

  it('keeps an accepted upload attempt when scope expires after upload and verifies it from a fresh view without replay',async()=>{
    const files=new Map([['APP/PAGE/script.js','baseline']]);let current=true,uploads=0
    const io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:async(input:{appId:string;pageId:string;fileName:string;text:string})=>{uploads++;files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text);current=false},
      remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'script.js',assertCurrent:()=>{if(!current)throw new Error('request scope changed after upload')}})
      await view.refresh();const row=view.rows[0]!,id=view.getPkKey(row)!,save={views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]}
      await view.editRowById(id,{text:'accepted'})
      await expect(dataSet.saveChanges(save)).rejects.toThrow('request scope changed after upload')
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(uploads).toBe(1)
      current=true
      const verifier=view.createQueryView('fresh-scope-verifier')
      verifier.queryContext={...verifier.queryContext,appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      await verifier.loadFromServer({singleFlight:false})
      expect(await verifier.verifySourceWriteAttempt()).toMatchObject({state:'confirmed',text:'accepted'})
      expect((await dataSet.saveChanges(save)).success).toBe(true)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(uploads).toBe(1)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('keeps an accepted remove attempt when scope expires after remove and verifies it without replay',async()=>{
    const files=new Map([['APP/PAGE/script.js','baseline']]);let current=true,removes=0
    const io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:async()=>{},remove:async(appId:string,pageId:string,fileName:string)=>{removes++;files.delete(`${appId}/${pageId}/${fileName}`);current=false},
      listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'script.js',assertCurrent:()=>{if(!current)throw new Error('request scope changed after remove')}})
      await view.refresh();const id=view.getPkKey(view.rows[0]!)!,save={views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]}
      await view.removeRow(id)
      await expect(dataSet.saveChanges(save)).rejects.toThrow('request scope changed after remove')
      expect(view.hasUnconfirmedSave).toBe(true)
      expect(removes).toBe(1)
      current=true
      const verifier=view.createQueryView('fresh-scope-remove-verifier')
      verifier.queryContext={...verifier.queryContext,appId:'APP',pageId:'PAGE',fileName:'script.js',versionId:''}
      await verifier.loadFromServer({singleFlight:false})
      expect(await verifier.verifySourceWriteAttempt()).toMatchObject({state:'confirmed',text:null})
      expect((await dataSet.saveChanges(save)).success).toBe(true)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(removes).toBe(1)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('does not reuse the named view when the app target changes',()=>{
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      expect(()=>createPageFileResourceView({dataSet,appId:'OTHER',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}}))
        .toThrow('FILE_RESOURCE_IDENTITY')
    }finally{dataSet.destroy()}
  })

  it('hydrates a loaded PageTool projection after the formal DataSet receipt without leaving it dirty',async()=>{
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}})
    workspace.project.setActivePage('PAGE')
    const page=workspace.getActivePageTool()!
    page.hydrateFileText('rule.json','{"type":"r-text","props":{},"children":[]}')
    page.markLoaded()
    const files=new Map([['APP/PAGE/rule.json',page.getFileText('rule.json')]])
    const io={list:vi.fn(async()=>[]),read:vi.fn(async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null),
      upload:vi.fn(async(input:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)}),
      remove:vi.fn(async()=>{}),listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null)} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',workspace,assertCurrent:()=>{}})
      await view.refresh()
      const row=view.rows[0]!,id=view.getPkKey(row)!
      await view.editRowById(id,{text:'{"type":"r-table","props":{},"children":[]}'})
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(page.rule.children[0]?.type).toBe('r-table')
      expect(page.getFileText('rule.json')).toContain('r-table')
      expect(page.isDirty()).toBe(false)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('rejects invalid rule JSON before the storage adapter uploads it',async()=>{
    const files=new Map([['APP/PAGE/rule.json','{"type":"r-text","props":{}}']]),uploads=vi.fn(async(input:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)})
    const io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:uploads,remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      await view.refresh();const row=view.rows[0]!,id=view.getPkKey(row)!
      await view.editRowById(id,{text:'{ invalid json'})
      await expect(dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).rejects.toThrow()
      expect(uploads).not.toHaveBeenCalled()
      expect(files.get('APP/PAGE/rule.json')).toBe('{"type":"r-text","props":{}}')
      expect(view.hasUnconfirmedSave).toBe(false)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('preserves a PageTool edit made while upload is pending and does not hydrate it over',async()=>{
    const original='{"type":"r-text","props":{"label":"base"}}',accepted='{"type":"r-text","props":{"label":"accepted"}}',draft='{"type":"r-text","props":{"label":"local draft"}}'
    const files=new Map([['APP/PAGE/rule.json',original]]);let page:ReturnType<ProjectWorkspace['getActivePageTool']>|undefined,uploads=0
    const io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
      upload:async(input:{appId:string;pageId:string;fileName:string;text:string})=>{uploads++;files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text);page?.setFileText('rule.json',draft)},
      remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{}}),dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      workspace.project.setActivePage('PAGE');page=workspace.getActivePageTool()!
      page.hydrateFileText('rule.json',original);page.markLoaded()
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',workspace,assertCurrent:()=>{}})
      await view.refresh();const id=view.getPkKey(view.rows[0]!)!
      await view.editRowById(id,{text:accepted})
      const receipt=await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})
      expect(receipt.success).toBe(true)
      expect(uploads).toBe(1)
      expect(view.hasUnconfirmedSave).toBe(false)
      expect(JSON.parse(page.getFileText('rule.json')!).props.label).toBe('local draft')
      expect(page.isDirty()).toBe(true)
      expect(uploads).toBe(1)
    }finally{dataSet.destroy();workspace.dispose()}
  })

  it('rejects a page or file context change before reading the new target',async()=>{
    const files=new Map<string,string>([['APP/PAGE/rule.json','baseline']]),read=vi.fn(async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null)
    const io={list:vi.fn(async()=>[]),read,upload:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),
      listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null)} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      await view.refresh()
      expect(read).toHaveBeenCalledWith('APP','PAGE','rule.json')
      view.queryContext={...view.queryContext,appId:'OTHER',pageId:'OTHER',fileName:'script.js'}
      await view.refresh()
      expect(read).toHaveBeenCalledTimes(1)
      expect(view.rows).toMatchObject([expect.objectContaining({pageId:'PAGE',fileName:'rule.json',text:'baseline'})])
    }finally{dataSet.destroy()}
  })
})
