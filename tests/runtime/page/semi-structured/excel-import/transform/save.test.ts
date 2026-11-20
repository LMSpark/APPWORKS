import {afterEach,describe,expect,it} from 'vitest'
import {createExcelTransformConfig} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'
import {excelDesignRuntime} from '../excel-import-design.fixture'
const sessions:Awaited<ReturnType<typeof excelDesignRuntime>>[]=[]
afterEach(()=>sessions.splice(0).forEach(f=>f.runtime.dispose()))
const rule={id:'R1',scheme_id:'E1',config_id:'C1',rule_name:'去空白',phase:'ORIGINAL',description:'保留说明',rule_type:'TRIM',source_field:'code',target_field:'code',sort_order:10,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{"executionScope":"IMPORT","keep":false}'}
async function fixture(patch:Record<string,unknown>={}){const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'订单',exportType:'default',sheet_layout_json:'',relatedappid:'APP',table:'db@orders',parentField:'',foreignKeyField:''}],Base_ImportData_Field:[{rowid:'F1',configid:'C1',name:'code',index:'A',isReadOnly:0}],Base_Import_Transform_Rule:[{...rule,...patch},{...rule,id:'R2',sort_order:20}]});sessions.push(f);return f}
const target=(ids:string[])=>({views:[{tableName:'Base_Import_Transform_Rule',viewId:'default',ids}]})
describe('Excel model-owned transformation save validation',()=>{
 it('rejects an invalid edited rule before apply or dispatch and leaves its draft cancellable',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R1','source_field','')
  await expect(f.ds.saveChanges(target(['R1']))).rejects.toThrow('source_field')
  expect(f.http.saves).toEqual([]);expect(f.rules.rows.find(row=>row['id']==='R1')?.['source_field']).toBe('code')
  expect(f.rules.getEditingRow('R1')?.['source_field']).toBe('')
  f.rules.discardEditingRows(['R1']);expect(f.rules.hasEditingChanges()).toBe(false)
 })
 it('validates only the submitted IDs and keeps phase, unknown JSON and another invalid draft intact',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R2','config_json','{bad')
  f.rules.updateEditingValue('R1','config_json','{"executionScope":"IMPORT","keep":false,"extra":0}')
  expect((await f.ds.saveChanges(target(['R1']))).success).toBe(true)
  expect(f.http.saves).toHaveLength(1);expect(f.http.saves[0]?.changed.map(row=>row['id'])).toEqual(['R1'])
  expect(f.http.records['Base_Import_Transform_Rule']![0]).toMatchObject({phase:'ORIGINAL',description:'保留说明',config_json:'{"executionScope":"IMPORT","keep":false,"extra":0}'})
  expect(f.rules.getEditingRow('R2')?.['config_json']).toBe('{bad')
 })
 it('changes only the selected order while preserving nullable stored values instead of filling defaults',async()=>{
  const f=await fixture({enabled:null,on_error:null,sort_order:null,config_json:null})
  f.rules.updateEditingValue('R1','sort_order',30)
  expect((await f.ds.saveChanges(target(['R1']))).success).toBe(true)
  expect(f.http.records['Base_Import_Transform_Rule']![0]).toMatchObject({id:'R1',sort_order:30,enabled:null,on_error:null,config_json:null,phase:'ORIGINAL'})
  expect(Object.keys(f.http.saves[0]!.changed[0]!).sort()).toEqual(['id','sort_order'])
 })

 it('inherits the original scheme and configuration when adding a rule and cancels only the new native id',async()=>{
  const f=await fixture();f.rules.updateEditingValue('R2','rule_name','其他草稿')
  const row=await f.rules.addRow({rule_name:'',rule_type:'TRIM',source_field:'',target_field:'',sort_order:30,enabled:1,on_error:'FAIL_ROW',phase:'',description:'',condition_json:'',config_json:JSON.stringify(createExcelTransformConfig('TRIM'))})
  const id=f.rules.getPkKey(row);expect(typeof id).toBe('string');expect(id).toBeTruthy()
  expect(row).toMatchObject({scheme_id:'E1',config_id:'C1'})
  expect(Object.hasOwn(row,'rowid')).toBe(false)
  expect(f.http.saves).toEqual([])
  f.rules.discardPendingChanges([id!])
  expect(f.rules.rows.some(item=>f.rules.getPkKey(item)===id)).toBe(false)
  expect(f.rules.getEditingRow('R2')?.['rule_name']).toBe('其他草稿')
 })

})
