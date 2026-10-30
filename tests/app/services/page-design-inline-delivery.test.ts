import {describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectWorkspace,ScenarioDefinitionResource,type PageToolFileName,type ProjectWorkspaceOptions} from '@spark-appworks/spark-project-model'
import {createPageDesignInlineDeliveryPort} from '@/services/page-design/page-design-inline-delivery'
import {createPageFileResourceView} from '@/services/project/page-tool-file-dataview'
import {guardPageDesignEditor} from '@/services/page-design/page-design-operation-guard'
import type {createPageToolFilesIo} from '@/lowcode/lowcode-runtime'
import fileConfig from '../../../config/pages/application/project-blueprint/pagedata.json'
import definitionConfig from '../../../config/pages/data-platform/data-space-design/pagedata.json'

const storage=vi.hoisted(()=>({io:undefined as unknown}))
vi.mock('@/lowcode/lowcode-runtime',async importOriginal=>({...await importOriginal<typeof import('@/lowcode/lowcode-runtime')>(),createPageToolFilesIo:()=>storage.io}))

function createFileOwner(options:{rejectFile?:string;scenarioViews?:ProjectWorkspaceOptions['scenarioViews'];scenarioDefinitions?:ProjectWorkspaceOptions['scenarioDefinitions']}={}){
  const files=new Map<string,string>([['APP/PAGE/rule.json','[]'],['APP/PAGE/script.js','base'],['APP/PAGE/style.css','base']])
  const uploads=vi.fn(async(input:{appId:string;pageId:string;fileName:string;text:string})=>{
    if(input.fileName===options.rejectFile)throw Object.assign(new Error(`write rejected: ${input.fileName}`),{definiteNotApplied:true})
    files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)
  })
  storage.io={list:async()=>[],read:async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null,
    upload:uploads,remove:async()=>{},listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null} as unknown as ReturnType<typeof createPageToolFilesIo>
  const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{},...(options.scenarioViews?{scenarioViews:options.scenarioViews}:{}),
    ...(options.scenarioDefinitions?{scenarioDefinitions:options.scenarioDefinitions}:{})})
  workspace.project.setActivePage('PAGE')
  const page=workspace.project.openPageDesign('PAGE');page.markLoaded()
  workspace.project.setActivePage('PAGE')
  const dataSet=DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:fileConfig.tables.ProjectToolFile}})
  const views=new Map<PageToolFileName,ReturnType<typeof createPageFileResourceView>>()
  return {files,uploads,workspace,page,dataSet,views,async bind(name:PageToolFileName){
    const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:name,workspace,assertCurrent:()=>{}})
    await view.refresh();page.bindFileDataView(name,view);views.set(name,view);return view
  },async savePageFile(_pageId:string,name:PageToolFileName){
    const view=views.get(name),row=view?.currentRow,id=row&&view?.getPkKey(row)
    if(!view||!row||id===null||id===undefined)throw new Error(`missing bound DataView for ${name}`)
    const result=await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})
    if(!result.success)throw result.error??new Error(result.message??`save failed: ${name}`)
  },dispose(){dataSet.destroy();workspace.dispose()}}
}

async function loadDefinitions(workspace:ProjectWorkspace,scenarioId:string):Promise<DataSet>{
  const tables=Object.fromEntries(Object.entries(definitionConfig.tables).filter(([,table])=>'resourceId'in table&&table.resourceId.startsWith('pagedata:')))
  const dataSet=DataSet.fromJson({scenarioId:definitionConfig.scenarioId,dataSetName:'Definitions',tables})
  const resource=new ScenarioDefinitionResource({workspace,metadataScenarioId:definitionConfig.scenarioId,targetScenarioId:scenarioId,
    assertCurrent:()=>{},validate:async()=>{}})
  for(const table of Object.values(dataSet.tables))for(const view of table.viewList){
    view.queryContext={...view.queryContext,dataSpaceId:scenarioId}
    view.bindQueryExecutor(resource,{resource:{resourceType:'file',resourceId:table.resourceId!}})
  }
  return dataSet
}

