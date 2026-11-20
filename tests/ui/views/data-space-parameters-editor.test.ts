import {config, mount, flushPromises, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {FieldJson, PAGE_RUNTIME, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import ElementPlus, {ElTable, ElTableColumn} from 'element-plus'
import DataSpaceParametersEditor from '../../../src/views/features/data-platform/data-set-management/design/parameters/DataSpaceParametersEditor.vue'

const cleanup: Array<() => void> = []
const originalStubs = config.global.stubs
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals(); config.global.stubs = originalStubs})
async function fixture(input: Array<Record<string, unknown>>, noCrypto = false) {
  registerAllRenderers()
  const stubs = {...config.global.stubs}
  for (const name of ['el-button','el-table','el-table-column','SparkComponentRenderer','spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const ds = SparkData.createDataSet({dataSetName:'parameters',scenarioId:'META',tables:{
    Space:{tableName:'Space',resourceType:'static-data',columns:[
      {name:'id',type:'string',isPrimaryKey:true},{name:'inputParams',type:'string'},
    ],views:{default:{commitMode:'staged',rows:[{id:'TARGET',inputParams:JSON.stringify(input)},{id:'OTHER',inputParams:'[]'}]}}},
  }})
  const runtime = new PageRuntime({pageId:'parameters',scenarioIds:['META'],loadScenario:async()=>ds})
  await runtime.load();cleanup.push(()=>runtime.dispose())
  const view=ds.getView('Space')!;view.setCurrentRowById('TARGET')
  if(noCrypto)vi.stubGlobal('crypto',undefined)
  const disabled=ref(false),pending=ref(false)
  const Host=defineComponent({setup(){useSparkComponent({type:'r-form'}).sparkProvide(PAGE_RUNTIME,runtime)
    return()=>h(DataSpaceParametersEditor,{dataViewKey:'META@Space@default',disabled:disabled.value,onEditingChange:(value:boolean)=>{pending.value=value}})
  }})
  const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin()]}})
  cleanup.push(()=>wrapper.unmount());await flushPromises()
  return{wrapper,ds,view,runtime,disabled,pending,items:()=>JSON.parse(String(view.getEditingRow('TARGET')?.['inputParams'])) as Array<Record<string,unknown>>}
}
const rows=(wrapper:VueWrapper)=>wrapper.findAll('.el-table__body tbody tr')
function input(wrapper:VueWrapper,field='Name'){return wrapper.get(field==='Name'?'.el-table__body td:nth-child(1) input':'.el-table__body td:nth-child(2) input')}

