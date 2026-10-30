import {defineComponent, h, ref, shallowRef, watch} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, buildDataViewKey, resolveDataViewKey, type DataRow} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {DATA_ROW, FieldText, PAGE_RUNTIME, RendererButton, RendererTree, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import ProjectBlueprintTree from '@/views/app/dev-system/ProjectBlueprintTree.vue'
import {BlueprintWorkspaceDataView, isBlueprintViewAttachedToRuntime} from '@/services/project/blueprint-workspace-dataview'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME} from '@/lowcode/resources/shared/builtin-blueprint-node-resource'
import type {DevState} from '@/views/app/dev-system/useDevState'

function createOwner(nodeName='Orders'):{owner:BlueprintWorkspaceDataView;dataSet:DataSet} {
  const rows:DataRow[]=[
    {rowid:'ROOT',SysId:'APP-A',prowid:'000000',FunOrderValue:0,name:'APP-A',FunName:'APP-A',conType:'Model',NavigationImageWxz:'Grid',NavigationUrl:'',ChildItemLocation:'Left'},
    {rowid:'NODE-A',SysId:'APP-A',prowid:'ROOT',FunOrderValue:0,name:nodeName,FunName:nodeName,conType:'Navitem',NavigationImageWxz:'Document',NavigationUrl:'cfg:orders',ChildItemLocation:'Left'},
  ]
  const fields=['rowid','SysId','prowid','FunOrderValue','name','FunName','conType','NavigationImageWxz','NavigationUrl','ChildItemLocation']
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`,modelName:'Base_NavigationInfo'},
    columns:fields.map(name=>({name,type:name==='FunOrderValue'?'number':'string',isPrimaryKey:name==='rowid'})),
    views:{default:{autoLoad:false,treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',rootParentValue:'000000'}}},
  }}})
  const view=dataSet.getView('Base_NavigationInfo','default')!
  view.bindQueryExecutor({queryColumns:target=>target.columns,executeQuery:async()=>({
    rows,total:rows.length,resultPrimaryKey:'rowid',rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string})=>{
      if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('blueprint identity mismatch')
    },
    fieldAccess:(key:unknown,field:string)=>rows.some(row=>row['rowid']===key&&Object.hasOwn(row,field))
      ? {read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}
      : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
    readFieldAccess:(row:Readonly<DataRow>,field:string)=>Object.hasOwn(row,field)?'visible' as const:'invisible' as const,
    addActionState:()=>'enabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'enabled' as const,
    createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const,
  })})
  return {owner:new BlueprintWorkspaceDataView(dataSet,'APP-A',()=>undefined),dataSet}
}

function createBuiltinFileOwner(nodeName='Orders'):{owner:BlueprintWorkspaceDataView;dataSet:DataSet} {
  const rows:DataRow[]=[
    {rowid:'ROOT',SysId:'D99A1DCE9894698799101EFD70F8FC76',prowid:'000000',FunOrderValue:0,name:'AppWorks',FunName:'AppWorks',conType:'Model',NavigationImageWxz:'Grid',NavigationUrl:'',ChildItemLocation:'Left'},
    {rowid:'NODE-A',SysId:'D99A1DCE9894698799101EFD70F8FC76',prowid:'ROOT',FunOrderValue:0,name:nodeName,FunName:nodeName,conType:'Navitem',NavigationImageWxz:'Document',NavigationUrl:'cfg:orders',ChildItemLocation:'Left'},
  ]
  const fields=['rowid','SysId','prowid','FunOrderValue','name','FunName','conType','NavigationImageWxz','NavigationUrl','ChildItemLocation']
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables:{[BUILTIN_BLUEPRINT_NODE_TABLE_NAME]:{
    resourceType:'file',resourceId:BUILTIN_BLUEPRINT_NODE_RESOURCE_ID,
    columns:fields.map(name=>({name,type:name==='FunOrderValue'?'number':'string',isPrimaryKey:name==='rowid'})),
    views:{default:{autoLoad:false,treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',rootParentValue:'000000'}}},
  }}})
  const view=dataSet.getView(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,'default')!
  view.bindQueryExecutor({queryColumns:target=>target.columns,executeQuery:async()=>({
    rows,total:rows.length,resultPrimaryKey:'rowid',rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string;resource?:{resourceType:string;resourceId:string}})=>{
      if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!==BUILTIN_BLUEPRINT_NODE_TABLE_NAME
        ||identity.resource?.resourceType!=='file'||identity.resource.resourceId!==BUILTIN_BLUEPRINT_NODE_RESOURCE_ID)throw new Error('builtin blueprint identity mismatch')
    },
    fieldAccess:(key:unknown,field:string)=>rows.some(row=>row['rowid']===key&&Object.hasOwn(row,field))
      ? {read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}
      : {read:'invisible' as const,write:'denied' as const,component:'hidden' as const,required:false,writeMode:'readonly' as const},
    readFieldAccess:(_row:Readonly<DataRow>,field:string)=>fields.includes(field)?'visible' as const:'invisible' as const,
    addActionState:()=>'disabled' as const,editActionState:()=>'disabled' as const,deleteActionState:()=>'disabled' as const,
    createChildActionState:()=>'disabled' as const,viewActionState:()=>'enabled' as const,
  })},{resource:{resourceType:'file',resourceId:BUILTIN_BLUEPRINT_NODE_RESOURCE_ID}})
  return {owner:new BlueprintWorkspaceDataView(dataSet,'D99A1DCE9894698799101EFD70F8FC76',()=>undefined),dataSet}
}

describe('ProjectBlueprintTree standard DataView consumer',()=>{
  it('binds a local file owner through its exact resource DataView key',async()=>{
    const {owner,dataSet}=createBuiltinFileOwner()
    await owner.loadProjectTree()
    const runtime=new PageRuntime({pageId:'builtin-project-blueprint-tree-consumer',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,loadScenario:async()=>dataSet})
    await runtime.load()
    expect(isBlueprintViewAttachedToRuntime(runtime,LOWCODE_APPLICATION_CATALOG_FORM_KEY,owner)).toBe(true)
    const fileViewKey=buildDataViewKey(BUILTIN_BLUEPRINT_NODE_TABLE_NAME,owner.view.viewId,LOWCODE_APPLICATION_CATALOG_FORM_KEY)
    expect(resolveDataViewKey(fileViewKey,dataSet)).toBe(owner.view)
    const other=createBuiltinFileOwner('Other App')
    expect(isBlueprintViewAttachedToRuntime(runtime,LOWCODE_APPLICATION_CATALOG_FORM_KEY,other.owner)).toBe(false)
    const otherRuntime=new PageRuntime({pageId:'other-builtin-project-blueprint-tree-consumer',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,loadScenario:async()=>other.dataSet})
    await otherRuntime.load()
    expect(otherRuntime.resolveView(fileViewKey)).toBe(other.owner.view)
    expect(otherRuntime.resolveView(fileViewKey)).not.toBe(owner.view)
    other.owner.dispose();otherRuntime.dispose();other.dataSet.destroy()
    const state={projectId:'D99A1DCE9894698799101EFD70F8FC76',project:{rootNode:{id:'ROOT'}},blueprintWorkspaceDataView:shallowRef(owner),blueprintPageRuntime:shallowRef(runtime),blueprintLoading:ref(false),
      selectedNode:ref(null),addRootNode:vi.fn(),openProjectPlanningDocumentImportDialog:vi.fn(),childCreateActionState:()=> 'enabled',
      addChildNodeById:vi.fn(),selectNodeById:vi.fn(),moveBlueprintNodeRelative:vi.fn(),removeNodeById:vi.fn(),addStatus:vi.fn()} as unknown as DevState
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'builtin-project-blueprint-tree-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(ProjectBlueprintTree,{state})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    try{
      const tree=wrapper.findComponent(RendererTree)
      expect(tree.props('dataViewKey')).toBe(fileViewKey)
      expect(tree.props('dataSource')).toBeUndefined()
      const fieldNodes=wrapper.findAllComponents(FieldText)
      expect(fieldNodes.length).toBeGreaterThan(0)
      expect(fieldNodes.every(field=>field.props('dataViewKey')===fileViewKey&&!('dataSource' in field.props()))).toBe(true)
      const boundActions=wrapper.findAllComponents(RendererButton).filter(button=>button.props('dataViewKey')===fileViewKey)
      expect(boundActions.length).toBeGreaterThan(0)
      expect(tree.text()).toContain('Orders')
    }finally{wrapper.unmount();owner.dispose();runtime.dispose();dataSet.destroy()}
  })

  it('binds RendererTree to the formal owner and dispatches row actions by stable key',async()=>{
    const {owner,dataSet}=createOwner()
    await owner.loadProjectTree()
    const runtime=new PageRuntime({pageId:'project-blueprint-tree-consumer',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,loadScenario:async()=>dataSet})
    await runtime.load()
    const addChildNodeById=vi.fn(async()=>{})
    const selectNodeById=vi.fn(async()=>{})
    const state={projectId:'APP-A',project:{rootNode:{id:'ROOT'}},blueprintWorkspaceDataView:shallowRef(owner),blueprintPageRuntime:shallowRef(runtime),blueprintLoading:ref(false),
      selectedNode:ref(null),addRootNode:vi.fn(),openProjectPlanningDocumentImportDialog:vi.fn(),childCreateActionState:(id:string)=>owner.childCreateActionState(id),
      addChildNodeById,selectNodeById,moveBlueprintNodeRelative:vi.fn(async()=>{}),removeNodeById:vi.fn(),addStatus:vi.fn()} as unknown as DevState
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'project-blueprint-tree-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(ProjectBlueprintTree,{state})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    try{
      await wrapper.vm.$nextTick()
      await Promise.resolve()
      const tree=wrapper.findComponent(RendererTree)
      expect(tree.props('dataViewKey')).toBe(`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`)
      expect(tree.text()).toContain('Orders')

      const orderNode=wrapper.find('.el-tree-node[data-key="NODE-A"]')
      const addButton=orderNode.findAll('button').find(button=>button.text().includes('添加子节点'))
      expect(addButton?.exists()).toBe(true)
      await addButton!.trigger('click')
      expect(addChildNodeById).toHaveBeenCalledOnce()
      expect(addChildNodeById).toHaveBeenCalledWith('NODE-A')
      expect(selectNodeById).not.toHaveBeenCalled()

      await orderNode.find('.el-tree-node__content').trigger('click')
      await Promise.resolve()
      expect(selectNodeById).toHaveBeenCalledWith('NODE-A')
    }finally{wrapper.unmount();owner.dispose();runtime.dispose();dataSet.destroy()}
  })
})

async function mountSwitchableTree() {
  const first=createOwner('Old Orders'),next=createOwner('New Orders')
  await first.owner.loadProjectTree();await first.owner.load('NODE-A')
  await next.owner.loadProjectTree();await next.owner.load('NODE-A')
  const createRuntime=async(dataSet:DataSet)=>{
    const runtime=new PageRuntime({pageId:'blueprint-tree-switch',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,loadScenario:async()=>dataSet})
    await runtime.load();return runtime
  }
  const firstRuntime=await createRuntime(first.dataSet),nextRuntime=await createRuntime(next.dataSet)
  const ownerRef=shallowRef(first.owner),runtimeRef=shallowRef(firstRuntime)
  const selectedNode=shallowRef<DevState['selectedNode']['value']>(null)
  const addRootNode=vi.fn(),removeNodeById=vi.fn(),moveBlueprintNodeRelative=vi.fn(async()=>{})
  const state={projectId:'APP-A',project:{rootNode:{id:'ROOT'}},blueprintWorkspaceDataView:ownerRef,blueprintPageRuntime:runtimeRef,
    blueprintLoading:ref(false),selectedNode,addRootNode,openProjectPlanningDocumentImportDialog:vi.fn(),
    childCreateActionState:(id:string)=>ownerRef.value.childCreateActionState(id),addChildNodeById:vi.fn(async()=>{}),
    selectNodeById:vi.fn(async()=>{}),moveBlueprintNodeRelative,removeNodeById,addStatus:vi.fn()} as unknown as DevState
  const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
  const Host=defineComponent({setup(){
    const {sparkProvide}=useSparkComponent({type:'switchable-blueprint-tree-host'})
    watch(runtimeRef,value=>sparkProvide(PAGE_RUNTIME,value),{immediate:true,flush:'sync'})
    return()=>h(ProjectBlueprintTree,{state})
  }})
  const DeleteRowProbe=defineComponent({setup(){
    const {sparkConsume}=useSparkComponent({type:'delete-row-context-probe'})
    const row=sparkConsume(DATA_ROW)
    return()=>h('p',{'data-delete-row':String(row?.['rowid']??'')})
  }})
  const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{teleport:true,DisplayAlert:DeleteRowProbe}}})
  await flushPromises()
  return {first,next,state,selectedNode,wrapper,addRootNode,removeNodeById,moveBlueprintNodeRelative,
    async switchRuntime(){ownerRef.value=next.owner;runtimeRef.value=nextRuntime;await flushPromises()},
    dispose(){wrapper.unmount();first.owner.dispose();next.owner.dispose();firstRuntime.dispose();nextRuntime.dispose();first.dataSet.destroy();next.dataSet.destroy()}}
}

describe('ProjectBlueprintTree command context lifecycle',()=>{
  it('binds the add-module action to the exact tree DataView and dispatches once',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      const add=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='新增模块')
      expect(add?.exists()).toBe(true)
      expect(add!.props('dataViewKey')).toBe(fixture.first.owner.standardComponentBinding.dataViewKey)
      await add!.find('button').trigger('click')
      expect(fixture.addRootNode).toHaveBeenCalledOnce()
    }finally{fixture.dispose()}
  })

  it('renders the new view when the runtime changes with the same full binding key',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      expect(fixture.wrapper.findComponent(RendererTree).text()).toContain('Old Orders')
      await fixture.switchRuntime()
      const tree=fixture.wrapper.findComponent(RendererTree)
      expect(tree.text()).toContain('New Orders')
      expect(tree.text()).not.toContain('Old Orders')
    }finally{fixture.dispose()}
  })

  it('keeps the tree instance and filter when only the selected node changes',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      const tree=fixture.wrapper.findComponent(RendererTree),instanceId=tree.vm.$.uid,input=tree.find('input').element
      await tree.find('input').setValue('Orders')
      fixture.selectedNode.value=fixture.first.owner.treeProjection().children[0]!
      await flushPromises()
      const selectedTree=fixture.wrapper.findComponent(RendererTree)
      expect(selectedTree.vm.$.uid).toBe(instanceId)
      expect(selectedTree.find('input').element).toBe(input)
      expect(selectedTree.find('input').element.value).toBe('Orders')
      expect(selectedTree.props('currentKey')).toBe('NODE-A')
    }finally{fixture.dispose()}
  })

  it('does not let an old delete confirmation target the replacement owner with the same row id',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      const leaf=fixture.wrapper.find('.el-tree-node[data-key="NODE-A"]')
      const remove=leaf.findAll('button').find(button=>button.text()==='删除')
      expect(remove?.exists()).toBe(true)
      await remove!.trigger('click');await flushPromises()
      expect(fixture.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='确定删除')).toBe(true)
      await fixture.switchRuntime()
      const confirm=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确定删除')
      if(confirm)await confirm.find('button').trigger('click')
      expect(fixture.removeNodeById).not.toHaveBeenCalled()
    }finally{fixture.dispose()}
  })

  it('rejects a retained drag callback after its runtime and owner were replaced',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      const onDrop=fixture.wrapper.findComponent(RendererTree).props('onNodeDrop')
      expect(typeof onDrop).toBe('function')
      onDrop!({draggedKey:'NODE-A',targetKey:'ROOT',dropType:'inner'},{cancel:false})
      await flushPromises()
      expect(fixture.moveBlueprintNodeRelative).toHaveBeenCalledExactlyOnceWith({nodeId:'NODE-A',targetNodeId:'ROOT',position:'inner'})
      fixture.moveBlueprintNodeRelative.mockClear()
      await fixture.switchRuntime()
      const control={cancel:false}
      onDrop!({draggedKey:'NODE-A',targetKey:'ROOT',dropType:'inner'},control)
      await flushPromises()
      expect(control.cancel).toBe(true)
      expect(fixture.moveBlueprintNodeRelative).not.toHaveBeenCalled()
    }finally{fixture.dispose()}
  })

  it('confirms the captured row while the original view and parent identity are current',async()=>{
    const fixture=await mountSwitchableTree()
    try{
      await fixture.first.owner.load('ROOT')
      const remove=fixture.wrapper.find('.el-tree-node[data-key="NODE-A"]').findAll('button').find(button=>button.text()==='删除')
      expect(remove?.exists()).toBe(true)
      await remove!.trigger('click');await flushPromises()
      expect(fixture.first.owner.view.currentRow?.['rowid']).toBe('ROOT')
      expect(fixture.wrapper.find('[data-delete-row]').attributes('data-delete-row')).toBe('NODE-A')
      const confirm=fixture.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确定删除')
      expect(confirm?.exists()).toBe(true)
      await confirm!.find('button').trigger('click')
      expect(fixture.removeNodeById).toHaveBeenCalledExactlyOnceWith('NODE-A')
      expect(fixture.state.selectNodeById).not.toHaveBeenCalled()
    }finally{fixture.dispose()}
  })
})
