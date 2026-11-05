import {afterEach,describe,expect,it} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldCheckbox,FieldSelect,RendererButton,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import RuleDialog from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rule-dialog.vue'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'

const sessions:Array<()=>void>=[]
afterEach(()=>sessions.splice(0).forEach(close=>close()))
async function fixture(patch:Record<string,unknown>={},creating=false){
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'订单',exportType:'default',sheet_layout_json:'',relatedappid:'APP',table:'db@orders',parentField:'',foreignKeyField:''}],Base_ImportData_Field:[{rowid:'F1',configid:'C1',name:'code',index:'A',isReadOnly:0}],
  Base_Import_Transform_Rule:['R1','R2'].map((id,index)=>({id,scheme_id:'E1',config_id:'C1',rule_name:id,rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:10+index*10,enabled:1,on_error:'FAIL_ROW',phase:'OLD',description:'保留',condition_json:'',config_json:'{"executionScope":"IMPORT","extension":false}',...(index===0?patch:{})}))})
 f.rules.setCurrentRowById('R1');f.rules.updateEditingValue('R1','rule_name','opening draft')
 if(creating)await f.rules.addRowWithIdentity({field:'id',value:'R3'},{rule_name:'new rule',rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:30,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{}'})
 const wrapper=mount(defineComponent({setup(){useSparkComponent({type:'rule-dialog-host'}).sparkProvide(PAGE_RUNTIME,f.runtime)
  return()=>h(RuleDialog,{dataViewKey:buildDataViewKey('Base_Import_Transform_Rule','default',EXCEL_DESIGN),recordId:creating?'R3':'R1',created:creating,fieldOptionsKey:buildDataViewKey('Base_ImportData_Field','foreignKeyFields',EXCEL_DESIGN)})
 }}),{global:{plugins:[ElementPlus,Spark.createPlugin()]}})
 sessions.push(()=>{wrapper.unmount();f.runtime.dispose()})
 await flushPromises()
 const click=async(label:string)=>{const button=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label);if(!button)throw Error(`Missing button ${label}`);button.vm.$emit('click');await flushPromises()}
 return {...f,wrapper,click}
}
describe('original DataView transform rule dialog',()=>{
 it('presents the native null enabled flag as active without writing a default',async()=>{
  const f=await fixture({enabled:null})
  const checkbox=f.wrapper.getComponent(FieldCheckbox)
  expect(checkbox.props('nullChecked')).toBe(true)
  const input=checkbox.find('input[type="checkbox"]').element
  expect(input instanceof HTMLInputElement&&input.checked).toBe(true)
  expect(f.rules.getEditingRow('R1')?.['enabled']).toBeNull()
  expect(f.http.saves).toEqual([])
  await f.click('取消')
  expect(f.rules.getEditingRow('R1')?.['enabled']).toBeNull()
  expect(f.http.saves).toEqual([])
 })
 it('closes without touching its draft when another row owns the unknown submission',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','rule_name','keep this dialog draft');f.rules.updateEditingValue('R2','rule_name','other once');f.http.failAfterWrite=true
  await expect(f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['R2']}]})).rejects.toThrow()
  await flushPromises();await f.click('关闭并保留草稿')
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
  expect(f.rules.getEditingRow('R1')?.['rule_name']).toBe('keep this dialog draft')
  expect(f.rules.hasUnconfirmedSaveFor(['R2'])).toBe(true);expect(f.http.saves).toHaveLength(1)
  await f.ds.saveChanges({applyEditingRows:false,views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['R2']}]})
  expect(f.rules.hasUnconfirmedSave).toBe(false);expect(f.http.saves).toHaveLength(1)
 })
 it('does not turn a stale verification click into a new write after another caller resolved its capture',async()=>{
  const f=await fixture();f.http.failAfterWrite=true;await f.click('保存')
  const verify=f.wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='核验原保存结果');if(!verify)throw Error('Missing verify button')
  await f.ds.saveChanges({applyEditingRows:false,views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['R1']}]})
  await f.rules.editRowById('R1',{rule_name:'later unrelated staged change'})
  verify.vm.$emit('click');await flushPromises()
  expect(f.http.saves).toHaveLength(1);expect(f.rules.dirtyTracking.hasPendingChanges('R1')).toBe(true)
 })
 it('keeps its confirmed new rule open while permission reads remain incomplete and never resends creation',async()=>{
  const f=await fixture({},true);let omit=true
  f.http.interceptors.request.use({onRequest:request=>{
   if(omit&&request.url==='/api/DataOperation/GetData'&&JSON.stringify(request.data).includes('"R3"'))request.data=JSON.parse(JSON.stringify(request.data).replaceAll('"R3"','"ABSENT"'))
   return request
  }})
  await f.click('保存')
  expect(f.http.saves).toHaveLength(1);expect(f.rules.hasPendingSavedRowPermissions).toBe(true)
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toBeUndefined()
  await f.click('回读已保存规则权限')
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toBeUndefined()
  expect(f.http.saves).toHaveLength(1)
  omit=false;await f.click('回读已保存规则权限')
  expect(f.rules.hasPendingSavedRowPermissions).toBe(false);expect(f.http.saves).toHaveLength(1)
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
  expect(f.rules.getEditingRow('R1')?.['rule_name']).toBe('opening draft')
 })
 it('never saves or discards a staged replacement row with the old dialog identity',async()=>{
  const f=await fixture();f.rules.discardEditingRows(['R1']);await f.rules.refresh();await flushPromises()
  await f.rules.editRowById('R1',{rule_name:'replacement staged'});await flushPromises()
  await f.click('保存')
  expect(f.http.saves).toEqual([])
  expect(f.rules.dirtyTracking.hasPendingChanges('R1')).toBe(true)
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='放弃本条待提交修改')).toBe(false)
 })
 it('uses the service enum semantics for forms and retains the original legal export scope when switching shape types',async()=>{
  const f=await fixture({rule_type:' pivot ',config_json:'{"executionScope":" export ","groupFields":["code"],"keyField":"key","valueField":"value","columns":{"x":"amount"}}'})
  expect(f.wrapper.text()).not.toContain('规则类型无效')
  const select=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='rule_type')
  if(!select)throw Error('Missing rule type selector')
  select.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue','UNPIVOT');await flushPromises()
  expect(JSON.parse(String(f.rules.getEditingRow('R1')?.['config_json']))['executionScope']).toBe(' export ')
 })
 it('saves its own rule even when another confirmed creation is still awaiting a permission read',async()=>{
  const f=await fixture();let omit=true
  f.http.interceptors.request.use({onRequest:request=>{
   if(omit&&request.url==='/api/DataOperation/GetData'&&JSON.stringify(request.data).includes('"R3"'))request.data=JSON.parse(JSON.stringify(request.data).replaceAll('"R3"','"ABSENT"'))
   return request
  }})
  await f.rules.addRowWithIdentity({field:'id',value:'R3'},{rule_name:'other creation',rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:30,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{}'})
  expect((await f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['R3']}]})).success).toBe(true)
  expect(f.rules.hasPendingSavedRowPermissions).toBe(true);omit=false;await flushPromises()
  f.rules.updateEditingValue('R1','rule_name','must be submitted')
  expect(f.wrapper.findAllComponents(RendererButton).some(button=>button.props('label')==='保存')).toBe(true)
  await f.click('保存')
  expect(f.http.saves.flatMap(save=>save.changed).some(row=>row['id']==='R1'&&row['rule_name']==='must be submitted')).toBe(true)
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
 })
 it('cancels to the opening overlay after the list cursor moves and leaves R2 intact',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','rule_name','dialog draft');f.rules.setCurrentRowById('R2');f.rules.updateEditingValue('R2','rule_name','other draft')
  await f.click('取消')
  expect(f.rules.getEditingRow('R1')?.['rule_name']).toBe('opening draft')
  expect(f.rules.getEditingRow('R2')?.['rule_name']).toBe('other draft')
  expect(f.http.saves).toEqual([])
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
 })
 it('saves only its original ID while preserving unknown configuration and another invalid draft',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','rule_name','saved name');f.rules.updateEditingValue('R2','config_json','{bad');f.rules.setCurrentRowById('R2')
  await f.click('保存')
  expect(f.http.saves).toHaveLength(1)
  expect(f.http.saves[0]?.changed).toEqual([{id:'R1',rule_name:'saved name'}])
  expect(f.rules.getEditingRow('R2')?.['config_json']).toBe('{bad')
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
 })
 it('changes type through the original fields and cancels the whole group to the opening overlay',async()=>{
  const f=await fixture()
  const select=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='rule_type')
  if(!select)throw Error('Missing rule type selector')
  select.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue','COMPUTE');await flushPromises()
  expect(f.rules.getEditingRow('R1')).toMatchObject({rule_type:'COMPUTE',source_field:'',target_field:'code',phase:'OLD',description:'保留'})
  expect(JSON.parse(String(f.rules.getEditingRow('R1')?.['config_json']))).toMatchObject({executionScope:'IMPORT',writePolicy:'ALWAYS_OVERRIDE'})
  await f.click('取消')
  expect(f.rules.getEditingRow('R1')).toMatchObject({rule_type:'TRIM',source_field:'code',rule_name:'opening draft'})
  expect(JSON.parse(String(f.rules.getEditingRow('R1')?.['config_json']))).toEqual({executionScope:'IMPORT',extension:false})
  expect(f.http.saves).toEqual([])
 })
 it('preserves a legal export direction only when switching between pivot and unpivot',async()=>{
  const f=await fixture({rule_type:'PIVOT',config_json:'{"executionScope":"EXPORT","groupFields":["code"],"keyField":"key","valueField":"value","columns":{"x":"amount"}}'})
  const select=f.wrapper.findAllComponents(FieldSelect).find(field=>field.props('field')==='rule_type')
  if(!select)throw Error('Missing rule type selector')
  select.getComponent({name:'ElSelect'}).vm.$emit('update:modelValue','UNPIVOT');await flushPromises()
  expect(JSON.parse(String(f.rules.getEditingRow('R1')?.['config_json']))).toMatchObject({executionScope:'EXPORT',columns:[{sourceField:'',key:''}]})
  expect(f.rules.getEditingRow('R1')).toMatchObject({source_field:'',target_field:'',phase:'OLD'})
 })
 it('closes a stale session without restoring its old checkpoint onto a replacement with the same ID',async()=>{
  const f=await fixture();f.rules.discardEditingRows(['R1']);await f.rules.refresh();await flushPromises()
  f.rules.updateEditingValue('R1','rule_name','replacement draft')
  await f.click('取消')
  expect(f.rules.getEditingRow('R1')?.['rule_name']).toBe('replacement draft')
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
  expect(f.http.saves).toEqual([])
 })
 it('verifies a lost receipt through the original capture without dispatching the write twice',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','rule_name','saved once');f.http.failAfterWrite=true
  await f.click('保存')
  expect(f.http.saves).toHaveLength(1)
  expect(f.rules.hasUnconfirmedSave).toBe(true)
  await f.click('取消')
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toBeUndefined()
  await f.click('核验原保存结果')
  expect(f.http.saves).toHaveLength(1)
  expect(f.rules.hasUnconfirmedSave).toBe(false)
  expect(f.wrapper.getComponent(RuleDialog).emitted('close')).toHaveLength(1)
 })
})
