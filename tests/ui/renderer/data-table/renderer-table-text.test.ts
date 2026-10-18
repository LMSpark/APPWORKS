import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, shallowRef} from 'vue'
import ElementPlus, {ElInput} from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldText, RendererTable, Spark, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

const originalStubs = config.global.stubs, cleanups: Array<() => void> = []
afterEach(() => {cleanups.splice(0).reverse().forEach(fn => fn()); config.global.stubs = originalStubs; vi.unstubAllGlobals()})
async function fixture(onChange?: () => Promise<void>, displayFormatter?: (value: unknown) => string) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = DataSet.fromJson({scenarioId:'S', dataSetName:'S', tables:{Items:{modelBinding:{modelId:'M',modelName:'Items'},
    columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}], views:{default:{commitMode:'staged'},other:{commitMode:'staged'}}}}})
  const source = new DataSpaceQueryTable({scenarioId:'S',metaName:'Items'})
  for (const id of ['default','other']) {
    const view = ds.getView('Items',id)!
    view.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({identity:source.identity,scope:'q',readScope:()=> 'q',
      snapshot:source.applyResult({Result:{primaryKeyField:'id',data:{Items:[
        {id:'a',name:'first',lingma_sys_params:{r:[],e:['name'],h:[],m:[],d:false}},
        {id:'b',name:'second',lingma_sys_params:{r:[],e:['name'],h:[],m:[],d:false}},
        {id:'denied',name:'readonly',lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
        {id:'hidden',name:'hidden value',lingma_sys_params:{r:[],e:[],h:['name'],m:[],d:false}},
        {id:'masked',name:'masked value',lingma_sys_params:{r:[],e:[],h:[],m:['name'],d:false}},
      ],Count:5}}})})})
    await view.refresh(); view.setCurrentRowById('a')
  }
  const runtime=new PageRuntime({pageId:'text-test',scenarioIds:['S'],loadScenario:async()=>ds})
  await runtime.load();cleanups.push(()=>runtime.dispose())
  const registry=Spark.createRegistry();registry.register({type:'r-text',component:FieldText})
  const binding=shallowRef('S@Items@default'),readonly=shallowRef(false),direct=shallowRef(true),locked=shallowRef(''),overflow=shallowRef<boolean | undefined>(undefined)
  const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'text-test'});sparkProvide(PAGE_RUNTIME,runtime)
    return()=>h(RendererTable,{dataViewKey:binding.value,autoColumns:false,showPagination:false,showDataViewMeta:false,
      children:[{type:'r-text',props:{field:'name',label:'名称',showCellControl:direct.value,maxlength:100,readonly:readonly.value,
        minWidth:180,showOverflowTooltip:overflow.value,cellReadonly:(row:Readonly<Record<string,unknown>>)=>row['id']===locked.value,onChange,displayFormatter}}]})}})
  const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}})
  cleanups.push(()=>wrapper.unmount());await flushPromises()
  return {wrapper,view:ds.getView('Items')!,other:ds.getView('Items','other')!,binding,readonly,direct,locked,overflow}
}
describe('standard text table controls',()=>{
  it('shows overflow tooltips from permitted display text and reacts to the standard field option',async()=>{
    const {wrapper,view,direct,overflow}=await fixture(undefined,value=>`Label: ${String(value)}`)
    direct.value=false;await flushPromises()
    expect(wrapper.find('tbody .cell.el-tooltip').exists()).toBe(false)
    const createRange=document.createRange.bind(document)
    const rangeSpy=vi.spyOn(document,'createRange').mockImplementation(()=>{
      const range=createRange();range.getBoundingClientRect=()=>new DOMRect(0,0,500,20);return range
    })
    cleanups.push(()=>rangeSpy.mockRestore())
    overflow.value=true;await flushPromises()
    const cells=wrapper.findAll('tbody tr').map(row=>row.get('td:last-child'))
    expect(cells[0]!.find('.cell.el-tooltip').exists()).toBe(true)
    await cells[0]!.trigger('mouseenter');await flushPromises()
    await vi.waitFor(()=>expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Label: first'))
    await cells[0]!.trigger('mouseleave');await flushPromises()
    await cells[3]!.trigger('mouseenter');await flushPromises()
    expect(document.body.textContent).not.toContain('hidden value')
    await cells[4]!.trigger('mouseenter');await flushPromises()
    await vi.waitFor(()=>expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(cells[4]!.text()))
    expect(document.body.textContent).not.toContain('masked value')
    await cells[4]!.trigger('mouseleave');await flushPromises()
    overflow.value=false;await flushPromises()
    expect(wrapper.find('tbody .cell.el-tooltip').exists()).toBe(false)
    expect(view.hasEditingChanges()).toBe(false)
  })
  it('formats only readable display values without changing data or exposing hidden and masked fields',async()=>{
    const formatter=vi.fn((value:unknown)=>`Label: ${String(value)}`)
    const {wrapper,view,direct}=await fixture(undefined,formatter)
    direct.value=false;await flushPromises();formatter.mockClear()
    await view.refresh();await flushPromises()
    expect(wrapper.text()).toContain('Label: first')
    expect(wrapper.text()).not.toContain('masked value')
    expect(wrapper.text()).not.toContain('hidden value')
    expect(formatter.mock.calls.flat()).not.toContain('masked value')
    expect(formatter.mock.calls.flat()).not.toContain('hidden value')
    expect(view.rows[0]?.['name']).toBe('first')
    expect(view.hasEditingChanges()).toBe(false)
  })
  it('edits the cell row through its DataView without replacing stored data or the pointer',async()=>{
    const {wrapper,view}=await fixture(),inputs=wrapper.findAllComponents(ElInput)
    expect(inputs.map(input=>input.props('modelValue'))).toEqual(['first','second','readonly'])
    expect(inputs[1]!.props('maxlength')).toBe(100)
    await inputs[1]!.get('input').setValue('changed');await flushPromises()
    expect(view.getEditingPatch('b')).toEqual({name:'changed'});expect(view.currentRow?.['id']).toBe('a')
    expect(view.rows[1]?.['name']).toBe('second')
    view.discardEditingRows();await flushPromises();expect(inputs[1]!.props('modelValue')).toBe('second')
  })
  it('keeps hidden/masked data out of inputs, respects readonly and retains default text rendering',async()=>{
    const {wrapper,view,locked,readonly,direct}=await fixture(),rows=wrapper.findAll('tbody tr')
    expect(rows[2]!.getComponent(ElInput).props('disabled')).toBe(true)
    expect(rows[3]!.findComponent(ElInput).exists()).toBe(false);expect(rows[4]!.findComponent(ElInput).exists()).toBe(false)
    expect(rows[4]!.text()).not.toContain('masked value')
    locked.value='b';await flushPromises();rows[1]!.getComponent(ElInput).vm.$emit('update:modelValue','forbidden');await flushPromises()
    expect(view.hasEditingChanges()).toBe(false)
    readonly.value=true;await flushPromises();expect(rows[0]!.getComponent(ElInput).props('disabled')).toBe(true)
    direct.value=false;await flushPromises();expect(wrapper.findAllComponents(ElInput)).toHaveLength(0);expect(rows[0]!.text()).toContain('first')
  })
  it.each(['binding','readonly','reload'] as const)('rejects delayed cell writes after %s changes',async kind=>{
    let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve})
    const {wrapper,view,other,binding,readonly}=await fixture(()=>waiting)
    wrapper.findAllComponents(ElInput)[1]!.vm.$emit('update:modelValue','late');await flushPromises()
    if(kind==='binding')binding.value='S@Items@other'
    else if(kind==='readonly')readonly.value=true
    else await view.refresh()
    await flushPromises();release();await flushPromises();expect(view.hasEditingChanges()).toBe(false);expect(other.hasEditingChanges()).toBe(false)
  })
})
