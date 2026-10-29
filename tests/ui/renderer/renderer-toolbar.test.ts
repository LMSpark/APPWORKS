import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref, shallowReactive, type Component } from 'vue'
import ElementPlus, {ElTable, ElTableColumn, ElTree} from 'element-plus'
import { RendererToolbar, RendererTable, RendererTree, RendererList, RendererForm, RendererDetail,
  RendererVirtualCard, RendererTabs, RendererSteps, RendererCollapse, RendererButton, FieldText,
  Spark, PAGE_RUNTIME, PAGE_RUNTIME_SERVICES, useSparkComponent, type RToolbarProps } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import type { SparkNode } from '@spark-appworks/spark-data'
import type { BeforeRenderContext } from '../../../packages/spark-component/src/components/support/beforeRender'
import {buildTreeTableRows} from '../../../packages/spark-component/src/components/containers/data-views/view-tree-state'

const originalStubs = config.global.stubs
afterEach(() => { config.global.stubs = originalStubs; vi.unstubAllGlobals() })

const containers: Array<[string, Component]> = [
  ['table', RendererTable], ['tree', RendererTree], ['list', RendererList], ['form', RendererForm],
  ['detail', RendererDetail], ['virtual-card', RendererVirtualCard], ['tabs', RendererTabs],
  ['steps', RendererSteps], ['collapse', RendererCollapse],
]

async function mountContainer(component: Component, props: {toolbar?: RToolbarProps; actions?: RToolbarProps}) {
  const input = shallowReactive(props)
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  delete stubs['el-table']; delete stubs['el-table-column']
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'Toolbar', tables: {Items: {
    tableName: 'Items', modelBinding: {modelId: 'MODEL', modelName: 'Items'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}],
    views: {default: {rows: [{id: 'A', label: 'First'}, {id: 'B', label: 'Second'}]},
      other: {rows: [{id: 'C', label: 'Other'}]}},
  }}})
  ds.getView('Items', 'default')!.setCurrentRowById('A')
  ds.getView('Items', 'other')!.setCurrentRowById('C')
  const runtime = new PageRuntime({pageId: 'toolbar', scenarioIds: ['SCENE'], loadScenario: async () => ds})
  await runtime.load()
  const registry = Spark.createRegistry()
  registry.register({type: 'r-toolbar', component: RendererToolbar})
  registry.register({type: 'r-button', component: RendererButton})
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'toolbar-test-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(component, {dataViewKey: 'SCENE@Items@default', autoColumns: false,
      showDataViewMeta: false, showPagination: false, ...input}, {default: () => h('span', 'body')})
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})],
    components: {'el-table': ElTable, 'el-table-column': ElTableColumn},
    stubs: {'el-table': ElTable, 'el-table-column': ElTableColumn}}})
  await flushPromises()
  return {wrapper, ds, input, dispose() {wrapper.unmount(); runtime.dispose()}}
}

