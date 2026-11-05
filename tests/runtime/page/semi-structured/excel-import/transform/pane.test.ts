import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererButton,RendererTable,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {buildDataViewKey,getSparkNodeChildren,nodeInputProps} from '@spark-appworks/spark-data'
import RulePane from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rules-pane.vue'
import RuleDialog from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog.vue'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'

const sessions:Array<()=>void>=[]
afterEach(()=>sessions.splice(0).forEach(close=>close()))
async function fixture(){
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'订单',exportType:'default',sheet_layout_json:'',relatedappid:'APP',table:'db@orders',parentField:'',foreignKeyField:''}],Base_ImportData_Field:[{rowid:'F1',configid:'C1',name:'code',index:'A',isReadOnly:0}],
  Base_Import_Transform_Rule:['R1','R2'].map((id,index)=>({id,scheme_id:'E1',config_id:'C1',rule_name:id,rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:10+index*10,enabled:1,on_error:'FAIL_ROW',phase:'OLD',description:'保留',condition_json:'',config_json:'{}'}))})
 const wrapper=mount(defineComponent({setup(){useSparkComponent({type:'rule-pane-host'}).sparkProvide(PAGE_RUNTIME,f.runtime)
  return()=>h(RulePane,{dataViewKey:buildDataViewKey('Base_Import_Transform_Rule','default',EXCEL_DESIGN),fieldOptionsKey:buildDataViewKey('Base_ImportData_Field','foreignKeyFields',EXCEL_DESIGN),hasNode:true})
 }}),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
 sessions.push(()=>{wrapper.unmount();f.runtime.dispose()});await flushPromises()
 const click=async(label:string)=>{const button=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label);if(!button)throw Error(`Missing ${label}`);button.vm.$emit('click');await flushPromises()}
 return {...f,wrapper,click}
}
describe('original DataView transform rules workspace',()=>{
 it.each(['save','discard'] as const)('reopens a pending native creation under its original add permission to %s only that record',async operation=>{
  const f=await fixture()
  await f.rules.addRowWithIdentity({field:'id',value:'R3'},{rule_name:'pending new',rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:30,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{}'})
  const row=f.rules.rows.find(row=>row['id']==='R3');if(!row)throw Error('Missing creation')
  expect(f.rules.editActionState(row)).toBe('enabled')
  const actions=getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children).map(nodeInputProps)
  const edit=actions.find(action=>action['label']==='编辑')?.['onClick'];if(typeof edit!=='function')throw Error('Missing edit action')
  edit(row);await flushPromises();await f.click(operation==='save'?'继续保存本条修改':'放弃本条待提交修改')
  if(operation==='save'){expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]?.added.map(row=>row['id'])).toEqual(['R3'])}
  else{expect(f.http.saves).toEqual([]);expect(f.rules.rows.some(row=>row['id']==='R3')).toBe(false)}
 })
 it('saves a newly generated rule identity through its dialog without fabricating a rowid field',async()=>{
  const f=await fixture();await f.click('新增规则')
  const id=f.wrapper.getComponent(RuleDialog).props('recordId')
  f.rules.updateEditingValue(id,'source_field','code');f.rules.updateEditingValue(id,'target_field','code');f.rules.updateEditingValue(id,'rule_name','created in dialog')
  await f.click('保存')
  expect(f.http.saves).toHaveLength(1)
  expect(f.http.saves[0]?.added[0]).toMatchObject({id,scheme_id:'E1',config_id:'C1',source_field:'code',target_field:'code'})
  expect(f.http.saves[0]?.added[0]).not.toHaveProperty('rowid')
  expect(f.wrapper.findComponent(RuleDialog).exists()).toBe(false)
 })
 it('verifies only the original mixed-row capture from its recovery entry without saving a later draft',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','rule_name','one');f.rules.updateEditingValue('R2','rule_name','two');f.http.failAfterWrite=true
  await expect(f.ds.saveChanges()).rejects.toThrow();f.rules.updateEditingValue('R1','rule_name','later draft');await flushPromises()
  await f.click('核验原未确认规则提交')
  expect(f.rules.hasUnconfirmedSave).toBe(false);expect(f.http.saves).toHaveLength(1)
  expect(f.rules.getEditingRow('R1')?.['rule_name']).toBe('later draft')
 })
 it.each(['save','discard'] as const)('handles a currently selected staged row through a fresh %s interaction only',async operation=>{
  const f=await fixture();await f.rules.editRowById('R1',{rule_name:'pending current row'});f.rules.updateEditingValue('R2','config_json','{bad')
  const actions=getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children).map(nodeInputProps)
  const edit=actions.find(action=>action['label']==='编辑')?.['onClick']
  if(typeof edit!=='function')throw Error('Missing edit action')
  edit(f.rules.rows[0]);await flushPromises()
  await f.click(operation==='save'?'继续保存本条修改':'放弃本条待提交修改')
  expect(f.rules.dirtyTracking.hasPendingChanges('R1')).toBe(false)
  expect(f.rules.getEditingRow('R2')?.['config_json']).toBe('{bad')
  if(operation==='save'){expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]?.changed).toEqual([{id:'R1',rule_name:'pending current row'}])}
  else{expect(f.http.saves).toEqual([]);expect(f.rules.rows.find(row=>row['id']==='R1')?.['rule_name']).toBe('R1')}
 })
 it('does not delete a replacement with the same ID through an already open confirmation',async()=>{
  const f=await fixture()
  const actions=getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children).map(nodeInputProps)
  const remove=actions.find(action=>action['label']==='删除')?.['onClick']
  if(typeof remove!=='function')throw Error('Missing delete action')
  remove(f.rules.rows[0]);await flushPromises()
  await f.rules.refresh();await flushPromises()
  await f.click('确认删除规则')
  expect(f.http.saves).toEqual([])
  expect(f.rules.rows.map(row=>f.rules.getPkKey(row))).toEqual(['R1','R2'])
 })
 it('creates a scoped native-ID rule and cancels only that creation while retaining another draft',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R2','config_json','{bad')
  await f.click('新增规则')
  const dialog=f.wrapper.getComponent(RuleDialog),id=dialog.props('recordId')
  expect(id).not.toBe('R1');expect(id).not.toBe('R2')
  expect(f.rules.rows.find(row=>f.rules.getPkKey(row)===id)).toMatchObject({scheme_id:'E1',config_id:'C1',rule_type:'TRIM',sort_order:30,enabled:1,phase:''})
  await f.click('取消')
  expect(f.rules.rows.map(row=>f.rules.getPkKey(row))).toEqual(['R1','R2'])
  expect(f.rules.getEditingRow('R2')?.['config_json']).toBe('{bad')
  expect(f.http.saves).toEqual([])
 })
 it('uses standard child fields for a read-only list with original-row edit and delete actions',async()=>{
  const f=await fixture(),table=f.wrapper.getComponent(RendererTable)
  expect(getSparkNodeChildren(table.props('children')).every(node=>nodeInputProps(node)['readonly']===true)).toBe(true)
  const actions=getSparkNodeChildren(table.props('actions')?.children).map(nodeInputProps)
  expect(actions.map(node=>node['label'])).toEqual(['编辑','删除'])
  const edit=actions.find(node=>node['label']==='编辑')?.['onClick']
  if(typeof edit!=='function')throw Error('Missing original-row edit')
  edit(f.rules.rows[1]);await flushPromises()
  expect(f.wrapper.getComponent(RuleDialog).props('recordId')).toBe('R2')
 })
 it('confirms deletion of only the clicked native ID while leaving another invalid draft untouched',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R2','config_json','{bad')
  const original=structuredClone(f.http.records['Base_Import_Transform_Rule']?.find(row=>row['id']==='R1'))
  const actions=getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children).map(nodeInputProps)
  const remove=actions.find(action=>action['label']==='删除')?.['onClick']
  if(typeof remove!=='function')throw Error('Missing delete action')
  remove(f.rules.rows[0]);await flushPromises()
  expect(f.http.saves).toEqual([])
  expect(f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认删除规则')?.props('disabled')).toBe(false)
  expect(f.rules.mutating).toBe(false)
  await f.click('确认删除规则')
  expect(f.rules.rows.map(row=>f.rules.getPkKey(row))).toEqual(['R2'])
  expect(f.wrapper.findAll('[role="alert"]').map(alert=>alert.text())).toEqual([])
  await vi.waitFor(()=>expect(f.http.saves).toHaveLength(1))
  expect(f.http.saves[0]?.deleted).toEqual([original])
  expect(f.rules.getEditingRow('R2')?.['config_json']).toBe('{bad')
  expect(f.http.records['Base_Import_Transform_Rule']?.map(row=>row['id'])).toEqual(['R2'])
 })
 it('verifies an unknown delete without replay and forbids cancel before its receipt is resolved',async()=>{
  const f=await fixture()
  const actions=getSparkNodeChildren(f.wrapper.getComponent(RendererTable).props('actions')?.children).map(nodeInputProps)
  const remove=actions.find(action=>action['label']==='删除')?.['onClick']
  if(typeof remove!=='function')throw Error('Missing delete action')
  remove(f.rules.rows[0]);await flushPromises();f.http.failAfterWrite=true
  await f.click('确认删除规则')
  await vi.waitFor(()=>expect(f.rules.hasUnconfirmedSave).toBe(true))
  await f.click('取消删除规则')
  expect(f.rules.hasUnconfirmedSave).toBe(true)
  await f.click('核验原删除结果')
  expect(f.rules.hasUnconfirmedSave).toBe(false)
  expect(f.http.saves).toHaveLength(1)
 })
})
