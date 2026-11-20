import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus, {ElInputNumber} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldNumber, RendererTable, Spark, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const originalStubs = config.global.stubs, cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
async function fixture() {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = DataSet.fromJson({scenarioId:'S', dataSetName:'S', tables:{Items:{modelBinding:{modelId:'M',modelName:'Items'},
    columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'number'}], views:{default:{commitMode:'staged'},other:{commitMode:'staged'}}}}})
  const source = new DataSpaceQueryTable({scenarioId:'S',metaName:'Items'})
  for (const id of ['default','other']) {
    const view = ds.getView('Items',id)!
    view.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({identity:source.identity,scope:'q',readScope:()=> 'q',
      snapshot:source.applyResult({Result:{primaryKeyField:'id',data:{Items:[
        {id:'a',name:1,lingma_sys_params:{r:[],e:['name'],h:[],m:[],d:false}},
        {id:'b',name:2,lingma_sys_params:{r:[],e:['name'],h:[],m:[],d:false}},
        {id:'denied',name:3,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
        {id:'hidden',name:4,lingma_sys_params:{r:[],e:[],h:['name'],m:[],d:false}},
        {id:'masked',name:5,lingma_sys_params:{r:[],e:[],h:[],m:['name'],d:false}},
      ],Count:5}}})})})
    await view.refresh(); view.setCurrentRowById('a')
  }
  const runtime=new PageRuntime({pageId:'text-test',scenarioIds:['S'],loadScenario:async()=>ds})
  await runtime.load();cleanups.push(()=>runtime.dispose())
  const registry=Spark.createRegistry();registry.register({type:'r-number',component:FieldNumber})
  const binding=shallowRef('S@Items@default'),readonly=shallowRef(false),direct=shallowRef(true),locked=shallowRef(''),overflow=shallowRef<boolean | undefined>(undefined)
  const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'text-test'});sparkProvide(PAGE_RUNTIME,runtime)
    return()=>h(RendererTable,{dataViewKey:binding.value,autoColumns:false,showPagination:false,showDataViewMeta:false,
      children:[{type:'r-number',props:{field:'name',label:'名称',showCellControl:direct.value,readonly:readonly.value,
        minWidth:180,showOverflowTooltip:overflow.value,cellReadonly:(row:Readonly<Record<string,unknown>>)=>row['id']===locked.value}}]})}})
  const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
  cleanups.push(()=>wrapper.unmount());await flushPromises()
  return {wrapper,view:ds.getView('Items')!,other:ds.getView('Items','other')!,binding,readonly,direct,locked,overflow}
}
describe('standard numeric table controls',()=>{
  it('edits the bound cell as a number without moving the current row or replacing source data',async()=>{
    const {wrapper,view}=await fixture(),inputs=wrapper.findAllComponents(ElInputNumber)
    expect(inputs.map(input=>input.props('modelValue'))).toEqual([1,2,3])
    inputs[1]!.vm.$emit('update:modelValue',7);await flushPromises()
    expect(view.getEditingPatch('b')).toEqual({name:7})
    expect(view.currentRow?.['id']).toBe('a');expect(view.rows[1]?.['name']).toBe(2)
    view.discardEditingRows();await flushPromises();expect(inputs[1]!.props('modelValue')).toBe(2)
  })
  it('keeps hidden and masked values out of controls and only narrows write permission',async()=>{
    const {wrapper,view,locked,readonly,direct}=await fixture(),rows=wrapper.findAll('tbody tr')
    expect(rows[2]!.getComponent(ElInputNumber).props('disabled')).toBe(true)
    expect(rows[3]!.findComponent(ElInputNumber).exists()).toBe(false)
    expect(rows[4]!.findComponent(ElInputNumber).exists()).toBe(false)
    locked.value='b';await flushPromises();rows[1]!.getComponent(ElInputNumber).vm.$emit('update:modelValue',9);await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    readonly.value=true;await flushPromises();expect(rows[0]!.getComponent(ElInputNumber).props('disabled')).toBe(true)
    direct.value=false;await flushPromises();expect(wrapper.findComponent(ElInputNumber).exists()).toBe(false)
  })
})
