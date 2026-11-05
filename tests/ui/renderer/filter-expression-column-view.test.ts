import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererFilterExpression,FilterExpressionEditor,useSparkComponent} from '@spark-appworks/spark-component'
const wrappers:VueWrapper[]=[],pages:PageRuntime[]=[]
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());pages.splice(0).forEach(page=>page.dispose())})
async function fixture(){
 const ds=SparkData.fromJson({scenarioId:'S',tables:{
  Definitions:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'Filter',type:'string'}],views:{default:{commitMode:'staged',rows:[{id:'A',Filter:''}]}}},
  Fields:{resourceType:'static-data',columns:[{name:'name',type:'string',isPrimaryKey:true},{name:'title',type:'string'},{name:'kind',type:'int'}],views:{default:{valueField:'name',labelField:'title',rows:[{name:'code',title:'编码',kind:0},{name:'amount',title:'金额',kind:1}]}}}
 }})
 const page=new PageRuntime({pageId:'filter-columns',scenarioIds:['S'],loadScenario:async()=>ds});await page.load();pages.push(page)
 const definitions=ds.getView('Definitions')!,fields=ds.getView('Fields')!;definitions.setCurrentRowById('A')
 const wrapper=mount(defineComponent({setup(){useSparkComponent({type:'column-directory-host'}).sparkProvide(PAGE_RUNTIME,page)
  return()=>h(RendererFilterExpression,{dataViewKey:'S@Definitions@default',field:'Filter',format:'spark-json',columnDataViewKey:'S@Fields@default',columnTypeField:'kind',columnTypeMap:{'0':'string','1':'number'},columnTable:{name:'CurrentFields',label:'当前字段'}})
 }}),{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{SparkJsonEditor:true,JsonTreeEditor:true}}});wrappers.push(wrapper);await flushPromises()
 return {ds,page,definitions,fields,wrapper}
}
describe('standard filter definition column DataView binding',()=>{
 it('withdraws unreadable field candidates and rejects an application captured before permission changed',async()=>{
  const f=await fixture(),oldApply=f.wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
  const original=f.fields.fieldAccess.bind(f.fields)
  const access=vi.spyOn(f.fields,'fieldAccess').mockImplementation((row,field)=>field==='name'?{...original(row,field),read:'masked' as const}:original(row,field))
  try{
   f.fields.events.emit('rowsChanged');await flushPromises()
   expect(f.wrapper.text()).toContain('名称或类型不可读')
   expect(f.wrapper.getComponent(FilterExpressionEditor).props('disabled')).toBe(true)
   expect(f.wrapper.getComponent(FilterExpressionEditor).props('functionContext')?.tables).toBeUndefined()
   if(typeof oldApply==='function')oldApply({field:'code',operator:'eq',value:'late'})
   expect(f.definitions.hasEditingChanges()).toBe(false)
  }finally{access.mockRestore()}
 })
 it('does not treat edits of the directory itself as formally saved candidates',async()=>{
  const f=await fixture()
  f.fields.updateEditingValue('code','title','未保存标题');await flushPromises()
  expect(f.wrapper.text()).toContain('未确认的编辑')
  f.wrapper.getComponent(FilterExpressionEditor).vm.$emit('update:modelValue',{field:'code',operator:'eq',value:'blocked'});await flushPromises()
  expect(f.definitions.hasEditingChanges()).toBe(false)
  f.fields.discardEditingRows();await flushPromises()
  expect(f.wrapper.getComponent(FilterExpressionEditor).props('columns')?.[0]?.label).toBe('编码')
 })
 it.each(['replace','destroy'])('rejects a callback immediately after a directory %s before queued view events',async(action)=>{
  const f=await fixture(),oldApply=f.wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
  if(action==='replace')f.fields.replaceRows([{name:'next',title:'新字段',kind:0}])
  else f.fields.dataTable!.destroyView('default')
  if(typeof oldApply==='function')oldApply({field:'code',operator:'eq',value:'late'})
  expect(f.definitions.hasEditingChanges()).toBe(false)
  await flushPromises()
 })
 it('rejects a late callback after the bound row is replaced by another object with the same primary key',async()=>{
  const f=await fixture(),oldApply=f.wrapper.getComponent(FilterExpressionEditor).vm.$.vnode.props?.['onUpdate:modelValue']
  f.definitions.replaceRows([{id:'A',Filter:''}]);f.definitions.setCurrentRowById('A');await flushPromises()
  if(typeof oldApply==='function')oldApply({field:'code',operator:'eq',value:'old row'})
  expect(f.definitions.hasEditingChanges()).toBe(false)
 })
 it('reads the exact field directory including native zero types and writes only the bound filter through the codec',async()=>{
  const f=await fixture(),editor=f.wrapper.getComponent(FilterExpressionEditor)
  expect(editor.props('columns'),f.wrapper.text()).toEqual([{name:'code',label:'编码',type:'string'},{name:'amount',label:'金额',type:'number'}])
  expect(editor.props('functionContext')?.tables).toEqual([{name:'CurrentFields',label:'当前字段',fields:[{name:'code',label:'编码'},{name:'amount',label:'金额'}]}])
  expect(editor.props('functionContext')?.relatedFields).toBeUndefined()
  editor.vm.$emit('update:modelValue',{field:'amount',operator:'eq',value:0});await flushPromises()
  const stored=f.definitions.getEditingRow('A')?.['Filter'];if(typeof stored!=='string')throw Error('filter not stored as text')
  expect(DataViewFilterCodec.parseStored(stored)?.toJSON()).toEqual({field:'amount',operator:'eq',value:0})
  expect(f.fields.hasEditingChanges()).toBe(false)
 })
 it('invalidates captured application when the field catalog changes and rejects fields absent from the current directory',async()=>{
  const f=await fixture(),editor=f.wrapper.getComponent(FilterExpressionEditor),oldApply=editor.vm.$.vnode.props?.['onUpdate:modelValue']
  f.fields.replaceRows([{name:'next',title:'新字段',kind:0}]);await flushPromises()
  if(typeof oldApply==='function')oldApply({field:'code',operator:'eq',value:'late'})
  expect(f.definitions.hasEditingChanges()).toBe(false)
  const current=f.wrapper.getComponent(FilterExpressionEditor)
  current.vm.$emit('update:modelValue',{field:'code',operator:'eq',value:'removed'});await flushPromises()
  expect(f.definitions.hasEditingChanges()).toBe(false)
  current.vm.$emit('update:modelValue',{field:'next',operator:'eq',value:''});await flushPromises()
  const stored=f.definitions.getEditingRow('A')?.['Filter'];if(typeof stored!=='string')throw Error('filter not stored as text')
  expect(DataViewFilterCodec.parseStored(stored)?.toJSON()).toEqual({field:'next',operator:'eq',value:''})
 })
})