describe('input parameters through the standard JSON field',()=>{
  it('restores the reference toolbar and direct inputs without a per-row confirmation step',async()=>{
    const f=await fixture([{rowid:'P',Name:'客户号'}])
    expect(f.wrapper.find('[data-json-edit]').exists()).toBe(false)
    expect(f.wrapper.find('[data-json-save-row]').exists()).toBe(false)
    expect(f.wrapper.find('[data-json-cancel-row]').exists()).toBe(false)
    expect(input(f.wrapper).element).toHaveProperty('value','客户号')
    await input(f.wrapper).setValue('订单号');await flushPromises()
    expect(f.items()).toEqual([{rowid:'P',Name:'订单号'}])
    expect(f.view.rows[0]?.['inputParams']).toContain('客户号')
  })
  it('binds the original field with no parameter-copy table and writes directly to the original editing overlay',async()=>{
    const f=await fixture([{rowid:'P',Name:'客户号'}])
    expect(f.wrapper.getComponent(FieldJson).props()).toMatchObject({dataViewKey:'META@Space@default',dataMember:'currentRow',field:'inputParams',mode:'rows'})
    expect(Object.keys(f.ds.tables)).toEqual(['Space'])
    expect(f.wrapper.findAll('th').map(th=>th.text())).toEqual(['名称','描述','主业务参数'])
    const table=f.wrapper.getComponent(ElTable)
    expect(table.props()).toMatchObject({maxHeight:460,height:undefined})
    const columns=f.wrapper.findAllComponents(ElTableColumn)
    expect(columns.map(column=>column.props())).toEqual([
      expect.objectContaining({minWidth:220}),expect.objectContaining({minWidth:260}),expect.objectContaining({minWidth:'',width:120,align:'center'}),
    ])
    await input(f.wrapper).setValue('订单号');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(true)
    expect(f.items()).toEqual([{rowid:'P',Name:'订单号'}])
    expect(f.view.rows[0]?.['inputParams']).toContain('客户号');expect(f.pending.value).toBe(false)
  })
  it('reads legacy names and preserves ID aliases and unknown members when editing',async()=>{
    const f=await fixture([{name:'旧名',description:'旧描述',RowID:'PARAM-1',extra:{retained:true}}])
    expect(input(f.wrapper).element).toHaveProperty('value','旧名')
    expect(input(f.wrapper,'Description').element).toHaveProperty('value','旧描述')
    await input(f.wrapper).setValue(' 新名 ');await flushPromises()
    expect(f.items()).toEqual([{name:'旧名',description:'旧描述',RowID:'PARAM-1',extra:{retained:true},Name:' 新名 '}])
  })
  it('gives only the changed legacy item one stable identity and preserves it on later edits',async()=>{
    const other={Name:'未编辑',extra:0};const f=await fixture([{name:'旧名',extra:'保留'},other])
    await input(f.wrapper).setValue('新名');await flushPromises()
    const id=f.items()[0]?.['rowid'];expect(id).toMatch(/^[A-F0-9]{32}$/);expect(f.items()[1]).toEqual(other)
    await input(f.wrapper).setValue('再次修改');await flushPromises()
    expect(f.items()[0]?.['rowid']).toBe(id)
  })
  it('leaves original bytes and legacy IDs untouched on opening and unchanged input',async()=>{
    const f=await fixture([{Name:'旧参数'}]);const original=' [ { "Name": "旧参数" } ] '
    f.view.replaceRows([{id:'TARGET',inputParams:original}]);await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await input(f.wrapper).setValue('旧参数');await flushPromises()
    expect(f.view.getEditingRow('TARGET')?.['inputParams']).toBe(original);expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('changes only the boolean member and retains unknown types',async()=>{
    const f=await fixture([{rowid:'P',Name:'客户',IsBusParam:0,unknown:[false,null,0]}])
    await f.wrapper.get('.el-table__body input[type="checkbox"]').setValue(true);await flushPromises()
    expect(f.items()).toEqual([{rowid:'P',Name:'客户',IsBusParam:true,unknown:[false,null,0]}])
  })
  it('adds a parameter with a secure ID and domain defaults, then deletes the selected item',async()=>{
    const f=await fixture([])
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    await input(f.wrapper).setValue('new');await flushPromises()
    expect(f.items()).toEqual([{rowid:expect.stringMatching(/^[A-F0-9]{32}$/),Name:'new',Description:'',IsBusParam:false}])
    await rows(f.wrapper)[0]!.trigger('click');await f.wrapper.get('[data-json-delete]').trigger('click');await flushPromises()
    expect(f.items()).toEqual([])
  })
  it('restores the original array when the bound field is cancelled',async()=>{
    const f=await fixture([{Name:'old'}])
    await input(f.wrapper).setValue('discard');await flushPromises()
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    expect(f.items()).toHaveLength(2)
    f.view.discardEditingRows(['TARGET']);await flushPromises()
    expect(f.items()).toEqual([{Name:'old'}]);expect(f.pending.value).toBe(false)
    expect(rows(f.wrapper)).toHaveLength(1)
  })
  it('keeps no-ID records readable and prevents unsafe creation when secure IDs are unavailable',async()=>{
    const f=await fixture([{Name:'legacy'},{Id:'P',Name:'existing'}],true)
    expect(input(f.wrapper).element).toHaveProperty('value','legacy');expect(f.wrapper.get('[data-json-add]').attributes('disabled')).toBeDefined()
    expect(input(f.wrapper).attributes('disabled')).toBeDefined()
    await rows(f.wrapper)[1]!.get('td:first-child input').setValue('allowed');await flushPromises()
    expect(f.items()).toEqual([{Name:'legacy'},{Id:'P',Name:'allowed'}])
  })
  it('prevents edits after readonly or target changes and releases only its local editor',async()=>{
    const f=await fixture([{rowid:'P',Name:'original'}])
    f.disabled.value=true;await flushPromises();expect(input(f.wrapper).attributes('disabled')).toBeDefined()
    await input(f.wrapper).setValue('forbidden');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
    f.disabled.value=false;await flushPromises();await input(f.wrapper).setValue('accepted');await flushPromises()
    f.view.setCurrentRowById('OTHER');await flushPromises()
    expect(f.items()).toEqual([{rowid:'P',Name:'accepted'}]);expect(rows(f.wrapper)).toHaveLength(0)
    expect(f.view.getEditingRow('OTHER')?.['inputParams']).toBe('[]')
    f.wrapper.unmount();expect(f.view.destroyed).toBe(false);expect(Object.keys(f.ds.tables)).toEqual(['Space'])
  })
  it('keeps the focused input and selected row while a legacy identity is assigned and later input arrives',async()=>{
    const f=await fixture([{Name:'old'}])
    await rows(f.wrapper)[0]!.trigger('click');await flushPromises()
    const element=input(f.wrapper).element as HTMLInputElement;element.focus()
    await input(f.wrapper).setValue('new');await flushPromises()
    const id=f.items()[0]?.['rowid']
    await input(f.wrapper).setValue('newer');await flushPromises()
    expect(input(f.wrapper).element).toBe(element);expect(document.activeElement).toBe(element)
    expect(f.items()[0]?.['rowid']).toBe(id)
    expect(f.wrapper.get('[data-json-delete]').attributes('disabled')).toBeUndefined()
  })
  it('clears selection when the original field is externally reordered',async()=>{
    const f=await fixture([{rowid:'A',Name:'first'},{rowid:'B',Name:'second'}])
    await rows(f.wrapper)[0]!.trigger('click');await flushPromises();expect(f.wrapper.get('[data-json-delete]').attributes('disabled')).toBeUndefined()
    f.view.updateEditingValue('TARGET','inputParams',JSON.stringify(f.items().reverse()));await flushPromises()
    expect(f.wrapper.get('[data-json-delete]').attributes('disabled')).toBeDefined()
  })
})
