import {afterEach, describe, expect, it} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElTable} from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import JsonArrayRows from '../../../../packages/spark-component/src/components/fields/data-components/text/FieldJson/JsonArrayRows.vue'
import type {JsonArrayRowAdapter} from '../../../../packages/spark-component/src/components/fields/data-components/text/FieldJson/FieldJson.props'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
const originalStubs = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = originalStubs})
async function fixture(value = '[{"name":"first","count":2,"active":false,"extra":{"x":1}}]', onChange?: (value: string) => Promise<void>, reorderable = false, rowAdapter?: JsonArrayRowAdapter, rowEditMode: 'row' | 'inline' = 'row', onTextChange?: (value: unknown, previous: unknown, control: {cancel: boolean}) => void) {
  registerAllRenderers()
  const ds = SparkData.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {Models: {resourceType: 'static-data',
    columns: [{name:'id',type:'string',isPrimaryKey:true},{name:'items',type:'string'}],
    views:{default:{commitMode:'staged',rows:[{id:'a',items:value},{id:'b',items:'[]'}]}}}}})
  const runtime = new PageRuntime({pageId:'array-test',scenarioIds:['S'],loadScenario:async()=>ds}); await runtime.load(); runtimes.push(runtime)
  const view=ds.getView('Models')!; view.setCurrentRowById('a')
  const readonly=ref(false), pending=ref(false)
  const host=defineComponent({setup(){useSparkComponent({type:'array-test'}).sparkProvide(PAGE_RUNTIME,runtime)
    return()=>h(RendererForm,{autoColumns:false,showDataViewMeta:false,dataViewKey:'S@Models@default',children:[
      {type:'r-json',props:{field:'items',label:'数组',mode:'rows',reorderable,rowAdapter,rowEditMode,readonly:readonly.value,...onChange?{onChange}:{},onEditingChange:(v:boolean)=>{pending.value=v}},children:[
        {type:'r-text',props:{field:'name',label:'名称',onChange:onTextChange}},{type:'r-number',props:{field:'count',label:'数量'}},
        {type:'r-checkbox',props:{field:'active',label:'启用'}},
      ]},
    ]})}})
  const stubs={...config.global.stubs}; for(const key of ['SparkComponentRenderer','spark-component-renderer','el-button','el-table','el-table-column'])delete stubs[key]
  config.global.stubs=stubs
  const wrapper=mount(host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin()],stubs}})
  wrappers.push(wrapper);await flushPromises();return{wrapper,view,readonly,pending}
}
describe('standard JSON array rows',()=>{
  it('serializes rapid inline inputs across rows and fields without replacing the focused input',async()=>{
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve}), writes:string[]=[]
    const f=await fixture('[{"name":"first","active":false},{"name":"second","extra":0}]',async value=>{writes.push(value);if(writes.length===1)await wait},false,undefined,'inline')
    const inputs=f.wrapper.findAll('.el-table__body td:first-child input')
    const element=inputs[0]!.element as HTMLInputElement;element.focus()
    await inputs[0]!.setValue('intermediate');await flushPromises()
    await inputs[0]!.setValue('final');await inputs[1]!.setValue('second changed')
    await f.wrapper.get('.el-table__body input[type="checkbox"]').setValue(true);await flushPromises()
    expect(writes).toHaveLength(1);expect(f.pending.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.get('[data-json-add]').attributes('disabled')).toBeDefined()
    release();await flushPromises()
    expect(writes).toHaveLength(4)
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'final',active:true},{name:'second changed',extra:0}])
    expect(f.wrapper.get('.el-table__body td:first-child input').element).toBe(element);expect(document.activeElement).toBe(element)
    expect(f.pending.value).toBe(false)
  })
  it('rejects an inline field write without changing its projection and accepts a later retry',async()=>{
    let reject=true
    const f=await fixture('[{"name":"original","extra":false}]',async()=>{if(reject)throw Error('拒绝')},false,undefined,'inline')
    await f.wrapper.get('.el-table__body td:first-child input').setValue('rejected');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.pending.value).toBe(false)
    expect(f.wrapper.get('.el-table__body td:first-child input').element).toHaveProperty('value','original')
    expect(f.wrapper.text()).toContain('未接受本次修改')
    reject=false;await f.wrapper.get('.el-table__body td:first-child input').setValue('accepted');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'accepted',extra:false}])
  })
  it.each(['target','readonly','unmount','reload'] as const)('invalidates queued inline writes on %s',async kind=>{
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve})
    const original='[{"name":"original"}]',f=await fixture(original,()=>wait,false,undefined,'inline')
    const input=f.wrapper.get('.el-table__body td:first-child input')
    await input.setValue('pending');await input.setValue('queued');await flushPromises()
    expect(f.pending.value).toBe(true)
    if(kind==='target')f.view.setCurrentRowById('b')
    if(kind==='readonly')f.readonly.value=true
    if(kind==='unmount')f.wrapper.unmount()
    if(kind==='reload')f.view.replaceRows([{id:'a',items:original},{id:'b',items:'[]'}])
    await flushPromises();release();await flushPromises()
    expect(f.view.getEditingRow('a')?.['items']).toBe(original);expect(f.view.getEditingRow('b')?.['items']).toBe('[]')
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.pending.value).toBe(false)
  })
  it('preserves accepted inline values when unadapted rows are reordered or deleted',async()=>{
    const f=await fixture('[{"name":"first"},{"name":"second","extra":1}]',undefined,true,undefined,'inline')
    await f.wrapper.get('.el-table__body td:first-child input').setValue('changed');await flushPromises()
    await f.wrapper.findAll('.el-table__body tr')[0]!.trigger('click')
    await f.wrapper.get('[data-json-move-down]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'second',extra:1},{name:'changed'}])
    await f.wrapper.findAll('.el-table__body tr')[0]!.trigger('click')
    await f.wrapper.get('[data-json-delete]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'changed'}])
  })
  it('does not overwrite an external replacement while an inline write is awaiting its handler',async()=>{
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve})
    const f=await fixture('[{"name":"first"},{"name":"second"}]',()=>wait,false,undefined,'inline')
    await f.wrapper.get('.el-table__body td:first-child input').setValue('pending');await flushPromises()
    const replacement='[{"name":"second"},{"name":"external"}]'
    f.view.updateEditingValue('a','items',replacement);await flushPromises()
    release();await flushPromises()
    expect(f.view.getEditingRow('a')?.['items']).toBe(replacement);expect(f.pending.value).toBe(false)
    expect(f.wrapper.get('.el-table__body td:first-child input').element).toHaveProperty('value','second')
  })
  it('respects standard child cancellation in inline mode',async()=>{
    let cancelled=true
    const f=await fixture('[{"name":"original"}]',undefined,false,undefined,'inline',(_value,_previous,control)=>{control.cancel=cancelled})
    await f.wrapper.get('.el-table__body td:first-child input').setValue('cancelled');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.pending.value).toBe(false)
    cancelled=false;await f.wrapper.get('.el-table__body td:first-child input').setValue('allowed');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'allowed'}])
  })
  it('keeps new adapted rows editable in default row mode until confirmation assigns an identity',async()=>{
    const f=await fixture('[]',undefined,false,{read:row=>({...row}),write:(row,before)=>({...row,id:before?.['id']??'NEW'}),canEdit:row=>row===undefined||row['id']!==undefined})
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    const input=f.wrapper.get('.el-table__body td:first-child input');expect(input.attributes('disabled')).toBeUndefined()
    await input.setValue('created');await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'created',id:'NEW'}])
  })
  it('applies a pure row adapter only to the edited row and retains original objects on deletion and reorder',async()=>{
    const writes: unknown[]=[]
    const original=[{legacy:'first',extra:{x:1}},{legacy:'second',active:0}]
    const adapter:JsonArrayRowAdapter={read:row=>({name:row['legacy'],active:Boolean(row['active'])}),write:(row,before)=>{
      writes.push(before);return {...before,legacy:row['name']}
    }}
    const f=await fixture(JSON.stringify(original),undefined,true,adapter)
    await f.wrapper.findAll('.el-table__body tr')[1]!.trigger('click')
    await f.wrapper.get('[data-json-move-up]').trigger('click');await flushPromises()
    expect(writes).toEqual([]);expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([original[1],original[0]])
    await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('changed')
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(writes).toEqual([original[1]])
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{legacy:'changed',active:0},original[0]])
    await f.wrapper.findAll('.el-table__body tr')[0]!.trigger('click')
    await f.wrapper.get('[data-json-delete]').trigger('click');await flushPromises()
    expect(writes).toHaveLength(1);expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([original[0]])
  })
  it('retains a row draft when its adapter throws or returns non-JSON and writes no partial value',async()=>{
    let fail=true
    const f=await fixture('[{"name":"first"}]',undefined,false,{read:row=>({...row}),write:()=>{
      if(fail)throw Error('业务行校验失败');return {name:undefined}
    }})
    await f.wrapper.get('.el-table__body tr').trigger('click');await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('changed')
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(f.wrapper.text()).toContain('业务行校验失败');expect(f.pending.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    fail=false;await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(f.wrapper.text()).toContain('JSON行适配必须返回有效对象');expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-cancel-row]').trigger('click');await flushPromises();expect(f.pending.value).toBe(false)
  })
  it('keeps the accepted row selection when the field value arrives before its write acknowledgement',async()=>{
    registerAllRenderers()
    let release=()=>{}
    const acknowledgement=new Promise<void>(resolve=>{release=resolve})
    let acceptedTable: unknown, submitted: string | undefined
    const stubs={...config.global.stubs}
    for(const key of ['SparkComponentRenderer','spark-component-renderer','el-button','el-table','el-table-column'])delete stubs[key]
    config.global.stubs=stubs
    const wrapper: VueWrapper=mount(JsonArrayRows,{attachTo:document.body,props:{
      modelValue:'[{"name":"first"},{"name":"second"}]',readOnly:false,
      children:[{type:'r-text',props:{field:'name',label:'名称'}}],
      commit:async(value:string)=>{
        submitted=value
        await wrapper.setProps({modelValue:value});await flushPromises()
        acceptedTable=wrapper.getComponent(ElTable).element
        await acknowledgement
        return true
      },
    },global:{plugins:[ElementPlus,Spark.createPlugin()],stubs}})
    wrappers.push(wrapper);await flushPromises()
    await wrapper.findAll('.el-table__body tr')[0]!.trigger('click')
    await wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    await wrapper.get('.el-table__body input[type="text"]').setValue('accepted')
    await wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(JSON.parse(submitted!)).toEqual([{name:'accepted'},{name:'second'}])
    await wrapper.findAll('.el-table__body tr')[1]!.trigger('click')
    expect(wrapper.get('[data-json-edit]').attributes('disabled')).toBeDefined()
    release();await flushPromises()
    expect(wrapper.getComponent(ElTable).element === acceptedTable).toBe(true)
    expect(wrapper.get('[data-json-edit]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    expect((wrapper.get('.el-table__body input[type="text"]').element as HTMLInputElement).value).toBe('second')
    await wrapper.get('[data-json-cancel-row]').trigger('click');await flushPromises()
    expect(wrapper.getComponent(JsonArrayRows).props('modelValue')).toBe(submitted)
  })
  it('reorders selected objects through the original field, preserves members and keeps the moved row selected',async()=>{
    const items=[{name:'first',extra:{x:1}},{name:'second',active:false},{name:'third',count:0}]
    const f=await fixture(JSON.stringify(items),undefined,true)
    expect(f.wrapper.get('[data-json-move-up]').attributes('disabled')).toBeDefined()
    await f.wrapper.findAll('.el-table__body tr')[1]!.trigger('click')
    await f.wrapper.get('[data-json-move-up]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([items[1],items[0],items[2]])
    expect(JSON.parse(String(f.view.rows[0]?.['items']))).toEqual(items)
    expect(f.wrapper.get('[data-json-move-up]').attributes('disabled')).toBeDefined()
    await f.wrapper.get('[data-json-move-down]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual(items)
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    expect(f.wrapper.get('[data-json-move-down]').attributes('disabled')).toBeDefined()
    await f.wrapper.get('[data-json-cancel-row]').trigger('click');f.readonly.value=true;await flushPromises()
    expect(f.wrapper.get('[data-json-move-up]').attributes('disabled')).toBeDefined()
    expect(f.wrapper.get('[data-json-move-down]').attributes('disabled')).toBeDefined()
  })
  it('keeps reordering opt-in and rejects a pending reorder after the bound row changes',async()=>{
    const ordinary=await fixture()
    expect(ordinary.wrapper.find('[data-json-move-up]').exists()).toBe(false)
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve})
    const f=await fixture('[{"name":"first"},{"name":"second"}]',()=>wait,true)
    await f.wrapper.findAll('.el-table__body tr')[1]!.trigger('click')
    await f.wrapper.get('[data-json-move-up]').trigger('click');await flushPromises()
    expect(f.pending.value).toBe(true)
    expect(f.wrapper.get('[data-json-move-up]').attributes('disabled')).toBeDefined()
    f.view.setCurrentRowById('b');await flushPromises();release();await flushPromises()
    expect([f.view.getEditingRow('a')?.['items'],f.view.getEditingRow('b')?.['items']]).toEqual(['[{"name":"first"},{"name":"second"}]','[]'])
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.pending.value).toBe(false)
    expect(f.view.getEditingRow('b')?.['items']).toBe('[]')
  })
  it('retains the original array and selected row when the field rejects a reorder',async()=>{
    const original='[{"name":"first"},{"name":"second"}]'
    const f=await fixture(original,async()=>{throw new Error('拒绝本次修改')},true)
    await f.wrapper.findAll('.el-table__body tr')[1]!.trigger('click')
    await f.wrapper.get('[data-json-move-up]').trigger('click');await flushPromises()
    expect(f.view.getEditingRow('a')?.['items']).toBe(original)
    expect(f.pending.value).toBe(false)
    expect(f.wrapper.get('[data-json-move-down]').attributes('disabled')).toBeDefined()
    expect(f.wrapper.text()).toContain('未接受本次修改')
  })
  it('renders boolean child fields as readonly standard controls outside row editing',async()=>{
    const f=await fixture('[{"name":"first","active":true}]')
    const input=f.wrapper.get('.el-table__body input[type="checkbox"]')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
    await f.wrapper.get('.el-table__body tr').trigger('click');await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    expect(f.wrapper.get('.el-table__body input[type="checkbox"]').attributes('disabled')).toBeUndefined()
  })
  it('keeps the row pending until the original field change has completed',async()=>{
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve})
    const f=await fixture('[]',()=>wait)
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('new');await flushPromises()
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(f.pending.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    release();await flushPromises()
    expect(f.pending.value).toBe(false);expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'new'}])
  })
  it('uses child fields, saves the chosen row to its bound field and retains untouched JSON types',async()=>{
    const f=await fixture()
    expect(f.wrapper.text()).toContain('名称')
    await f.wrapper.get('.el-table__body tr').trigger('click');await flushPromises()
    await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    expect(f.pending.value).toBe(true)
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('changed'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'changed',count:2,active:false,extra:{x:1}}])
    expect(f.view.rows[0]?.['items']).toContain('first');expect(f.pending.value).toBe(false)
  })
  it('cancels an added row and refuses stale row edits after changing the bound row',async()=>{
    const f=await fixture()
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    expect(f.pending.value).toBe(true)
    await f.wrapper.get('[data-json-cancel-row]').trigger('click');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    f.view.setCurrentRowById('b');await flushPromises()
    expect(f.pending.value).toBe(false);expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('preserves malformed source text, and makes row mutations unavailable when readonly',async()=>{
    const f=await fixture('[broken')
    expect(f.wrapper.text()).toContain('JSON')
    expect(f.wrapper.get('[data-json-add]').attributes('disabled')).toBeDefined()
    expect(f.view.getEditingRow('a')?.['items']).toBe('[broken')
    f.view.updateEditingValue('a','items','[]');await flushPromises()
    f.readonly.value=true;await flushPromises()
    expect(f.wrapper.get('[data-json-add]').attributes('disabled')).toBeDefined()
  })
  it('adds and removes rows, keeping user _pk properties and undeclared values separate from internal identity',async()=>{
    const f=await fixture('[{"name":"first","_pk":{"business":true},"missing":null}]')
    await f.wrapper.get('[data-json-add]').trigger('click');await flushPromises()
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('new');await flushPromises()
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'first',_pk:{business:true},missing:null},{name:'new'}])
    await f.wrapper.findAll('.el-table__body tr')[1]!.trigger('click');await flushPromises()
    await f.wrapper.get('[data-json-delete]').trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['items']))).toEqual([{name:'first',_pk:{business:true},missing:null}])
  })
  it('does not rewrite original whitespace on unchanged row confirmation, or commit an edit after permission is lost',async()=>{
    const original=' [ { "name": "first", "count": 2 } ] '
    const f=await fixture(original)
    await f.wrapper.get('.el-table__body tr').trigger('click');await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    await f.wrapper.get('[data-json-save-row]').trigger('click');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.view.getEditingRow('a')?.['items']).toBe(original)
    await f.wrapper.get('[data-json-edit]').trigger('click');await flushPromises()
    await f.wrapper.get('.el-table__body input[type="text"]').setValue('discarded');await flushPromises()
    f.readonly.value=true;await flushPromises()
    expect(f.pending.value).toBe(false);expect(f.view.hasEditingChanges()).toBe(false)
  })
})


