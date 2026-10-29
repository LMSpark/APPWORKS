import {defineComponent, h, ref, shallowRef} from 'vue'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {PAGE_RUNTIME, RendererTree, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import ProjectBlueprintTree from '@/views/app/dev-system/ProjectBlueprintTree.vue'
import {BlueprintWorkspaceDataView, isBlueprintViewAttachedToRuntime} from '@/services/project/blueprint-workspace-dataview'
import {BUILTIN_BLUEPRINT_NODE_RESOURCE_ID, BUILTIN_BLUEPRINT_NODE_TABLE_NAME} from '@/lowcode/resources/shared/builtin-blueprint-node-resource'
import type {DevState} from '@/views/app/dev-system/useDevState'

function createOwner():{owner:BlueprintWorkspaceDataView;dataSet:DataSet} {
  const rows:DataRow[]=[
    {rowid:'ROOT',SysId:'APP-A',prowid:'000000',FunOrderValue:0,name:'APP-A',FunName:'APP-A',conType:'Model',NavigationImageWxz:'Grid',NavigationUrl:'',ChildItemLocation:'Left'},
    {rowid:'NODE-A',SysId:'APP-A',prowid:'ROOT',FunOrderValue:0,name:'Orders',FunName:'Orders',conType:'Navitem',NavigationImageWxz:'Document',NavigationUrl:'cfg:orders',ChildItemLocation:'Left'},
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

function createBuiltinFileOwner():{owner:BlueprintWorkspaceDataView;dataSet:DataSet} {
  const rows:DataRow[]=[
    {rowid:'ROOT',SysId:'D99A1DCE9894698799101EFD70F8FC76',prowid:'000000',FunOrderValue:0,name:'AppWorks',FunName:'AppWorks',conType:'Model',NavigationImageWxz:'Grid',NavigationUrl:'',ChildItemLocation:'Left'},
    {rowid:'NODE-A',SysId:'D99A1DCE9894698799101EFD70F8FC76',prowid:'ROOT',FunOrderValue:0,name:'Orders',FunName:'Orders',conType:'Navitem',NavigationImageWxz:'Document',NavigationUrl:'cfg:orders',ChildItemLocation:'Left'},
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
  it('binds a local file owner through the standard dataSource contract without inventing a model key',async()=>{
    const {owner,dataSet}=createBuiltinFileOwner()
    await owner.loadProjectTree()
    const runtime=new PageRuntime({pageId:'builtin-project-blueprint-tree-consumer',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY],
      mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,loadScenario:async()=>dataSet})
    await runtime.load()
    expect(isBlueprintViewAttachedToRuntime(runtime,LOWCODE_APPLICATION_CATALOG_FORM_KEY,owner)).toBe(true)
    const other=createBuiltinFileOwner()
    expect(isBlueprintViewAttachedToRuntime(runtime,LOWCODE_APPLICATION_CATALOG_FORM_KEY,other.owner)).toBe(false)
    other.owner.dispose();other.dataSet.destroy()
    const state={projectId:'D99A1DCE9894698799101EFD70F8FC76',project:{rootNode:{id:'ROOT'}},blueprintWorkspaceDataView:shallowRef(owner),blueprintLoading:ref(false),
      selectedNode:ref(null),addRootNode:vi.fn(),openProjectPlanningDocumentImportDialog:vi.fn(),childCreateActionState:()=> 'disabled',
      addChildNodeById:vi.fn(),selectNodeById:vi.fn(),moveBlueprintNodeRelative:vi.fn(),removeNodeById:vi.fn(),addStatus:vi.fn()} as unknown as DevState
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'builtin-project-blueprint-tree-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(ProjectBlueprintTree,{state})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    try{
      const tree=wrapper.findComponent(RendererTree)
      expect(tree.props('dataViewKey')).toBeUndefined()
      expect(tree.props('dataSource')).toBe(owner.view)
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
    const state={projectId:'APP-A',project:{rootNode:{id:'ROOT'}},blueprintWorkspaceDataView:shallowRef(owner),blueprintLoading:ref(false),
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