describe('pageDesign inline delivery',()=>{
  it.each(['script.js','style.css'] as const)('keeps successful DataView receipts when %s is rejected',async failedName=>{
    const owner=createFileOwner({rejectFile:failedName})
    try{
      const script=await owner.bind('script.js'),style=await owner.bind('style.css')
      owner.page.setFileText('script.js','new script');owner.page.setFileText('style.css','new style')
      const result=await createPageDesignInlineDeliveryPort({autoSave:true})
        .save({editor:owner.workspace,pageId:'PAGE',savePageFile:owner.savePageFile})
      expect(result).toMatchObject({status:'failed',artifacts:[
        {kind:'page-file',name:'script.js',status:failedName==='script.js'?'dirty':'saved'},
        {kind:'page-file',name:'style.css',status:failedName==='style.css'?'dirty':'saved'},
      ]})
      const succeeded=failedName==='script.js'?style:script,failed=failedName==='script.js'?script:style
      expect(succeeded.hasEditingChanges()||succeeded.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(failed.hasUnconfirmedSave||failed.hasEditingChanges()||failed.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(owner.uploads).toHaveBeenCalledTimes(2)
    }finally{owner.dispose()}
  })

  it('commits only the explicitly scoped dirty ProjectToolFile DataView and leaves other files pending',async()=>{
    const owner=createFileOwner()
    try{
      const script=await owner.bind('script.js'),style=await owner.bind('style.css')
      owner.page.setFileText('script.js','new script');owner.page.setFileText('style.css','new style')
      const result=await createPageDesignInlineDeliveryPort({autoSave:true,saveFileNames:['script.js']})
        .save({editor:owner.workspace,pageId:'PAGE',savePageFile:owner.savePageFile})
      expect(result).toMatchObject({status:'saved',artifacts:[{kind:'page-file',name:'script.js',status:'saved'}]})
      expect(owner.uploads.mock.calls.map(([call])=>call.fileName)).toEqual(['script.js'])
      expect(owner.files.get('APP/PAGE/script.js')).toBe('new script')
      expect(owner.files.get('APP/PAGE/style.css')).toBe('base')
      expect(script.hasUnconfirmedSave||script.hasEditingChanges()||script.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(style.hasEditingChanges()||style.dirtyTracking.hasPendingChanges()).toBe(true)
    }finally{owner.dispose()}
  })

  it('retains an edit made during a DataView upload for the next explicit delivery',async()=>{
    const owner=createFileOwner(),view=await owner.bind('script.js')
    try{
      owner.page.setFileText('script.js','submitted')
      let signalStart:()=>void=()=>undefined,release:()=>void=()=>undefined
      const started=new Promise<void>(resolve=>{signalStart=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
      owner.uploads.mockImplementationOnce(async input=>{signalStart();await gate;owner.files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)})
      const port=createPageDesignInlineDeliveryPort({autoSave:true}),saving=port.save({editor:owner.workspace,pageId:'PAGE',savePageFile:owner.savePageFile})
      await started
      owner.page.setFileText('script.js','next edit')
      release()
      const first=await saving
      const id=view.getPkKey(view.currentRow!)!
      expect(first.status).toBe('failed')
      expect(owner.uploads).toHaveBeenCalledOnce()
      expect(owner.files.get('APP/PAGE/script.js')).toBe('submitted')
      expect(view.getEditingRow(id)?.['text']).toBe('next edit')
      expect(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id)).toBe(true)
      expect(owner.page.getFileText('script.js')).toBe('next edit')
      expect(owner.page.isFileDirty('script.js')).toBe(true)
    }finally{owner.dispose()}
  })

  it('saves scenario-only edits through the same definition DataSet without requiring file delivery',async()=>{
    let remote=JSON.stringify({scenarioId:'SCENE-A',tables:{}}),writes=0
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{},scenarioDefinitions:loadDefinitions,
      scenarioViews:{readScope:()=> 'scope-A',readText:async()=>remote,writeText:async(_id,text)=>{remote=text;writes++}}})
    workspace.project.setActivePage('PAGE');workspace.project.openPageDesign('PAGE').markLoaded()
    const scene=await workspace.loadScenarioDefinitions({scenarioId:'SCENE-A'}),view=scene.getView('DataSpaceLayoutDefinition')!
    try{
      await view.refresh()
      const id=view.getPkKey(view.rows[0]!)!
      view.updateEditingValue(id,'modelPositions',{Model:{x:12,y:30}})
      const result=await createPageDesignInlineDeliveryPort({autoSave:true,
        allowedOperations:{nodeTree:false,dataSet:true,script:false,style:false,blueprint:false}})
        .save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})
      expect(result).toMatchObject({status:'saved',artifacts:[{kind:'scenario-view',name:'SCENE-A',status:'saved'}]})
      expect(writes).toBe(1)
      expect(JSON.parse(remote)).toMatchObject({layout:{modelPositions:{Model:{x:12,y:30}}}})
      expect(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id)).toBe(false)
    }finally{scene.destroy();workspace.dispose()}
  })

  it('shares manual and guarded scenario edits in one DataSet and delivers only on explicit autosave',async()=>{
    let remote=JSON.stringify({scenarioId:'SCENE-A',tables:{}}),writes=0
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{},scenarioDefinitions:loadDefinitions,
      scenarioViews:{readScope:()=> 'scope-A',readText:async()=>remote,writeText:async(_id,text)=>{remote=text;writes++}}})
    workspace.project.setActivePage('PAGE');workspace.project.openPageDesign('PAGE').markLoaded()
    const guarded=guardPageDesignEditor(workspace,{nodeTree:false,dataSet:true,script:false,style:false,blueprint:false})
    const scene=await guarded.loadScenarioDefinitions({scenarioId:'SCENE-A'}),manualView=scene.getView('DataSpaceLayoutDefinition')!
    try{
      await manualView.refresh()
      const id=manualView.getPkKey(manualView.rows[0]!)!
      const aiView=scene.getView('DataSpaceLayoutDefinition')!
      expect(aiView).toBe(manualView)
      aiView.updateEditingValue(id,'modelPositions',{Model:{x:25,y:30}})
      const manual=await createPageDesignInlineDeliveryPort({autoSave:false}).save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})
      expect(manual.artifacts).toEqual([{kind:'scenario-view',name:'SCENE-A',status:'dirty'}])
      expect(writes).toBe(0)
      const delivered=await createPageDesignInlineDeliveryPort({autoSave:true,
        allowedOperations:{nodeTree:false,dataSet:true,script:false,style:false,blueprint:false}})
        .save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})
      expect(delivered.status).toBe('saved')
      expect(writes).toBe(1)
      expect(manualView.hasEditingChanges(id)||manualView.dirtyTracking.hasPendingChanges(id)).toBe(false)
      expect(JSON.parse(remote)).toMatchObject({layout:{modelPositions:{Model:{x:25,y:30}}}})
    }finally{scene.destroy();workspace.dispose()}
  })

  it('leaves a recovered scene attempt pending until a later explicit delivery',async()=>{
    let remote=JSON.stringify({scenarioId:'SCENE-A',tables:{}}),writes=0
    const workspace=new ProjectWorkspace({projectId:'APP',blueprint:{},scenarioDefinitions:loadDefinitions,
      scenarioViews:{readScope:()=> 'scope-A',readText:async()=>remote,writeText:async(_id,text)=>{remote=text;if(++writes===1)throw new Error('scene receipt lost')}}})
    workspace.project.setActivePage('PAGE');workspace.project.openPageDesign('PAGE').markLoaded()
    const scene=await workspace.loadScenarioDefinitions({scenarioId:'SCENE-A'}),view=scene.getView('DataSpaceLayoutDefinition')!
    try{
      await view.refresh();const id=view.getPkKey(view.rows[0]!)!
      view.updateEditingValue(id,'modelPositions',{Model:{x:25,y:30}})
      const port=createPageDesignInlineDeliveryPort({autoSave:true,allowedOperations:{nodeTree:false,dataSet:true,script:false,style:false,blueprint:false}})
      expect((await port.save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})).status).toBe('failed')
      view.updateEditingValue(id,'modelPositions',{Model:{x:55,y:60}})
      const recovered=await port.save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})
      expect(recovered.status).toBe('failed')
      expect(recovered.artifacts).toEqual([{kind:'scenario-view',name:'SCENE-A',status:'dirty'}])
      expect(writes).toBe(1)
      expect(JSON.parse(remote).layout.modelPositions.Model.x).toBe(25)
      expect(view.getEditingRow(id)?.['modelPositions']).toEqual({Model:{x:55,y:60}})
      expect((await port.save({editor:workspace,pageId:'PAGE',scenarioId:'SCENE-A'})).status).toBe('saved')
      expect(writes).toBe(2)
      expect(JSON.parse(remote).layout.modelPositions.Model.x).toBe(55)
    }finally{scene.destroy();workspace.dispose()}
  })

  it('rejects empty inline scope and missing auto-save DataView callback before writing',async()=>{
    const owner=createFileOwner()
    try{
      const view=await owner.bind('script.js');owner.page.setFileText('script.js','dirty')
      await expect(createPageDesignInlineDeliveryPort({autoSave:true,saveFileNames:[]})
        .save({editor:owner.workspace,pageId:'PAGE',savePageFile:owner.savePageFile})).rejects.toThrow('PAGE_DESIGN_SAVE_SCOPE_INVALID')
      await expect(createPageDesignInlineDeliveryPort({autoSave:true})
        .save({editor:owner.workspace,pageId:'PAGE'})).rejects.toThrow('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED')
      expect(owner.uploads).not.toHaveBeenCalled()
      expect(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()).toBe(true)
    }finally{owner.dispose()}
  })

  it('reports actual dirty artifacts on rollback without pretending to undo the DataView',async()=>{
    const owner=createFileOwner(),view=await owner.bind('script.js')
    try{
      owner.page.setFileText('script.js','retained edit')
      const result=await createPageDesignInlineDeliveryPort({autoSave:true}).rollback?.(
        {editor:owner.workspace,pageId:'PAGE'},new Error('AI run failed'))
      expect(result).toMatchObject({status:'skipped',artifacts:[{kind:'page-file',name:'script.js',status:'dirty'}],message:'AI run failed'})
      expect(owner.uploads).not.toHaveBeenCalled()
      expect(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(owner.page.getFileText('script.js')).toBe('retained edit')
    }finally{owner.dispose()}
  })

  it('keeps the confirmed file receipt when the shared scene DataSet commit fails',async()=>{
    const remote=JSON.stringify({scenarioId:'SCENE-A',tables:{}})
    const owner=createFileOwner({scenarioViews:{readScope:()=> 'scope-A',readText:async()=>remote,writeText:async()=>{throw new Error('scene write rejected')}},
      scenarioDefinitions:loadDefinitions})
    try{
      const fileView=await owner.bind('script.js');owner.page.setFileText('script.js','confirmed script')
      const scene=await owner.workspace.loadScenarioDefinitions({scenarioId:'SCENE-A'}),sceneView=scene.getView('DataSpaceLayoutDefinition')!
      await sceneView.refresh();sceneView.updateEditingValue(sceneView.getPkKey(sceneView.rows[0]!)!,'modelPositions',{Model:{x:5,y:6}})
      const result=await createPageDesignInlineDeliveryPort({autoSave:true})
        .save({editor:owner.workspace,pageId:'PAGE',scenarioId:'SCENE-A',savePageFile:owner.savePageFile})
      expect(result).toMatchObject({status:'failed',artifacts:[
        {kind:'page-file',name:'script.js',status:'saved'},
        {kind:'scenario-view',name:'SCENE-A',status:'dirty'},
      ]})
      expect(owner.files.get('APP/PAGE/script.js')).toBe('confirmed script')
      expect(fileView.hasUnconfirmedSave||fileView.hasEditingChanges()||fileView.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(sceneView.hasEditingChanges()||sceneView.dirtyTracking.hasPendingChanges()).toBe(true)
    }finally{owner.dispose()}
  })
})