describe('container toolbar contract through the real renderer', () => {
  it.each(containers)('%s uses declared defaults without expanding minimal configuration', async (name, component) => {
    const toolbar = {children: [{type: 'r-button', props: {label: 'Default action'}}]}
    const original = JSON.stringify(toolbar)
    const fixture = await mountContainer(component, {toolbar})
    try {
      expect(fixture.wrapper.get(`.renderer-${name}-layout`).classes()).toContain(`renderer-${name}-layout--top`)
      const node = fixture.wrapper.get('.renderer-toolbar')
      expect(node.text()).toContain('Default action')
      expect(node.attributes('style')).toContain('column-gap: 12px')
      expect(node.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 8px')
      expect(JSON.stringify(toolbar)).toBe(original)
    } finally {fixture.dispose()}
  })

  it.each(containers)('%s preserves a tail-only toolbar, layout and explicit DataView binding', async (name, component) => {
    const before = vi.fn((context: BeforeRenderContext) => ({label: `view:${context.dataSource?.viewId}/${context.row?.['id']}`}))
    const fixture = await mountContainer(component, {toolbar: {position: 'bottom', class: 'shared-toolbar',
      gap: 19, zoneGap: 27, align: 'end', justify: 'end', dataViewKey: 'SCENE@Items@other',
      tail: {class: 'shared-tail', children: [{type: 'r-button', props: {onBeforeRender: before}}]}}})
    try {
      const toolbar = fixture.wrapper.get('.renderer-toolbar')
      expect(toolbar.text()).toContain('view:other/C')
      expect(toolbar.classes()).toContain('shared-toolbar')
      expect(toolbar.attributes('style')).toContain('column-gap: 27px')
      expect(toolbar.get('.renderer-toolbar-lane--end').attributes('style')).toContain('gap: 19px')
      expect(toolbar.get('.renderer-toolbar-lane--end').classes()).toContain('shared-tail')
      expect(fixture.wrapper.get(`.renderer-${name}-layout`).classes()).toContain(`renderer-${name}-layout--bottom`)
      expect(before.mock.calls[0]?.[0].host?.type).toBe('r-toolbar')
      fixture.input.toolbar = {...fixture.input.toolbar, dataViewKey: 'SCENE@Items@default', dataMember: 'selectedRows'}
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/undefined')
      fixture.input.toolbar = {...fixture.input.toolbar, dataMember: 'currentRow'}
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/A')
      fixture.ds.getView('Items', 'default')!.setCurrentRowById('B')
      await flushPromises()
      expect(fixture.wrapper.get('.renderer-toolbar').text()).toContain('view:default/B')
    } finally {fixture.dispose()}
  })

  it.each(containers.slice(0, 3))('%s renders tail-only row actions with each row context', async (_name, component) => {
    const before = vi.fn((context: BeforeRenderContext) => ({label: `row:${context.row?.['id']}`}))
    const fixture = await mountContainer(component, {actions: {gap: 17, class: 'shared-actions',
      tail: {children: [{type: 'r-button', props: {onBeforeRender: before}}]}}})
    try {
      expect(fixture.wrapper.text()).toContain('row:A')
      expect(fixture.wrapper.text()).toContain('row:B')
      expect(fixture.wrapper.findAll('.renderer-toolbar.shared-actions').length).toBe(2)
      expect(fixture.wrapper.get('.renderer-toolbar-lane--end').attributes('style')).toContain('gap: 17px')
    } finally {fixture.dispose()}
  })
})

describe('RendererTree editing projection', () => {
  it('filters rows locally and renders permission-aware FieldText fallbacks from the formal row scope', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',resourceType:'static-data',resourceId:'nodes',columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'label',type:'string'},
        {name:'FunName',type:'string'},{name:'name',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'label'},rows:[
        {rowid:'A',prowid:null,label:'Alpha',FunName:'',name:'Alpha fallback'},
        {rowid:'B',prowid:null,label:'Beta',FunName:'Beta title',name:'Beta name'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    const runtime=new PageRuntime({pageId:'renderer-tree-filterable',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-filterable-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false,
        filterable:true,filterPlaceholder:'搜索节点',treeProps:{filterNodeMethod:(value:string,row:Record<string,unknown>)=>String(row['label']).includes(value)}},
        {default:()=>h(FieldText,{dataViewKey:'BLUEPRINT@Nodes@default',dataMember:'currentRow',dataField:'FunName',
          displayFallbackFields:['name'],readonly:true})})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    try{
      await flushPromises()
      expect(wrapper.find('.renderer-tree-filter input').exists()).toBe(true)
      expect(wrapper.text()).toContain('Alpha fallback')
      expect(wrapper.text()).toContain('Beta title')
      await wrapper.get('.renderer-tree-filter input').setValue('Beta')
      await flushPromises()
      const nodes=wrapper.findAll('.el-tree-node')
      expect(nodes.find(node=>node.text().includes('Alpha'))?.isVisible()).toBe(false)
      expect(nodes.find(node=>node.text().includes('Beta'))?.isVisible()).toBe(true)
      expect(view.hasEditingChanges()).toBe(false)
      expect(view.rows.map(row=>row['rowid'])).toEqual(['A','B'])

    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('restores native Element Plus highlight when a node-click handler cancels selection', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',resourceType:'static-data',resourceId:'nodes',columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'label',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'label'},rows:[
        {rowid:'A',prowid:null,label:'A'},{rowid:'B',prowid:null,label:'B'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    view.setCurrentRowById('A')
    const runtime=new PageRuntime({pageId:'renderer-tree-cancel-click',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const onNodeClick=vi.fn((_data:unknown,_node:unknown,_component:unknown,control:{cancel:boolean})=>{control.cancel=true})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-cancel-click-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',currentKey:'A',showDataViewMeta:false,onNodeClick})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    const tree=wrapper.getComponent(ElTree)
    const treeApi=tree.vm as unknown as {getNode(key:string):{isCurrent:boolean}|undefined}
    try{
      await flushPromises()
      expect(treeApi.getNode('A')?.isCurrent).toBe(true)
      await wrapper.findAll('.el-tree-node__content').find(node=>node.text()==='B')!.trigger('click')
      await flushPromises()
      expect(onNodeClick).toHaveBeenCalledOnce()
      expect(view.currentRow?.['rowid']).toBe('A')
      expect(treeApi.getNode('A')?.isCurrent).toBe(true)
      expect(treeApi.getNode('B')?.isCurrent).toBe(false)
    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('passes typed root-parent sets through the no-TreeManager projection fallback', () => {
    const projected=buildTreeTableRows({view:null,primaryKey:'rowid',treeConfig:{idField:'rowid',parentIdField:'prowid',
      rootParentValues:[null,'']},rows:[
      {rowid:'null-root',prowid:null,label:'Null root'},
      {rowid:'empty-root',prowid:'',label:'Empty root'},
      {rowid:'orphan',prowid:'missing',label:'Orphan'},
    ]})

    expect(projected.map(row=>row['rowid'])).toEqual(['null-root','empty-root'])
  })

  it('lets an async drop handler cancel the default DataView move with stable node keys', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',resourceType:'static-data',resourceId:'nodes',columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:[
        {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
        {rowid:'B',prowid:null,FunOrderValue:1,FunName:'B'},
        {rowid:'C',prowid:'A',FunOrderValue:0,FunName:'C'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    const runtime=new PageRuntime({pageId:'renderer-tree-cancellable-drop',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    let releaseHandler: (()=>void)|undefined
    const handlerGate=new Promise<void>(resolve=>{releaseHandler=resolve})
    const onNodeDrop=vi.fn(async (event: {draggedKey:string|number;targetKey:string|number;dropType:string},control: {cancel:boolean})=>{
      await handlerGate
      control.cancel=true
      return event
    })
    const TreeDropProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props','allowDrag','allowDrop','draggable'],setup(props,{emit,expose}){
      expose({async dropChildIntoB(){
        const rows=props['data'] as Array<Record<string,unknown>>
        const a=rows.find(row=>row['rowid']==='A')!,b=rows.find(row=>row['rowid']==='B')!
        const children=a['children'] as Array<Record<string,unknown>>
        const child=children.find(row=>row['rowid']==='C')!
        emit('node-drop',{data:child},{data:b},'inner')
      }})
      return()=>h('div',{'data-testid':'tree-cancellable-drop-probe'})
    }})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-cancellable-drop-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false,
        treeProps:{draggable:true,allowDrag:()=>true,allowDrop:()=>true},
        ...({onNodeDrop} as unknown as Record<string,unknown>)})}})
    const move=vi.spyOn(view,'moveTreeNode').mockResolvedValue(null)
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeDropProbe}}})
    const tree=wrapper.getComponent(TreeDropProbe)
    try{
      await flushPromises()
      await (tree.vm as unknown as {dropChildIntoB():Promise<void>}).dropChildIntoB()
      await flushPromises()
      expect(onNodeDrop).toHaveBeenCalledOnce()
      expect(onNodeDrop.mock.calls[0]?.[0]).toEqual({draggedKey:'C',targetKey:'B',dropType:'inner'})
      const allowDrag=tree.props('allowDrag')
      expect(allowDrag).toBeTypeOf('function')
      expect((allowDrag as (node:unknown)=>boolean)({})).toBe(false)
      const allowDrop=tree.props('allowDrop')
      expect(allowDrop).toBeTypeOf('function')
      expect((allowDrop as (dragged:unknown,target:unknown,type:unknown)=>boolean)({}, {}, 'inner')).toBe(false)
      expect(move).not.toHaveBeenCalled()
      releaseHandler?.()
      await flushPromises()
      expect((tree.props('allowDrag') as (node:unknown)=>boolean)({})).toBe(true)
      expect((tree.props('allowDrop') as (dragged:unknown,target:unknown,type:unknown)=>boolean)({}, {}, 'inner')).toBe(true)
      expect(move).not.toHaveBeenCalled()
    }finally{releaseHandler?.();wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('does not run a pending drop after the bound DataView changes away and back', async () => {
    const rows=[
      {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
      {rowid:'B',prowid:null,FunOrderValue:1,FunName:'B'},
      {rowid:'C',prowid:'A',FunOrderValue:0,FunName:'C'},
    ]
    const treeConfig={idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat' as const}
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',modelBinding:{modelId:'BLUEPRINT-MODEL',modelName:'Nodes'},columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig,rows},other:{treeConfig,rows:rows.map(row=>({...row}))}},
    }}})
    const defaultView=ds.getView('Nodes','default')!
    const runtime=new PageRuntime({pageId:'renderer-tree-stale-drop',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const targetKey=ref('BLUEPRINT@Nodes@default')
    let releaseHandler: (()=>void)|undefined
    const handlerGate=new Promise<void>(resolve=>{releaseHandler=resolve})
    const onNodeDrop=vi.fn(async()=>{await handlerGate})
    const TreeDropProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],setup(props,{emit,expose}){
      expose({dropChildIntoB(){
        const nodes=props['data'] as Array<Record<string,unknown>>
        const a=nodes.find(row=>row['rowid']==='A')!,b=nodes.find(row=>row['rowid']==='B')!
        const child=(a['children'] as Array<Record<string,unknown>>).find(row=>row['rowid']==='C')!
        emit('node-drop',{data:child},{data:b},'inner')
      }})
      return()=>h('div')
    }})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-stale-drop-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:targetKey.value,nodeKey:'rowid',showDataViewMeta:false,
        ...({onNodeDrop} as unknown as Record<string,unknown>)})}})
    const move=vi.spyOn(defaultView,'moveTreeNode').mockResolvedValue(null)
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeDropProbe}}})
    try{
      await flushPromises()
      const emitDrop=(wrapper.getComponent(TreeDropProbe).vm as unknown as {dropChildIntoB():void}).dropChildIntoB
      emitDrop()
      await flushPromises()
      expect(onNodeDrop).toHaveBeenCalledOnce()
      targetKey.value='BLUEPRINT@Nodes@other'
      await flushPromises()
      targetKey.value='BLUEPRINT@Nodes@default'
      await flushPromises()
      releaseHandler?.()
      await flushPromises()
      expect(move).not.toHaveBeenCalled()
      expect(defaultView.rows.find(row=>row['rowid']==='C')?.['prowid']).toBe('A')
    }finally{releaseHandler?.();wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('does not run a pending drop after RendererTree unmounts while its DataView remains alive', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',modelBinding:{modelId:'BLUEPRINT-MODEL',modelName:'Nodes'},columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:[
        {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
        {rowid:'B',prowid:null,FunOrderValue:1,FunName:'B'},
        {rowid:'C',prowid:'A',FunOrderValue:0,FunName:'C'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    const runtime=new PageRuntime({pageId:'renderer-tree-unmounted-drop',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    let releaseHandler: (()=>void)|undefined
    const handlerGate=new Promise<void>(resolve=>{releaseHandler=resolve})
    const onNodeDrop=vi.fn(async()=>{await handlerGate})
    const TreeDropProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],setup(props,{emit,expose}){
      expose({dropChildIntoB(){
        const nodes=props['data'] as Array<Record<string,unknown>>
        const a=nodes.find(row=>row['rowid']==='A')!,b=nodes.find(row=>row['rowid']==='B')!
        const child=(a['children'] as Array<Record<string,unknown>>).find(row=>row['rowid']==='C')!
        emit('node-drop',{data:child},{data:b},'inner')
      }})
      return()=>h('div')
    }})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-unmounted-drop-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false,
        ...({onNodeDrop} as unknown as Record<string,unknown>)})}})
    const move=vi.spyOn(view,'moveTreeNode').mockResolvedValue(null)
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeDropProbe}}})
    try{
      await flushPromises()
      const emitDrop=(wrapper.getComponent(TreeDropProbe).vm as unknown as {dropChildIntoB():void}).dropChildIntoB
      emitDrop()
      await flushPromises()
      expect(onNodeDrop).toHaveBeenCalledOnce()
      wrapper.unmount()
      releaseHandler?.()
      await flushPromises()
      expect(view.destroyed).toBe(false)
      expect(move).not.toHaveBeenCalled()
    }finally{releaseHandler?.();runtime.dispose();ds.destroy()}
  })

  it('does not apply a pending default drop after the same DataView replaces rows with the same keys', async () => {
    const createRows=(suffix:string)=>[
      {rowid:'A',prowid:null,FunOrderValue:0,FunName:`A${suffix}`},
      {rowid:'B',prowid:null,FunOrderValue:1,FunName:`B${suffix}`},
      {rowid:'C',prowid:'A',FunOrderValue:0,FunName:`C${suffix}`},
    ]
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',modelBinding:{modelId:'BLUEPRINT-MODEL',modelName:'Nodes'},columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:createRows(' before')}},
    }}})
    const view=ds.getView('Nodes','default')!
    const originalDragged=view.rows.find(row=>row['rowid']==='C')!
    const runtime=new PageRuntime({pageId:'renderer-tree-replaced-rows-drop',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    let releaseHandler: (()=>void)|undefined
    const handlerGate=new Promise<void>(resolve=>{releaseHandler=resolve})
    const onNodeDrop=vi.fn(async()=>{await handlerGate})
    const TreeDropProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],setup(props,{emit,expose}){
      expose({dropChildIntoB(){
        const nodes=props['data'] as Array<Record<string,unknown>>
        const a=nodes.find(row=>row['rowid']==='A')!,b=nodes.find(row=>row['rowid']==='B')!
        const child=(a['children'] as Array<Record<string,unknown>>).find(row=>row['rowid']==='C')!
        emit('node-drop',{data:child},{data:b},'inner')
      }})
      return()=>h('div')
    }})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-replaced-rows-drop-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false,
        ...({onNodeDrop} as unknown as Record<string,unknown>)})}})
    const move=vi.spyOn(view,'moveTreeNode').mockResolvedValue(null)
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeDropProbe}}})
    try{
      await flushPromises()
      const emitDrop=(wrapper.getComponent(TreeDropProbe).vm as unknown as {dropChildIntoB():void}).dropChildIntoB
      emitDrop()
      await flushPromises()
      expect(onNodeDrop).toHaveBeenCalledOnce()
      view.replaceRows(createRows(' after'))
      expect(view.rows.find(row=>row['rowid']==='C')).not.toBe(originalDragged)
      releaseHandler?.()
      await flushPromises()
      expect(move).not.toHaveBeenCalled()
      expect(view.rows.find(row=>row['rowid']==='C')?.['FunName']).toBe('C after')
    }finally{releaseHandler?.();wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('shows same-DataView parent and order edits without mutating rows, then restores on discard', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',modelBinding:{modelId:'BLUEPRINT-MODEL',modelName:'Nodes'},columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:[
        {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
        {rowid:'B',prowid:null,FunOrderValue:1,FunName:'B'},
        {rowid:'C',prowid:'A',FunOrderValue:0,FunName:'C'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    expect(view.rows.map(row=>row['rowid'])).toEqual(['A','B','C'])
    const runtime=new PageRuntime({pageId:'renderer-tree-editing-projection',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const TreeProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],template:'<div data-testid="tree-probe" />'})
    const registry=Spark.createRegistry()
    registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-editing-projection-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false,showPagination:false})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeProbe}}})
    const parentOf=(rows:readonly Record<string,unknown>[],key:string,parent?:string):string|undefined=>{
      for(const row of rows){if(row['rowid']===key)return parent;const nested=row['children'];if(Array.isArray(nested)){const found=parentOf(nested as Record<string,unknown>[],key,String(row['rowid']));if(found!==undefined)return found}}
      return undefined
    }
    const treeRows=()=>wrapper.getComponent(TreeProbe).props('data') as Record<string,unknown>[]
    try{
      await flushPromises()
      expect(parentOf(treeRows(),'C'),JSON.stringify(treeRows())).toBe('A')
      view.updateEditingValue('C','prowid','B')
      view.updateEditingValue('C','FunOrderValue',0)
      await flushPromises()
      expect(view.rows.find(row=>row['rowid']==='C')?.['prowid']).toBe('A')
      expect.soft(parentOf(treeRows(),'C')).toBe('B')
      view.discardEditingRows()
      await flushPromises()
      expect(view.hasEditingChanges()).toBe(false)
      expect(parentOf(treeRows(),'C')).toBe('A')
    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('orders edited siblings from the DataView SortExpression using declared numeric field types', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',resourceType:'static-data',resourceId:'nodes',columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{sortExpression:[{field:'FunOrderValue',direction:'asc'},{field:'rowid',direction:'asc'}],
        treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:[
          {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
          {rowid:'D',prowid:'A',FunOrderValue:'2',FunName:'D'},
          {rowid:'C',prowid:'A',FunOrderValue:'10',FunName:'C'},
        ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    expect(view.sortExpression).toEqual([{field:'FunOrderValue',direction:'asc'},{field:'rowid',direction:'asc'}])
    const queryRows=view.rows.map(row=>({...row}))
    const initialResult={
      rows:queryRows,total:queryRows.length,assertIdentity:()=>undefined,rowKey:(row:Record<string,unknown>)=>row['rowid'],
      fieldAccess:(key:unknown,field:string)=>({read:queryRows.some(row=>row['rowid']===key&&Object.hasOwn(row,field))?'visible' as const:'invisible' as const,
        write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),
      readFieldAccess:(row:Record<string,unknown>,field:string)=>Object.hasOwn(row,field)?'visible' as const:'invisible' as const,
      addActionState:()=>'enabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'enabled' as const,
      createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const,
    }
    view.bindQueryExecutor({executeQuery:async()=>initialResult},{resource:{resourceType:'static-data',resourceId:'nodes'},initialResult})
    const runtime=new PageRuntime({pageId:'renderer-tree-sorted-editing-projection',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const TreeProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],template:'<div data-testid="tree-sort-probe" />'})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){useSparkComponent({type:'renderer-tree-sorted-editing-projection-host'}).sparkProvide(PAGE_RUNTIME,runtime)
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{'el-tree':TreeProbe}}})
    const childKeys=()=>((wrapper.getComponent(TreeProbe).props('data') as Array<Record<string,unknown>>)
      .find(row=>row['rowid']==='A')?.['children'] as Array<Record<string,unknown>>).map(row=>row['rowid'])
    try{
      await flushPromises()
      expect(childKeys()).toEqual(['D','C'])
      expect(view.columns.find(column=>column.name==='FunOrderValue')?.type).toBe('number')
      expect(view.fieldAccess(view.rows.find(row=>row['rowid']==='D')!,'FunOrderValue').read).toBe('visible')
      const original=view.rows.map(row=>({rowid:row['rowid'],order:row['FunOrderValue']}))
      view.updateEditingValue('C','FunOrderValue','1')
      await flushPromises()
      expect(view.rows.map(row=>({rowid:row['rowid'],order:row['FunOrderValue']}))).toEqual(original)
      expect(view.getEditingRow('C')?.['FunOrderValue']).toBe('1')
      expect(childKeys()).toEqual(['C','D'])
      view.discardEditingRows()
      await flushPromises()
      expect(childKeys()).toEqual(['D','C'])
    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('updates mounted Element Plus tree nodes after edit, discard, and a rejected native drop', async () => {
    const rows=[
      {rowid:'A',prowid:null,rank:0,label:'A'},
      {rowid:'B',prowid:null,rank:1,label:'B'},
      {rowid:'D',prowid:'A',rank:'2',label:'D'},
      {rowid:'C',prowid:'A',rank:'10',label:'C'},
    ]
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',resourceType:'static-data',resourceId:'nodes',columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'rank',type:'number'},{name:'label',type:'string'}],
      views:{default:{sortExpression:[{field:'rank',direction:'asc'}],
        treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'label',treeMode:'flat'},rows}},
    }}})
    const view=ds.getView('Nodes','default')!
    const queryRows=view.rows.map(row=>({...row}))
    const initialResult={
      rows:queryRows,total:queryRows.length,assertIdentity:()=>undefined,rowKey:(row:Record<string,unknown>)=>row['rowid'],
      fieldAccess:(key:unknown,field:string)=>({read:queryRows.some(row=>row['rowid']===key&&Object.hasOwn(row,field))?'visible' as const:'invisible' as const,
        write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),
      readFieldAccess:(row:Record<string,unknown>,field:string)=>Object.hasOwn(row,field)?'visible' as const:'invisible' as const,
      addActionState:()=>'enabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'enabled' as const,
      createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const,
    }
    view.bindQueryExecutor({executeQuery:async()=>initialResult},{resource:{resourceType:'static-data',resourceId:'nodes'},initialResult})
    const runtime=new PageRuntime({pageId:'renderer-tree-mounted-projection',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const loggerError=vi.fn()
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){const context=useSparkComponent({type:'renderer-tree-mounted-projection-host'})
      context.sparkProvide(PAGE_RUNTIME,runtime)
      context.sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:loggerError}})
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',nodeKey:'rowid',showDataViewMeta:false})}})
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
    const tree=wrapper.getComponent(ElTree)
    const treeApi=tree.vm as unknown as {getNode(key:string):{data:Record<string,unknown>;parent?:{data?:Record<string,unknown>};childNodes:Array<{data:Record<string,unknown>}>}|undefined}
    const children=()=>treeApi.getNode('A')?.childNodes.map(node=>node.data['rowid'])
    const parentOf=(key:string)=>treeApi.getNode(key)?.parent?.data?.['rowid']
    const move=vi.spyOn(view,'moveTreeNode').mockRejectedValue(new Error('move rejected by DataView permission'))
    try{
      await flushPromises()
      expect(children()).toEqual(['D','C'])
      view.updateEditingValue('C','rank','1')
      await flushPromises()
      expect(children()).toEqual(['C','D'])
      view.discardEditingRows()
      await flushPromises()
      expect(children()).toEqual(['D','C'])

      const display=tree.props('data') as Array<Record<string,unknown>>
      const rootA=display.find(row=>row['rowid']==='A')!
      const rootB=display.find(row=>row['rowid']==='B')!
      const dragged=(rootA['children'] as Array<Record<string,unknown>>).splice(0,1)[0]!
      ;(rootB['children'] as Array<Record<string,unknown>>).push(dragged)
      tree.vm.$emit(
        'node-drop',
        treeApi.getNode('D'),
        treeApi.getNode('B'),
        'inner',
        new Event('drop'),
      )
      await flushPromises()

      expect(move).toHaveBeenCalledExactlyOnceWith('D','B',-1)
      expect(parentOf('D')).toBe('A')
      expect(children()).toEqual(['D','C'])
      expect(loggerError).toHaveBeenCalledOnce()
    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })

  it('restores the DataView tree projection after a default move is rejected', async () => {
    const ds=SparkData.createDataSet({scenarioId:'BLUEPRINT',dataSetName:'Blueprint',tables:{Nodes:{
      tableName:'Nodes',modelBinding:{modelId:'BLUEPRINT-MODEL',modelName:'Nodes'},columns:[
        {name:'rowid',type:'string',isPrimaryKey:true},{name:'prowid',type:'string'},{name:'FunOrderValue',type:'number'},{name:'FunName',type:'string'}],
      views:{default:{treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',treeMode:'flat'},rows:[
        {rowid:'A',prowid:null,FunOrderValue:0,FunName:'A'},
        {rowid:'B',prowid:null,FunOrderValue:1,FunName:'B'},
        {rowid:'C',prowid:'A',FunOrderValue:0,FunName:'C'},
      ]}},
    }}})
    const view=ds.getView('Nodes','default')!
    const runtime=new PageRuntime({pageId:'renderer-tree-rejected-drop',scenarioIds:['BLUEPRINT'],loadScenario:async()=>ds})
    await runtime.load()
    const errors:unknown[]=[]
    const loggerError=vi.fn()
    const parentOf=(rows:readonly Record<string,unknown>[],key:string,parent?:string):string|undefined=>{
      for(const row of rows){if(row['rowid']===key)return parent;const nested=row['children'];if(Array.isArray(nested)){const found=parentOf(nested as Record<string,unknown>[],key,String(row['rowid']));if(found!==undefined)return found}}
      return undefined
    }
    const TreeDropProbe=defineComponent({name:'ElTree',props:['data','nodeKey','props'],setup(props,{emit,expose}){
      expose({dropRejectedChildIntoB(){
        const rows=props['data'] as Array<Record<string,unknown>>
        const a=rows.find(row=>row['rowid']==='A')!,b=rows.find(row=>row['rowid']==='B')!
        const children=a['children'] as Array<Record<string,unknown>>
        const child=children.splice(children.findIndex(row=>row['rowid']==='C'),1)[0]!
        ;(b['children'] as Array<Record<string,unknown>>).push(child)
        emit('node-drop',{data:child},{data:b},'inner')
      }})
      return()=>h('div',{'data-testid':'tree-drop-probe'})
    }})
    const registry=Spark.createRegistry();registry.register({type:'r-tree',component:RendererTree})
    const Host=defineComponent({setup(){const context=useSparkComponent({type:'renderer-tree-rejected-drop-host'})
      context.sparkProvide(PAGE_RUNTIME,runtime)
      context.sparkProvide(PAGE_RUNTIME_SERVICES,{logger:{debug:vi.fn(),info:vi.fn(),warn:vi.fn(),error:loggerError}})
      return()=>h(RendererTree,{dataViewKey:'BLUEPRINT@Nodes@default',dataMember:'rows',nodeKey:'rowid',showDataViewMeta:false})}})
    const move=vi.spyOn(view,'moveTreeNode').mockRejectedValue(new Error('move rejected by DataView permission'))
    const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],config:{errorHandler:error=>errors.push(error)},stubs:{'el-tree':TreeDropProbe}}})
    const tree=wrapper.getComponent(TreeDropProbe)
    try{
      await flushPromises()
      const before=tree.props('data') as Record<string,unknown>[]
      expect(parentOf(before,'C')).toBe('A')
      const emitRejectedDrop=(tree.vm as unknown as {dropRejectedChildIntoB():void}).dropRejectedChildIntoB
      emitRejectedDrop()
      await flushPromises()
      expect(move).toHaveBeenCalledExactlyOnceWith('C','B',-1)
      expect(view.rows.find(row=>row['rowid']==='C')?.['prowid']).toBe('A')
      expect(view.hasEditingChanges()).toBe(false)
      expect(loggerError).toHaveBeenCalledWith('RendererTree node-drop failed; the current DataView projection was restored',expect.any(Error))
      expect(errors).toEqual([])
      expect(parentOf(tree.props('data') as Record<string,unknown>[],'C')).toBe('A')
    }finally{wrapper.unmount();runtime.dispose();ds.destroy()}
  })
})

