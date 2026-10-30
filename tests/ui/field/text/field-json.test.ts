import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElInput, ElInputNumber, ElSelect} from 'element-plus'
import VXETable, {VxeTable} from 'vxe-table'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, registerAllRenderers, useSparkComponent, JsonTreeEditor, SparkJsonEditor} from '@spark-appworks/spark-component'
const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w=>w.unmount()); runtimes.splice(0).forEach(r=>r.dispose()); config.global.stubs=original;vi.unstubAllGlobals()})
async function fixture(realEditor = false, native = false, onChange?: () => Promise<void>) {
  registerAllRenderers()
  const ds=SparkData.fromJson({scenarioId:'S',dataSetName:'S',tables:{Rules:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'json',type:'string'}],views:{default:{commitMode:'staged',rows:[{id:'a',json:'{"old":1}'},{id:'b',json:'{}'}]}}}}})
  const runtime=new PageRuntime({pageId:'json-test',scenarioIds:['S'],loadScenario:async()=>ds}); await runtime.load(); runtimes.push(runtime)
  const view=ds.getView('Rules')!; if(native) view.replaceRows([{id:'a',json:{old:1}},{id:'b'}]); view.setCurrentRowById('a'); const readonly=ref(false), editing=ref(false), mode=ref<'tree'|'text'|'table'>('tree'), valuePath=ref<(string | number)[]>([])
  const stubs={...original}; delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']; config.global.stubs=stubs
  const wrapper=mount(defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'json-test'});sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererForm,{dataViewKey:'S@Rules@default',children:[{type:'r-json',props:{field:'json',label:'规则',onChange,onEditingChange:(value:boolean)=>{editing.value=value},readonly:readonly.value,mode:mode.value,valuePath:valuePath.value,...(native?{valueFormat:'native',emptyValue:[]}: {})}}]})}}),{global:{plugins:[ElementPlus,VXETable,Spark.createPlugin()],stubs:{JsonTreeEditor:!realEditor,SparkJsonEditor:!realEditor}}})
  wrappers.push(wrapper);await flushPromises();return{wrapper,view,readonly,editing,mode,valuePath}
}
describe('bound JSON field',()=>{
  it('does not emit a document change from a captured insertion after its policy denies the container',async()=>{
    const wrapper=mount(JsonTreeEditor,{props:{modelValue:'{"value":{}}'},global:{plugins:[ElementPlus,VXETable]}})
    wrappers.push(wrapper);await flushPromises()
    const button=wrapper.findAllComponents({name:'GlobalElButtonStub'}).find(control=>control.text()==='加子项')!
    const insert=button.vm.$.vnode.props?.['onClick']
    expect(typeof insert).toBe('function')
    await wrapper.setProps({policy:{canAddChild:()=>false}});await flushPromises()
    if(typeof insert==='function')insert()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('update:documentValue')).toBeUndefined()
    expect(wrapper.getComponent(VxeTable).props('data')?.map(row=>row.displayKey)).toEqual(['$','value'])
  })
  it.each([false,true])('protects native tree structure while editing the actual value (nested=%s)',async nested=>{
    const f=await fixture(true,true)
    if(nested){f.view.replaceRows([{id:'a',json:{target:{old:1},keep:7}}]);f.view.setCurrentRowById('a');f.valuePath.value=['target'];await flushPromises()}
    const tree=()=>f.wrapper.getComponent(JsonTreeEditor)
    const select=async(path:(string|number)[])=>{const table=tree().getComponent(VxeTable);table.vm.$emit('current-row-change',{newValue:table.props('data')?.find(row=>JSON.stringify(row.path)===JSON.stringify(path))});await flushPromises()}
    const actions=()=>tree().findAll('button').filter(button=>['加子项','加同级','删除'].includes(button.text())).map(button=>button.text())
    expect(actions()).toEqual([])
    await tree().findAll('button').find(button=>button.text()==='展开全部')!.trigger('click');await flushPromises()
    await select(['value']);expect(actions()).toEqual(['加子项'])
    tree().findAllComponents(ElSelect).find(control=>control.props('modelValue')==='object')!.vm.$emit('update:modelValue','array');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toEqual(nested?{target:[],keep:7}:[])
    await select(['value']);await tree().findAll('button').find(button=>button.text()==='加子项')!.trigger('click');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toEqual(nested?{target:[''],keep:7}:[''])
    await select(['value',0]);expect(actions()).toEqual(['加同级','删除'])
    await tree().findAll('button').find(button=>button.text()==='删除')!.trigger('click');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toEqual(nested?{target:[],keep:7}:[])
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(JSON.parse(tree().props('modelValue')!)).toEqual({value:{old:1}})
    expect(f.editing.value).toBe(false);expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('keeps ordinary JSON document root insertion available through the bound field',async()=>{
    const f=await fixture(true)
    await f.wrapper.getComponent(JsonTreeEditor).findAll('button').find(button=>button.text()==='加子项')!.trigger('click');await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({old:1,newKey:''})
    f.view.discardEditingRows(['a']);await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each(['tree','text','table'] as const)('keeps rejected %s content pending until correction or explicit cancel',async mode=>{
    const f=await fixture(false,true);f.mode.value=mode;await flushPromises()
    const component=mode==='tree'?JsonTreeEditor:SparkJsonEditor
    f.wrapper.getComponent(component).vm.$emit('update:modelValue',mode==='tree'?'{}':'{');await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    f.wrapper.getComponent(component).vm.$emit('update:modelValue',mode==='tree'?'{"value":false}':'false');await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.view.getEditingRow('a')?.['json']).toBe(false)
    f.view.discardEditingRows(['a']);await flushPromises()
    const old=f.wrapper.getComponent(component)
    old.vm.$emit('update:modelValue',mode==='tree'?'{}':'{');await flushPromises()
    await f.wrapper.get('[data-json-cancel-editor-input]').trigger('click');await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(JSON.parse(f.wrapper.getComponent(component).props('modelValue')!)).toEqual(mode==='tree'?{value:{old:1}}:{old:1})
    old.vm.$emit('update:modelValue',mode==='tree'?'{"value":9}':'9');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each([true,false])('waits for the original tree field write (accepted=%s) and can cancel rejected content',async accepted=>{
    let release=()=>{}
    const wait=new Promise<void>(resolve=>{release=resolve})
    const f=await fixture(true,true,async()=>{await wait;if(!accepted)throw new Error('write rejected')})
    const tree=f.wrapper.getComponent(JsonTreeEditor),table=tree.getComponent(VxeTable)
    await tree.findAll('button').find(button=>button.text()==='展开全部')!.trigger('click');await flushPromises()
    table.vm.$emit('current-row-change',{newValue:table.props('data')?.find(row=>row.displayKey==='old')});await flushPromises()
    tree.getComponent(ElInputNumber).vm.$emit('change',0);await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.get('[data-json-cancel-editor-input]').attributes('disabled')).toBeDefined()
    release();await flushPromises()
    expect(f.editing.value).toBe(!accepted)
    if(accepted)expect(f.view.getEditingRow('a')?.['json']).toEqual({old:0})
    else {
      expect(f.view.hasEditingChanges()).toBe(false)
      await f.wrapper.get('[data-json-cancel-editor-input]').trigger('click');await flushPromises()
      expect(f.editing.value).toBe(false)
      expect(JSON.parse(f.wrapper.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:{old:1}})
    }
  })
  it('reports a real tree string input before change and cancels it without writing the original row',async()=>{
    const f=await fixture(true,true)
    f.view.replaceRows([{id:'a',json:{label:'old'}}]);f.view.setCurrentRowById('a');await flushPromises()
    const tree=f.wrapper.getComponent(JsonTreeEditor),table=tree.getComponent(VxeTable)
    await tree.findAll('button').find(button=>button.text()==='展开全部')!.trigger('click');await flushPromises()
    table.vm.$emit('current-row-change',{newValue:table.props('data')?.find(row=>row.displayKey==='label')});await flushPromises()
    const input=tree.findAllComponents(ElInput).find(control=>control.props('modelValue')==='old')!
    input.vm.$emit('update:modelValue','unfinished');await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    await f.wrapper.get('[data-json-cancel-editor-input]').trigger('click');await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.view.hasEditingChanges()).toBe(false)
    expect(JSON.parse(f.wrapper.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:{label:'old'}})
  })
  it('retains malformed native JSON in the real text fallback until original-field cancellation',async()=>{
    const f=await fixture(true,true);vi.stubGlobal('ResizeObserver',undefined);f.mode.value='text';await flushPromises()
    await f.wrapper.get('textarea').setValue('{');await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('{')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.editing.value).toBe(false)
    expect(JSON.parse(f.wrapper.get<HTMLTextAreaElement>('textarea').element.value)).toEqual({old:1})
  })
  it.each(['tree','text'] as const)('keeps new %s input pending when an old asynchronous row write finishes',async mode=>{
    let first=()=>{},second=()=>{},calls=0
    const oldWait=new Promise<void>(resolve=>{first=resolve}),newWait=new Promise<void>(resolve=>{second=resolve})
    const f=await fixture(false,true,()=>++calls===1?oldWait:newWait);f.mode.value=mode;await flushPromises()
    const component=mode==='tree'?JsonTreeEditor:SparkJsonEditor
    f.wrapper.getComponent(component).vm.$emit('update:modelValue',mode==='tree'?'{"value":1}':'1');await flushPromises()
    expect(f.editing.value).toBe(true)
    f.view.setCurrentRowById('b');await flushPromises()
    const current=f.wrapper.getComponent(component)
    current.vm.$emit('editing-change',true);await flushPromises()
    first();await flushPromises()
    expect(f.editing.value).toBe(true);expect(f.view.hasEditingChanges()).toBe(false)
    current.vm.$emit('update:modelValue',mode==='tree'?'{"value":2}':'2');current.vm.$emit('editing-change',false);await flushPromises()
    expect(f.editing.value).toBe(true)
    second();await flushPromises()
    expect(f.editing.value).toBe(false);expect(f.view.getEditingRow('b')?.['json']).toBe(2)
    expect(f.view.getEditingRow('a')?.['json']).toEqual({old:1})
  })
  it.each(['sibling', 'target', 'path'] as const)('handles an async field event when %s changes',async change=>{
    let release=()=>{}
    const waiting=new Promise<void>(resolve=>{release=resolve})
    const f=await fixture(false,true,()=>waiting)
    f.view.replaceRows([{id:'a',json:{columns:[{name:'id'}],other:0}}]);f.view.setCurrentRowById('a')
    f.valuePath.value=['columns'];f.mode.value='text';await flushPromises()
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','[{"name":"new"}]');await flushPromises()
    if(change==='path')f.valuePath.value=['other']
    else f.view.updateEditingValue('a','json',{columns:[{name:change==='target'?'external':'id'}],other:7})
    await flushPromises();release();await flushPromises()
    expect(f.view.getEditingRow('a')!['json']).toEqual(change==='path'?{columns:[{name:'id'}],other:0}:
      {columns:[{name:change==='target'?'external':'new'}],other:7})
  })

  it.each([false, true])('edits a nested JSON value in the original field and preserves siblings (native=%s)', async native => {
    const f = await fixture(false, native)
    const original = {columns: [{name:'id', label:'编号', extra:false}], resourceId:'pagedata:views', other: {zero:0}}
    f.view.replaceRows([{id:'a', json:native ? original : JSON.stringify(original)}]); f.view.setCurrentRowById('a')
    f.valuePath.value=['columns']; f.mode.value='text'; await flushPromises()
    const editor=f.wrapper.getComponent(SparkJsonEditor)
    expect(JSON.parse(editor.props('modelValue')!)).toEqual(original.columns)
    expect(f.view.hasEditingChanges()).toBe(false)
    editor.vm.$emit('update:modelValue','[{"name":"id","label":"新标题","extra":false}]'); await flushPromises()
    const raw=f.view.getEditingRow('a')!['json'], result=native ? raw : JSON.parse(String(raw))
    expect(result).toEqual({...original, columns:[{name:'id',label:'新标题',extra:false}]})
    expect(f.view.rows[0]!['json']).toEqual(native ? original : JSON.stringify(original))
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(JSON.parse(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')!)).toEqual(original.columns)
    editor.vm.$emit('update:modelValue','[{"name":"stale"}]');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('invalidates nested writes after path changes and refuses missing or inherited paths',async()=>{
    const f=await fixture(false,true)
    f.view.replaceRows([{id:'a',json:{'literal.dot':[{x:1}],other:[false]}}]);f.view.setCurrentRowById('a')
    f.valuePath.value=['literal.dot',0];await flushPromises()
    const old=f.wrapper.getComponent(JsonTreeEditor)
    expect(JSON.parse(old.props('modelValue')!)).toEqual({value:{x:1}})
    f.valuePath.value=['other'];await flushPromises()
    old.vm.$emit('update:modelValue','{"value":{"x":2}}');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    for(const path of [['missing'],['constructor'],['literal.dot',2],['literal.dot','0']]) {
      f.valuePath.value=path;await flushPromises()
      f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{"value":[]}');await flushPromises()
      expect(f.view.hasEditingChanges()).toBe(false)
      expect(f.wrapper.text()).toContain('路径')
    }
  })

  it('renews the editor after replacing the same keyed source row and rejects its previous events',async()=>{
    const f=await fixture(false,true),old=f.wrapper.getComponent(JsonTreeEditor)
    f.view.replaceRows([{id:'a',json:null}]);f.view.setCurrentRowById('a');await flushPromises()
    old.vm.$emit('update:modelValue','{"value":"stale"}');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toBeNull()
    f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{"value":false}');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toBe(false)
    f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{"value":0}');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toBe(0)
  })
  it('edits native objects using the existing document tree without serializing the DataView field',async()=>{
    const f=await fixture(true,true), tree=f.wrapper.getComponent(JsonTreeEditor), table=tree.getComponent(VxeTable)
    expect(JSON.parse(tree.props('modelValue')!)).toEqual({value:{old:1}})
    expect(table.props('data')?.find(row=>row.depth===0)?.keyEditable).toBe(false)
    expect(table.props('data')?.find(row=>row.displayKey==='value')?.keyEditable).toBe(false)
    await tree.findAll('button').find(button=>button.text()==='展开全部')!.trigger('click');await flushPromises()
    const node=table.props('data')?.find(row=>row.displayKey==='old')
    table.vm.$emit('current-row-change',{newValue:node});await flushPromises()
    tree.getComponent(ElInputNumber).vm.$emit('change',0);await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toEqual({old:0})
    expect(f.view.rows[0]?.['json']).toEqual({old:1})
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(JSON.parse(f.wrapper.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:{old:1}})
    tree.vm.$emit('update:modelValue','{"value":{"old":9}}');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('retains native scalar types and does not stage the displayed empty value on open',async()=>{
    const f=await fixture(false,true)
    for(const value of [false,0,null,'0',['rowid'],{nested:[false,0]}]) {
      f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue',JSON.stringify({value}));await flushPromises()
      expect(f.view.getEditingRow('a')?.['json']).toEqual(value)
    }
    const old=f.wrapper.getComponent(JsonTreeEditor)
    f.view.setCurrentRowById('b');await flushPromises()
    expect(JSON.parse(f.wrapper.getComponent(JsonTreeEditor).props('modelValue')!)).toEqual({value:[]})
    expect(f.view.getEditingRow('b')).not.toHaveProperty('json')
    old.vm.$emit('update:modelValue','{"value":{"stale":true}}');await flushPromises()
    expect(f.view.getEditingRow('b')).not.toHaveProperty('json')
    f.readonly.value=true;await flushPromises()
    f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue','{"value":false}');await flushPromises()
    expect(f.view.getEditingRow('b')).not.toHaveProperty('json')
  })
  it('rejects malformed native edits without replacing the original and supports native text editing',async()=>{
    const f=await fixture(false,true)
    for(const text of ['{','{"wrong":1}','{"value":1e999}','{"value":1,"extra":true}']) {
      f.wrapper.getComponent(JsonTreeEditor).vm.$emit('update:modelValue',text);await flushPromises()
      expect(f.view.hasEditingChanges()).toBe(false)
      expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    }
    f.mode.value='text';await flushPromises()
    expect(JSON.parse(f.wrapper.getComponent(SparkJsonEditor).props('modelValue')!)).toEqual({old:1})
    f.wrapper.getComponent(SparkJsonEditor).vm.$emit('update:modelValue','[false,0,"0"]');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toEqual([false,0,'0'])
  })
  it.each(['text', 'table'] as const)('keeps the %s presentation on the same field editing domain',async mode=>{
    const f=await fixture();f.mode.value=mode;await flushPromises()
    expect(f.wrapper.findComponent(JsonTreeEditor).exists()).toBe(false)
    const editor=f.wrapper.getComponent(SparkJsonEditor)
    expect(editor.props('mode')).toBe(mode)
    editor.vm.$emit('update:modelValue','{"text":false}');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toBe('{"text":false}')
    f.mode.value='tree';await flushPromises()
    expect(f.wrapper.getComponent(JsonTreeEditor).props('modelValue')).toBe('{"text":false}')
  })
  it('edits through the real JSON document tree and discards through the original DataView',async()=>{
    const f=await fixture(true), tree=f.wrapper.getComponent(JsonTreeEditor), table=tree.getComponent(VxeTable)
    expect(table.props('data')?.find(row=>row.depth===0)?.keyEditable).toBe(false)
    const node=table.props('data')?.find(row=>row.displayKey==='old')
    expect(node).toMatchObject({type:'number',numberValue:1})
    table.vm.$emit('current-row-change',{newValue:node});await flushPromises()
    tree.getComponent(ElInputNumber).vm.$emit('change',0);await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({old:0})
    expect(f.view.rows[0]?.['json']).toBe('{"old":1}')
    f.view.discardEditingRows(['a']);await flushPromises()
    expect(f.wrapper.getComponent(JsonTreeEditor).getComponent(VxeTable).props('data')?.find(row=>row.displayKey==='old')).toMatchObject({numberValue:1})
  })
  it('uses the existing JSON editor to stage its string field and restore on discard',async()=>{
    const f=await fixture();const editor=f.wrapper.findComponent(JsonTreeEditor)
    expect(editor.exists()).toBe(true);expect(editor.props('modelValue')).toBe('{"old":1}')
    editor.vm.$emit('update:modelValue','{"new":[1,2]}');await flushPromises()
    expect(f.view.getEditingRow('a')?.['json']).toBe('{"new":[1,2]}');expect(f.view.rows[0]?.['json']).toBe('{"old":1}')
    f.view.discardEditingRows(['a']);await flushPromises();expect(f.wrapper.findComponent(JsonTreeEditor).props('modelValue')).toBe('{"old":1}')
  })
  it('does not apply a stale editor event after row change or a readonly edit',async()=>{
    const f=await fixture();const old=f.wrapper.findComponent(JsonTreeEditor);expect(old.exists()).toBe(true)
    f.view.setCurrentRowById('b');await flushPromises();
    old.vm.$emit('update:modelValue','{"stale":true}');await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value=true;await flushPromises();const editor=f.wrapper.findComponent(JsonTreeEditor);expect(editor.props('readOnly')).toBe(true)
    editor.vm.$emit('update:modelValue','{"denied":true}');await flushPromises();expect(f.view.hasEditingChanges()).toBe(false)
  })
})

