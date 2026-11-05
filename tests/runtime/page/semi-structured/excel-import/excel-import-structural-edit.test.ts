import {afterEach, expect, it, vi} from 'vitest'
import {ExcelConfigurationEdit} from '@/lowcode/resources/semi-structured/excel-import/configuration-edit'
import {assertExcelFieldRemoval} from '@/lowcode/resources/semi-structured/excel-import/edit-references'
import {excelDesignRuntime} from './excel-import-design.fixture'
const disposers:Array<()=>void>=[]
afterEach(()=>disposers.splice(0).forEach(dispose=>dispose()))
async function fixture(parentField=''){
 const f=await excelDesignRuntime({Base_ImportData_Config:[{rowid:'P',schemeid:'E1',pid:'E1',sheetName:'父',sheet_layout_json:null,foreignKeyField:'',foreignKeyFieldDesc:''},{rowid:'C',schemeid:'E1',pid:'P',sheetName:'子',parentField,parentFieldDesc:parentField?'父编码':''}],Base_ImportData_Field:[{rowid:'PF',configid:'P',name:'code',title:'父编码',type:0,index:'A'},{rowid:'CF',configid:'C',name:'code',title:'子编码',type:0,index:'B'}],Base_Import_Transform_Rule:[],ImportExportMethods:[]},'E1','P')
 disposers.push(()=>f.runtime.dispose())
 const command=(tableName:'Base_ImportData_Config'|'Base_ImportData_Field')=>ExcelConfigurationEdit.pending({dataSet:f.ds,nodeId:'P',tableName,assertCurrent:()=>{}})
 return {...f,command}
}
it('rechecks a late saved child reference before dispatching an already staged field deletion',async()=>{
 const f=await fixture()
 await assertExcelFieldRemoval({dataSet:f.ds,nodeId:'P',ids:['PF'],assertCurrent:()=>{}})
 await f.fields.removeRow('PF')
 f.http.records['Base_ImportData_Config']![1]!['parentField']='code'
 const command=f.command('Base_ImportData_Field')
 await expect(command.save()).rejects.toThrow('引用')
 expect(f.http.saves).toEqual([]);expect(f.fields.dirtyTracking.pendingDeleteIds.has('PF')).toBe(true)
 command.cancel();expect(f.fields.rows[0]?.['rowid']).toBe('PF')
})
it('does not treat an unsubmitted child unlink as a formal reference removal or include its draft',async()=>{
 const f=await fixture('code')
 f.nodes.updateEditingValue('C','parentField','');f.nodes.updateEditingValue('C','parentFieldDesc','')
 await f.fields.removeRow('PF')
 await expect(f.command('Base_ImportData_Field').save()).rejects.toThrow('引用')
 expect(f.nodes.getEditingRow('C')?.['parentField']).toBe('');expect(f.http.saves).toEqual([])
})
it('saves an explicit unlink on a noncurrent node before deleting the parent mapping in a separate batch',async()=>{
 const f=await fixture('code')
 f.nodes.updateEditingValue('C','parentField','');f.nodes.updateEditingValue('C','parentFieldDesc','')
 await f.command('Base_ImportData_Config').save()
 expect(f.http.records['Base_ImportData_Config']![1]!['parentField']).toBe('')
 await f.fields.removeRow('PF');await f.command('Base_ImportData_Field').save()
 expect(f.http.saves.map(save=>save.table)).toEqual(['Base_ImportData_Config','Base_ImportData_Field'])
 expect(f.http.records['Base_ImportData_Field']!.map(row=>row['rowid'])).toEqual(['CF'])
})
it('checks every dirty node and rejects same-name candidates owned by another node',async()=>{
 const f=await fixture()
 f.nodes.updateEditingValue('P','foreignKeyField','code');f.nodes.updateEditingValue('P','foreignKeyFieldDesc','父编码')
 f.nodes.updateEditingValue('C','parentField','code');f.nodes.updateEditingValue('C','parentFieldDesc','子编码')
 await expect(f.command('Base_ImportData_Config').save()).rejects.toThrow('标题')
 expect(f.http.saves).toEqual([])
})
it('allows a new child to reference a saved parent mapping without demanding a formal new node first',async()=>{
 const f=await fixture()
 await f.nodes.addRow({sheetName:'新子表',pid:'P',parentField:'code',parentFieldDesc:'父编码'})
 await f.command('Base_ImportData_Config').save()
 expect(f.http.records['Base_ImportData_Config']!.find(row=>row['sheetName']==='新子表')).toMatchObject({pid:'P',parentField:'code',parentFieldDesc:'父编码'})
})
it('clears a stale association without demanding that its old mapping still exists',async()=>{
 const f=await fixture('missing')
 f.nodes.updateEditingValue('C','parentField','');f.nodes.updateEditingValue('C','parentFieldDesc','')
 await f.command('Base_ImportData_Config').save()
 expect(f.http.records['Base_ImportData_Config']![1]).toMatchObject({parentField:'',parentFieldDesc:''})
})
it('verifies the original deletion capture without replaying or starting a new dependency scan after reply loss',async()=>{
 const f=await fixture();await f.fields.removeRow('PF');const command=f.command('Base_ImportData_Field');f.http.failAfterWrite=true
 await expect(command.save()).rejects.toThrow();const writes=f.http.saves.length,reads=f.http.reads.length
 f.http.records['Base_ImportData_Config']![1]!['parentField']='code'
 await command.save()
 expect(command.getState().done).toBe(true);expect(f.http.saves).toHaveLength(writes)
 expect(f.http.reads.slice(reads).some(read=>read.table==='Base_ImportData_Config')).toBe(false)
})