const SparkActionStub = defineComponent(
  (props: { config: SparkNode }) => {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': props.config.type,
    }, props.config.type)
  },
  {
    props: {
      config: {
        type: Object,
        required: true,
      },
    },
  },
)

describe('RendererToolbar integration', () => {
  it('uses defaults for unassigned properties and preserves explicit zero spacing', async () => {
    const wrapper = mount(RendererToolbar, {props: {children: [{type: 'main'}]},
      global: {stubs: {SparkComponentRenderer: SparkActionStub}}})
    try {
      expect(wrapper.get('.renderer-toolbar').attributes('style')).toContain('column-gap: 12px')
      expect(wrapper.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 8px')
      await wrapper.setProps({gap: 0, zoneGap: 0})
      expect(wrapper.get('.renderer-toolbar').attributes('style')).toContain('column-gap: 0px')
      expect(wrapper.get('.renderer-toolbar-lane--start').attributes('style')).toContain('gap: 0px')
    } finally {wrapper.unmount()}
  })

  it('should render default and tail children in separate horizontal lanes', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        gap: 10,
        zoneGap: 24,
        children: [
          { type: 'action-a' },
          { type: 'action-b' },
        ],
        tail: { type: 'r-tail', children: [{ type: 'action-tail' }] },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('display: grid;')
    expect(wrapper.find('.renderer-toolbar').attributes('style')).toContain('column-gap: 24px;')

    const startLane = wrapper.find('.renderer-toolbar-lane--start')
    const endLane = wrapper.find('.renderer-toolbar-lane--end')
    expect(startLane.exists()).toBe(true)
    expect(endLane.exists()).toBe(true)
    expect(startLane.attributes('style')).toContain('grid-auto-flow: column;')
    expect(startLane.attributes('style')).toContain('gap: 10px;')
    expect(endLane.attributes('style')).toContain('justify-content: end;')

    const startItems = startLane.findAll('.spark-action-stub')
    const endItems = endLane.findAll('.spark-action-stub')
    expect(startItems).toHaveLength(2)
    expect(endItems).toHaveLength(1)
    expect(startItems[0]?.attributes('data-type')).toBe('action-a')
    expect(startItems[1]?.attributes('data-type')).toBe('action-b')
    expect(endItems[0]?.attributes('data-type')).toBe('action-tail')
  })

  it('should apply classes from r-tail child props', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: { class: 'toolbar-tail-custom', children: [{ type: 'tail-action' }] },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-custom')
  })

  it('should render structured tail prop without requiring wrapper child input', () => {
    const wrapper = mount(RendererToolbar, {
      props: {
        children: [
          { type: 'main-action' },
        ],
        tail: {
          class: 'toolbar-tail-prop-custom',
          children: [{ type: 'tail-action-from-prop' }],
        },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.renderer-toolbar-lane--end').classes()).toContain('toolbar-tail-prop-custom')
    expect(wrapper.find('.spark-action-stub[data-type="tail-action-from-prop"]').exists()).toBe(true)
  })
})
