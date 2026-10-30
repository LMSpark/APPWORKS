import {ref, shallowRef} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY as SCENARIO} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {RendererButton, RendererForm, Spark} from '@spark-appworks/spark-component'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
import type {DevState} from '@/views/app/dev-system/useDevState'
import DevSystem from '@/views/app/dev-system/DevSystem.vue'

let testState:DevState
vi.mock('@/views/app/dev-system/useDevState',()=>({useDevState:()=>testState}))
vi.mock('@/composables/useApplicationRouter',()=>({useApplicationRouter:()=>({router:{push:vi.fn()}})}))
vi.mock('@/services/sse-events',()=>({onPageConfigChange:()=>()=>{}}))
vi.mock('vue-router',async original=>({...await original<typeof import('vue-router')>(),onBeforeRouteLeave:vi.fn()}))

async function createTarget(projectId='APP-A') {
  const rows:DataRow[]=[
    {rowid:'ROOT',SysId:projectId,prowid:'000000',FunOrderValue:0,name:'Project',FunName:'Project',conType:'Model',NavigationUrl:''},
    {rowid:'NODE-A',SysId:projectId,prowid:'ROOT',FunOrderValue:0,name:'Orders',FunName:'Orders',conType:'Navitem',NavigationUrl:'cfg:orders'},
    {rowid:'NODE-B',SysId:projectId,prowid:'ROOT',FunOrderValue:1,name:'Billing',FunName:'Billing',conType:'Navitem',NavigationUrl:'cfg:billing'},
  ]
  const fields=Object.keys(rows[0]!)
  const dataSet=DataSet.fromJson({scenarioId:SCENARIO,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${SCENARIO}p000`,modelName:'Base_NavigationInfo'},
    columns:fields.map(name=>({name,type:name==='FunOrderValue'?'number':'string',isPrimaryKey:name==='rowid'})),
    views:{default:{autoLoad:false,treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',rootParentValue:'000000'}}},
  }}})
  const result=()=>({rows:rows.map(row=>({...row})),total:rows.length,resultPrimaryKey:'rowid',rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string})=>{
      if(identity.scenarioId!==SCENARIO||identity.metaName!=='Base_NavigationInfo')throw new Error('wrong query identity')
    },
    fieldAccess:()=>({read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),
    readFieldAccess:()=> 'visible' as const,addActionState:()=> 'enabled' as const,editActionState:()=> 'enabled' as const,
    deleteActionState:()=> 'enabled' as const,createChildActionState:()=> 'enabled' as const,viewActionState:()=> 'enabled' as const})
  const saved:Array<{model:string;rows:DataRow[]}>=[]
  dataSet.getView('Base_NavigationInfo')!.bindQueryExecutor({queryColumns:view=>view.columns,executeQuery:async()=>result(),
    save:async command=>command.changes.map(change=>{
      const changed=[...(change.changes.changed??[])]
      saved.push({model:change.identity.metaName,rows:changed})
      for(const patch of changed){const row=rows.find(row=>row['rowid']===patch['rowid']);if(row)Object.assign(row,patch)}
      return {metaName:change.identity.metaName,added:[],changed,deleted:[],changedFields:changed.map(row=>Object.keys(row)),context:result()}
    })})
  const owner=new BlueprintWorkspaceDataView(dataSet,projectId,()=>{})
  await owner.loadProjectTree();await owner.load('NODE-A')
  const runtime=new PageRuntime({pageId:'dev-system',scenarioIds:[SCENARIO],mainScenarioId:SCENARIO,loadScenario:async()=>dataSet})
  await runtime.load()
  return {owner,runtime,dataSet,rows,saved,dispose(){owner.dispose();runtime.dispose();dataSet.destroy()}}
}

async function mountWorkbench(showImport=false) {
  const first=await createTarget(),next=await createTarget('APP-B')
  const owner=shallowRef(first.owner),runtime=shallowRef(first.runtime)
  const selectedNode=shallowRef<DevState['selectedNode']['value']>(first.owner.treeProjection().children[0]!)
  const activePageId=ref('orders'),hasAnyDirty=ref(false)
  const importVisible=ref(false),runImport=vi.fn()
  const runPageDesignAi=vi.fn(async()=>{}),saveAll=vi.fn(async()=>{await owner.value.save()})
  testState={get projectId(){return owner.value.projectId},blueprintWorkspaceDataView:owner,blueprintPageRuntime:runtime,
    selectedNode,activePageId,hasAnyDirty,blueprintDraft:{nodeId:'NODE-A',capability:{name:'Orders'},navigation:{target:'cfg:orders'}},
    pageFileNames:['rule.json','script.js','style.css'],pageList:ref([{pageId:'orders',description:''},{pageId:'billing',description:''}]),
    hasPendingDevSystemWrite:()=>false,editor:{notifyPageFileChanged:vi.fn()},projectRevision:ref(0),externalDataViewRevision:ref(0),
    isPageToolFileDirty:()=>false,runPageDesignAi,saveAll,initialize:vi.fn(async()=>{}),addStatus:vi.fn(),
    blueprintLoading:ref(false),blueprintSaving:ref(false),pageIoBusy:ref(false),allSaving:ref(false),blueprintDirty:ref(false),
    hasAnyFileDirty:ref(false),pageDesignAiRunning:ref(false),aiToolApprovalPending:ref([]),statusMessages:ref([]),
    projectPlanningDocumentImportDialogVisible:importVisible,projectPlanningDocumentUploading:ref(false),projectPlanningAiRunning:ref(false),
    projectPlanningDocumentFileName:ref(''),projectPlanningAttachmentRef:ref('stored-reference'),projectPlanningAiTimeline:ref([]),
    closeProjectPlanningDocumentImportDialog:()=>{importVisible.value=false},runProjectPlanningDocumentImportAi:runImport} as unknown as DevState
  const wrapper=mount(DevSystem,{global:{plugins:[ElementPlus,Spark.createPlugin({registry:Spark.createRegistry()})],stubs:{
    ProjectBlueprintTree:true,BlueprintWorkspace:true,NavHostProjectPicker:true,ProjectPlanningDocumentImportDialog:!showImport,AiToolApprovalPanel:true,teleport:true,
  }}})
  await flushPromises()
  const prompt=()=>{
    const form=wrapper.findComponent(RendererForm)
    expect(form.exists()).toBe(true)
    const key=form.props('dataViewKey')
    expect(typeof key).toBe('string')
    const view=runtime.value.resolveView(String(key))
    expect(view).toBeDefined()
    return {form,view:view!}
  }
  const aiButton=()=>wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='AI 编辑')!
  return {first,next,wrapper,prompt,aiButton,runPageDesignAi,saveAll,hasAnyDirty,importVisible,runImport,
    async openImport(){importVisible.value=true;await flushPromises()},
    async clearSelection(){selectedNode.value=null;activePageId.value='';await flushPromises()},
    async switchNode(){await owner.value.load('NODE-B');selectedNode.value=owner.value.treeProjection().children[1]!;activePageId.value='billing';await flushPromises()},
    async switchRuntime(){owner.value=next.owner;runtime.value=next.runtime;selectedNode.value=next.owner.treeProjection().children[0]!;activePageId.value='orders';await flushPromises()},
    dispose(){wrapper.unmount();first.dispose();next.dispose()}}
}

describe('DevSystem standard command input DataView',()=>{
  it('edits the prompt through the standard field and sends its overlay to the existing AI command',async()=>{
    const fixture=await mountWorkbench()
    try{
      const {form,view}=fixture.prompt()
      expect(view.dataSet).toBe(fixture.first.dataSet)
      expect(view.dataTable?.resourceType).toBe('static-data')
      expect(fixture.aiButton().find('button').attributes('disabled')).toBeDefined()
      expect(form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').attributes('disabled')).toBeUndefined()
      await form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').setValue('Add validation to the orders page');await flushPromises()
      expect(view.getEditingRow(view.getPkKey(view.currentRow!)!)?.['businessPrompt']).toBe('Add validation to the orders page')
      expect(fixture.first.owner.dirty).toBe(false)
      expect(fixture.aiButton().find('button').attributes('disabled')).toBeUndefined()
      await fixture.aiButton().find('button').trigger('click');await flushPromises()
      expect(fixture.runPageDesignAi).toHaveBeenCalledExactlyOnceWith({description:'Add validation to the orders page'})
    }finally{fixture.dispose()}
  })

  it('keeps command input outside the real blueprint save range',async()=>{
    const fixture=await mountWorkbench()
    try{
      const {form,view}=fixture.prompt()
      await form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').setValue('Unsaved AI instruction');await flushPromises()
      fixture.first.owner.update('FunName','Saved title');fixture.hasAnyDirty.value=true;await flushPromises()
      const save=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='全部保存')!
      await save.find('button').trigger('click');await flushPromises()
      expect(fixture.saveAll).toHaveBeenCalledOnce()
      expect(fixture.first.saved).toHaveLength(1)
      expect(fixture.first.saved[0]).toMatchObject({model:'Base_NavigationInfo',rows:[{rowid:'NODE-A',FunName:'Saved title'}]})
      expect(fixture.first.saved[0]!.rows.every(row=>!Object.hasOwn(row,'businessPrompt'))).toBe(true)
      expect(fixture.first.owner.dirty).toBe(false)
      expect(view.getEditingRow(view.getPkKey(view.currentRow!)!)?.['businessPrompt']).toBe('Unsaved AI instruction')
    }finally{fixture.dispose()}
  })

  it('releases old prompt views and rejects an old AI callback after node and runtime changes',async()=>{
    const fixture=await mountWorkbench()
    try{
      const old=fixture.prompt(),oldAction=fixture.aiButton().props('onClick')
      await old.form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').setValue('Old target input');await flushPromises()
      await fixture.switchNode()
      expect(fixture.first.dataSet.getTable(old.view.tableName)).toBeUndefined()
      const nextNode=fixture.prompt()
      expect(nextNode.form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').element.value).toBe('')
      await nextNode.form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').setValue('New target input');await flushPromises()
      if(typeof oldAction==='function')oldAction()
      await flushPromises();expect(fixture.runPageDesignAi).not.toHaveBeenCalled()
      await fixture.switchRuntime()
      expect(fixture.first.dataSet.getTable(nextNode.view.tableName)).toBeUndefined()
      const nextRuntime=fixture.prompt()
      expect(nextRuntime.view.dataSet).toBe(fixture.next.dataSet)
      expect(nextRuntime.form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').element.value).toBe('')
      await nextRuntime.form.find<HTMLInputElement>('input[placeholder="描述 AI 编辑需求"]').setValue('Current target input');await flushPromises()
      await fixture.aiButton().find('button').trigger('click');await flushPromises()
      expect(fixture.runPageDesignAi).toHaveBeenCalledExactlyOnceWith({description:'Current target input'})
      fixture.wrapper.unmount()
      expect(fixture.next.dataSet.getTable(nextRuntime.view.tableName)).toBeUndefined()
    }finally{fixture.dispose()}
  })

  it('binds the project import command without requiring a selected node',async()=>{
    const fixture=await mountWorkbench(true)
    try{
      await fixture.clearSelection();await fixture.openImport()
      const start=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='开始项目策划')
      expect(start?.exists()).toBe(true)
      expect(start!.props('dataViewKey')).toBe(fixture.first.owner.standardComponentBinding.dataViewKey)
      await start!.find('button').trigger('click')
      expect(fixture.runImport).toHaveBeenCalledOnce()
    }finally{fixture.dispose()}
  })

  it.each(['same project','new runtime'])('does not reuse an old import callback after reopening in %s',async target=>{
    const fixture=await mountWorkbench(true)
    try{
      await fixture.openImport()
      const oldAction=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='开始项目策划')!.props('onClick')
      expect(typeof oldAction).toBe('function')
      if(target==='new runtime')await fixture.switchRuntime()
      else{fixture.importVisible.value=false;await flushPromises()}
      expect(fixture.importVisible.value).toBe(false)
      await fixture.openImport()
      if(typeof oldAction==='function')oldAction()
      await flushPromises();expect(fixture.runImport).not.toHaveBeenCalled()
      const start=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='开始项目策划')!
      await start.find('button').trigger('click')
      expect(fixture.runImport).toHaveBeenCalledOnce()
    }finally{fixture.dispose()}
  })
})