it('queries complete mapping options through the shared API without inventing an id field on rowid models',async()=>{
 const f=await fixture()
 await expect(f.fields.queryOptionRows({fields:['rowid','name'],filter:{field:'configid',operator:'eq',value:'P'}})).resolves.toEqual([{rowid:'PF',name:'code'}])
})

it('keeps the default flat query free of synthetic tree identifiers when refreshed through an auxiliary view',async()=>{
 const f=await fixture(), query=f.fields.createQueryView('flatDefault')
 try{query.treeMode='flat';await query.refresh();expect(query.loadingError).toBeNull();expect(query.rows.map(row=>row['rowid'])).toEqual(['PF','CF'])}
 finally{query.dataTable?.destroyView(query.viewId)}
})

it('narrows a retried structural batch to still changed IDs inside its original scope',async()=>{
 const f=await fixture()
 f.nodes.updateEditingValue('P','foreignKeyField','code');f.nodes.updateEditingValue('P','foreignKeyFieldDesc','父编码')
 f.nodes.updateEditingValue('C','parentField','code');f.nodes.updateEditingValue('C','parentFieldDesc','错误标题')
 const command=f.command('Base_ImportData_Config');await expect(command.save()).rejects.toThrow('标题')
 f.nodes.updateEditingValue('P','foreignKeyField','');f.nodes.updateEditingValue('P','foreignKeyFieldDesc','')
 f.nodes.updateEditingValue('C','parentFieldDesc','父编码')
 await command.save()
 expect(command.getState().done).toBe(true);expect(f.http.saves).toHaveLength(1)
 expect(f.http.saves[0]?.changed.map(row=>row['rowid'])).toEqual(['C'])
})
it('finishes a fully reverted preflight failure with no write and no invalid receipt',async()=>{
 const f=await fixture()
 f.nodes.updateEditingValue('C','parentField','code');f.nodes.updateEditingValue('C','parentFieldDesc','错误标题')
 const command=f.command('Base_ImportData_Config');await expect(command.save()).rejects.toThrow('标题')
 f.nodes.updateEditingValue('C','parentField','');f.nodes.updateEditingValue('C','parentFieldDesc','')
 await command.save();expect(command.getState().done).toBe(true);expect(f.http.saves).toEqual([])
})
it('refuses a direct new-row rewrite arriving while its saved parent mapping is being checked',async()=>{
 const f=await fixture(),row=await f.nodes.addRow({sheetName:'新子表',pid:'P',parentField:'code',parentFieldDesc:'父编码'}),id=f.nodes.getPkKey(row)!
 let entered=false,release:()=>void=()=>{}
 const gate=new Promise<void>(resolve=>{release=resolve})
 f.http.interceptors.request.use({onRequest:async request=>{if(!entered&&JSON.stringify(request.data).includes('Base_ImportData_Field')){entered=true;await gate}return request}})
 const command=f.command('Base_ImportData_Config'),save=command.save()
 await vi.waitFor(()=>expect(entered).toBe(true))
 await f.nodes.editRowById(id,{parentField:'missing',parentFieldDesc:'X'})
 release();await expect(save).rejects.toThrow('草稿');expect(f.http.saves).toEqual([])
})

it('saves ordinary mapping titles without running association dependency queries',async()=>{
 const f=await fixture();f.fields.updateEditingValue('PF','title','新标题')
 expect(ExcelConfigurationEdit.hasStructuralChanges(f.fields)).toBe(false)
 const reads=f.http.reads.length
 expect((await f.ds.saveChanges({views:[{tableName:'Base_ImportData_Field',viewId:'default'}]})).success).toBe(true)
 expect(f.http.reads.slice(reads).some(read=>read.table==='Base_ImportData_Config')).toBe(false)
})
it('validates changed desensitization references through the existing column option query',async()=>{
 const f=await fixture();f.fields.updateEditingValue('PF','DesenID','MISSING')
 await expect(f.ds.saveChanges({views:[{tableName:'Base_ImportData_Field',viewId:'default'}]})).rejects.toThrow('DesenID')
 expect(f.http.saves).toEqual([])
 f.http.records['Base_Desensitization_Rule']=[{rowid:'D1',name:'脱敏规则'}];f.fields.updateEditingValue('PF','DesenID','D1')
 expect((await f.ds.saveChanges({views:[{tableName:'Base_ImportData_Field',viewId:'default'}]})).success).toBe(true)
 expect(f.http.records['Base_ImportData_Field']![0]!['DesenID']).toBe('D1')
})
