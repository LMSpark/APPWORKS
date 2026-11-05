import {describe,it,expect} from 'vitest'
import {excelDesignRuntime} from '../excel-import-design.fixture'
const rule=(id:string,type:string,source:string,target:string,order:number)=>({id,scheme_id:'E1',config_id:'C1',rule_name:id,rule_type:type,source_field:source,target_field:target,sort_order:order,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:JSON.stringify({executionScope:'IMPORT',...(type==='DEFAULT'?{value:0}:{})})})
async function fixture(){
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'订单',exportType:'default',sheet_layout_json:'',relatedappid:'APP',table:'db@orders',parentField:'',foreignKeyField:''}],Base_ImportData_Field:[{rowid:'F1',configid:'C1',name:'source',index:'A',isReadOnly:0}],Base_Import_Transform_Rule:[rule('P','DEFAULT','','generated',10),rule('C','TRIM','generated','result',20)]})
 return f
}
describe('Excel model native reference preflight',()=>{
 it('allows removing a terminal non-producing rule without proving unrelated layout inputs',async()=>{
  const f=await fixture()
  try{
   f.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']='{"enabled":true,"version":3}'
   f.http.records['Base_Import_Transform_Rule']!.push({...rule('V','VALIDATE','','',30),config_json:'{"executionScope":"IMPORT","requiredFields":["generated"]}'})
   await f.rules.refresh();await f.rules.removeRow('V')
   expect((await f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['V']}]})).success).toBe(true)
  }finally{f.runtime.dispose()}
 })
 it('rejects a mapping column beyond every supported workbook range before submission',async()=>{
  const f=await fixture()
  try{
   f.http.records['Base_ImportData_Field']!.push({rowid:'F_BAD',configid:'C1',name:'overflow',index:'XFE',isReadOnly:0})
   f.rules.updateEditingValue('C','source_field','overflow')
   await expect(f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['C']}]})).rejects.toThrow('列号')
   expect(f.http.saves).toEqual([])
  }finally{f.runtime.dispose()}
 })
 it('allows deleting a disabled rule without proving unrelated active layout inputs',async()=>{
  const f=await fixture()
  try{
   f.http.records['Base_ImportData_Config']![0]!['sheet_layout_json']='{"enabled":true,"version":3}'
   f.http.records['Base_Import_Transform_Rule']!.push({...rule('D','TRIM','old_missing','old_target',30),enabled:0})
   await f.rules.refresh();await f.rules.removeRow('D')
   expect((await f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['D']}]})).success).toBe(true)
   expect(f.http.saves).toHaveLength(1)
  }finally{f.runtime.dispose()}
 })
 it('blocks deleting a producer before any native submission and preserves its staged deletion',async()=>{
  const f=await fixture()
  try{
   await f.rules.removeRow('P')
   await expect(f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['P']}]})).rejects.toThrow('generated')
   expect(f.http.saves).toEqual([]);expect(f.rules.dirtyTracking.pendingDeleteIds.has('P')).toBe(true)
  }finally{f.runtime.dispose()}
 })
 it('accepts the exact native batch deleting producer and consumer without reading mapping inputs',async()=>{
  const f=await fixture()
  try{
   await f.rules.removeRow('P');await f.rules.removeRow('C')
   const result=await f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['P','C']}]})
   expect(result.success).toBe(true);expect(f.http.saves).toHaveLength(1)
   expect(f.http.records['Base_Import_Transform_Rule']).toEqual([])
  }finally{f.runtime.dispose()}
 })
 it('rejects an updated consumer reading a missing real input and leaves its editing overlay intact',async()=>{
  const f=await fixture()
  try{
   f.rules.updateEditingValue('C','source_field','missing')
   await expect(f.ds.saveChanges({views:[{tableName:f.rules.tableName,viewId:f.rules.viewId,ids:['C']}]})).rejects.toThrow('missing')
   expect(f.http.saves).toEqual([]);expect(f.rules.getEditingRow('C')?.['source_field']).toBe('missing')
  }finally{f.runtime.dispose()}
 })
})
