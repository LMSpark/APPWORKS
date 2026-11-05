import {afterEach, expect, it, vi} from 'vitest'
import {excelDesignRuntime} from './excel-import-design.fixture'
import {ExcelAssociationFields} from '@/lowcode/resources/semi-structured/excel-import/association-fields'
const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach(dispose => dispose()))
async function fixture() {
  const f = await excelDesignRuntime({Base_ImportData_Config: [{rowid:'ROOT',schemeid:'E1',pid:'E1',sheetName:'父'}, {rowid:'CHILD',schemeid:'E1',pid:'ROOT',sheetName:'子'}],Base_ImportData_Field:[{rowid:'P',configid:'ROOT',name:'code',title:'父编码'},{rowid:'C',configid:'CHILD',name:'code',title:'子编码'}],Base_Import_Transform_Rule:[],ImportExportMethods:[]},'E1','CHILD')
  const options = new ExcelAssociationFields(f.ds)
  disposers.push(() => {f.runtime.dispose()})
  await vi.waitFor(() => expect(f.ds.getView('Base_ImportData_Field','parentFields')!.rows).toHaveLength(1))
  return {...f, options}
}
it('uses saved parent and own identities for equal field names and cancels only through the original node view', async () => {
  const f=await fixture()
  f.nodes.updateEditingValue('CHILD','sheetName','其他草稿')
  f.options.select({nodeId:'CHILD',kind:'parentField',value:'code'})
  f.options.select({nodeId:'CHILD',kind:'foreignKeyField',value:'code'})
  expect(f.nodes.getEditingRow('CHILD')).toMatchObject({parentField:'code',parentFieldDesc:'父编码',foreignKeyField:'code',foreignKeyFieldDesc:'子编码',sheetName:'其他草稿'})
  f.options.select({nodeId:'CHILD',kind:'parentField',value:''})
  expect(f.nodes.getEditingRow('CHILD')).toMatchObject({parentField:'',parentFieldDesc:''})
  expect(f.http.saves).toEqual([])
})
it('rejects an old selection action after switching nodes even when the field name exists in both nodes',async()=>{
  const f=await fixture()
  f.nodes.setCurrentRowById('ROOT');f.nodes.setSelectedRows([f.nodes.currentRow!])
  await vi.waitFor(()=>expect(f.ds.getView('Base_ImportData_Field','foreignKeyFields')!.rows[0]?.['rowid']).toBe('P'))
  expect(()=>f.options.select({nodeId:'CHILD',kind:'foreignKeyField',value:'code'})).toThrow('节点')
  expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toEqual([])
})

it('rejects a root or foreign-scheme parent instead of borrowing same-name mapping candidates',async()=>{
  const f=await fixture()
  f.nodes.setCurrentRowById('ROOT');f.nodes.setSelectedRows([f.nodes.currentRow!])
  expect(()=>f.options.select({nodeId:'ROOT',kind:'parentField',value:'code'})).toThrow('可选范围')
  f.http.records['Base_ImportData_Config']!.push({rowid:'FOREIGN',schemeid:'E2',pid:'E2',sheetName:'其他方案父'})
  f.http.records['Base_ImportData_Config']!.find(row=>row['rowid']==='CHILD')!['pid']='FOREIGN'
  f.http.records['Base_ImportData_Field']!.push({rowid:'FOREIGN_FIELD',configid:'FOREIGN',name:'code',title:'其他编码'})
  await f.nodes.refresh();f.nodes.setCurrentRowById('CHILD');f.nodes.setSelectedRows([f.nodes.currentRow!])
  await vi.waitFor(()=>expect(f.ds.getView('Base_ImportData_Config','parentNode')!.rows).toEqual([]))
  expect(()=>f.options.select({nodeId:'CHILD',kind:'parentField',value:'code'})).toThrow('可选范围')
  expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toEqual([])
})
it('does not write either paired member when the formal query denies the description field',async()=>{
  const f=await fixture()
  const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  f.http.interceptors.response.use({onResponse:response=>{
    const body:unknown=response.data
    if(record(body)&&record(body['Result'])&&record(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items']))for(const row of body['Result']['data']['Items']){
      if(record(row)&&row['rowid']==='CHILD'&&Object.hasOwn(row,'parentFieldDesc')&&record(row['lingma_sys_params'])){
        const permissions=row['lingma_sys_params'];if(Array.isArray(permissions['e']))permissions['e']=permissions['e'].filter((field:unknown)=>field!=='parentFieldDesc')
      }
    }
    return response
  }})
  await f.nodes.refresh();f.nodes.setCurrentRowById('CHILD');f.nodes.setSelectedRows([f.nodes.currentRow!])
  await vi.waitFor(()=>expect(f.ds.getView('Base_ImportData_Field','parentFields')!.rows).toHaveLength(1))
  f.nodes.updateEditingValue('CHILD','sheetName','保留其他草稿')
  expect(()=>f.options.select({nodeId:'CHILD',kind:'parentField',value:'code'})).toThrow('不允许成组')
  expect(f.nodes.getEditingRow('CHILD')).toMatchObject({sheetName:'保留其他草稿'})
  expect(f.nodes.getEditingRow('CHILD')?.['parentField']).toBeUndefined();expect(f.http.saves).toEqual([])
})

it('keeps own foreign-key selection independent of a failed parent query',async()=>{
  const f=await fixture(), parent=f.ds.getView('Base_ImportData_Config','parentNode')!
  vi.spyOn(parent,'readSnapshot').mockImplementation(()=>{throw new Error('parent read failed')})
  expect(()=>f.options.select({nodeId:'CHILD',kind:'foreignKeyField',value:'code'})).not.toThrow()
  expect(f.nodes.getEditingRow('CHILD')).toMatchObject({foreignKeyField:'code',foreignKeyFieldDesc:'子编码'})
})
it.each(['name','title'])('never turns a masked mapping %s into a persisted association member',async masked=>{
  const f=await fixture(), source=f.ds.getView('Base_ImportData_Field','parentFields')!
  const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  f.http.interceptors.response.use({onResponse:response=>{
    const body:unknown=response.data
    if(record(body)&&record(body['Result'])&&record(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items']))for(const row of body['Result']['data']['Items'])if(record(row)&&row['configid']==='ROOT'&&record(row['lingma_sys_params']))row['lingma_sys_params']['m']=[masked]
    return response
  }})
  await source.refresh()
  const value=masked==='name'?source.readSnapshot().rows[0]?.['name']:'code'
  expect(()=>f.options.select({nodeId:'CHILD',kind:'parentField',value})).toThrow()
  expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toEqual([])
})
