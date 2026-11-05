import {describe,it,expect,vi} from 'vitest'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSet} from '../../../dataset'
import {DataView} from '../../../data-view'
import type {DataTableQuerySaveRule} from '../../../data-table'
import type {DataRow} from '../../../types'
async function fixture(options:Readonly<{layoutType?:string;declaredPk?:boolean;omitted?:string;undefinedChanges?:'clear'}>={}){
 const layoutType=options.layoutType??'string'
 const ds=DataSet.fromJson({scenarioId:'S',tables:{Items:{modelBinding:{modelId:'M',modelName:'Items'},columns:[{name:'id',type:'string',isPrimaryKey:options.declaredPk??true},{name:'layout',type:layoutType},{name:'kind',type:'string'},{name:'name',type:'string'}],views:{default:{commitMode:'staged'}}}}})
 const view=ds.getView('Items')!,stored:DataRow[]=[{id:'1',layout:'ok',kind:'flat',name:'first'},{id:'2',layout:'ok',kind:'flat',name:'second'}],masked=new Set<string>()
 if(options.omitted!==undefined)for(const row of stored)Reflect.deleteProperty(row,options.omitted)
 let writes=0,pending=false,failAfterWrite=false
 const query=()=>({...(options.undefinedChanges===undefined?{}:{undefinedChanges:options.undefinedChanges}),rows:structuredClone(stored),total:stored.length,assertIdentity:()=>{},rowKey:(row:DataRow)=>row['id'],prepareNewRow:(row:DataRow)=>({...row,id:'TEMP'}),
 fieldAccess:(_key:unknown,field:string)=>({read:masked.has(field)?'masked' as const:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),readFieldAccess:(_row:unknown,field:string)=>masked.has(field)?'masked' as const:'visible' as const,
 addActionState:()=>'enabled' as const,editActionState:()=>'enabled' as const,deleteActionState:()=>'enabled' as const,createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const})
 type Command=Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]
 const owner={executeQuery:async()=>query(),hasUnconfirmedSave:()=>pending,save:vi.fn(async(command:Command)=>{
  if(!pending){writes++;for(const change of command.changes)for(const row of change.changes.changed??[]){const original=stored.find(item=>item['id']===row['id']);Object.assign(original??{},Object.fromEntries(Object.entries(row).map(([field,value])=>[field,value===undefined&&options.undefinedChanges==='clear'?null:value])))}
   for(const change of command.changes){for(const row of change.changes.added??[])stored.push(structuredClone(row));for(const row of change.changes.deleted??[]){const index=stored.findIndex(item=>item['id']===row['id']);if(index>=0)stored.splice(index,1)}}
   if(failAfterWrite){pending=true;failAfterWrite=false;throw Error('ack lost')}}
  pending=false
  return command.changes.map(change=>({metaName:'Items',added:change.changes.added??[],deleted:change.changes.deleted??[],changed:change.changes.changed??[],changedFields:(change.changes.changed??[]).map(row=>Object.keys(row).filter(field=>field!=='id')),context:query()}))
 })}
 view.bindQueryExecutor(owner);await view.refresh()
 return {ds,view,stored,owner,masked,writes:()=>writes,loseNextAck:()=>{failAfterWrite=true}}
}
describe('DataTable instance query save rule',()=>{
 it('validates exact ids and original editing overlay without scanning another dirty row',async()=>{
  const f=await fixture(),calls:unknown[]=[]
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate:input=>{calls.push(input);if(input.values['layout']==='bad')throw Error('bad layout');return undefined}})
   f.view.updateEditingValue('1','layout','good');f.view.updateEditingValue('2','layout','bad')
   expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']}]})).success).toBe(true)
   expect(f.writes()).toBe(1);expect(f.view.getEditingRow('2')?.['layout']).toBe('bad')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['2']}]})).rejects.toThrow('bad layout')
   expect(f.writes()).toBe(1);expect(f.view.rows.find(row=>row['id']==='2')?.['layout']).toBe('ok')
   expect(calls.length).toBeGreaterThan(0)
  }finally{f.ds.destroy()}
 })
 it('ignores unchanged dependencies and gives the callback only detached declared values',async()=>{
  const f=await fixture(),check=vi.fn((input:Parameters<DataTableQuerySaveRule['validate']>[0])=>{expect(Object.keys(input.values).sort()).toEqual(['kind','layout']);expect(input.changedFields).toEqual(['layout']);expect(input.created).toBe(false);return undefined})
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate:check})
   f.view.updateEditingValue('1','name','rename');expect((await f.ds.saveChanges()).success).toBe(true);expect(check).not.toHaveBeenCalled()
   f.view.updateEditingValue('1','layout','new');expect((await f.ds.saveChanges()).success).toBe(true);expect(check).toHaveBeenCalled()
  }finally{f.ds.destroy()}
 })
 it('covers a cloned named view and rejects an unreadable dependency before a write',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate:()=>undefined})
   const clone=f.view.createQueryView('other');clone.commitMode='staged';await clone.refresh();f.masked.add('kind')
   clone.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'other',ids:['1']}]})).rejects.toThrow('kind')
   expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('does not replay a new rule or a new draft while verifying the original unknown capture',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate:()=>undefined});f.view.updateEditingValue('1','layout','accepted');f.loseNextAck()
   await expect(f.ds.saveChanges()).rejects.toThrow('ack lost');expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.writes()).toBe(1)
   const rejected=vi.fn(()=>{throw Error('new rule must not run')});f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate:rejected})
   expect((await f.ds.saveChanges()).success).toBe(true);expect(rejected).not.toHaveBeenCalled();expect(f.writes()).toBe(1)
   f.view.updateEditingValue('1','layout','later');await expect(f.ds.saveChanges()).rejects.toThrow('new rule must not run');expect(f.writes()).toBe(1)
  }finally{f.ds.destroy()}
 })
 it('preflights all selected views before applying any valid editing overlay',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate:input=>{if(input.values['layout']==='bad')throw Error('bad layout');return undefined}})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','good');other.updateEditingValue('2','layout','bad')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('bad layout')
   expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('ok');expect(f.view.getEditingRow('1')?.['layout']).toBe('good')
  }finally{f.ds.destroy()}
 })
 it('does not validate or apply an excluded editing buffer',async()=>{
  const f=await fixture(),validate=vi.fn(()=>{throw Error('excluded overlay')})
  try{f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate});f.view.updateEditingValue('1','layout','bad');expect((await f.ds.saveChanges({applyEditingRows:false})).success).toBe(true);expect(validate).not.toHaveBeenCalled();expect(f.writes()).toBe(0);expect(f.view.getEditingRow('1')?.['layout']).toBe('bad')}finally{f.ds.destroy()}
 })
 it('isolates nested JSON callback values and never serializes the runtime rule',async()=>{
  const f=await fixture({layoutType:'json'})
  try{
   f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate:input=>{const value=input.values['layout'];if(!isRecord(value)||!isRecord(value['nested']))throw Error('expected nested JSON');value['nested']['n']=99;return undefined}})
   f.view.updateEditingValue('1','layout',{nested:{n:1}});expect((await f.ds.saveChanges()).success).toBe(true);expect(f.stored[0]?.['layout']).toEqual({nested:{n:1}})
   const restored=DataSet.fromJson(f.ds.toJson());try{expect(restored.getView('Items')?.dataTable?.querySaveRule).toBeUndefined()}finally{restored.destroy()}
  }finally{f.ds.destroy()}
 })
 it('rejects undeclared, internal, primary and duplicate dependencies',async()=>{
  const f=await fixture()
  try{for(const fields of [['missing'],['_pk'],['id'],['lingma_sys_key'],['layout','layout'],[]])expect(()=>f.view.dataTable!.setQuerySaveRule({fields,validate:()=>undefined})).toThrow('业务字段')}finally{f.ds.destroy()}
 })

 it('rejects a fallback id dependency even when the column was not marked as primary',async()=>{
  const f=await fixture({declaredPk:false})
  try{f.view.dataTable!.setQuerySaveRule({fields:['id','layout'],validate:()=>undefined});f.view.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges()).rejects.toThrow('身份');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('rejects a named view primary-key override in the declared dependency projection',async()=>{
  const f=await fixture()
  try{f.view.dataTable!.setQuerySaveRule({fields:['name','layout'],validate:()=>undefined});const other=f.view.createQueryView('other');other.primaryKey='name';other.commitMode='staged';await other.refresh();other.updateEditingValue('first','layout','new');await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'other'}]})).rejects.toThrow('身份');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('does not equate a visible but omitted dependency with a returned empty value',async()=>{
  const f=await fixture({omitted:'layout'})
  try{f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate:()=>undefined});f.view.updateEditingValue('1','kind','tree');await expect(f.ds.saveChanges()).rejects.toThrow('未返回');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('rejects an asynchronous JS callback without leaving its rejection unhandled',async()=>{
  const f=await fixture(),rule:DataTableQuerySaveRule={fields:['layout'],validate:()=>undefined}
  Reflect.set(rule,'validate',async()=>{throw Error('async rejection')})
  try{f.view.dataTable!.setQuerySaveRule(rule);f.view.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges()).rejects.toThrow('同步');await new Promise(resolve=>setTimeout(resolve,0));expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })

 it('accepts explicit undefined clearing only when the original owner declares clear semantics',async()=>{
  const f=await fixture({undefinedChanges:'clear'}),validate=vi.fn((input:Parameters<DataTableQuerySaveRule['validate']>[0])=>{expect(input.created).toBe(false);expect(input.values['layout']).toBeUndefined();expect(input.changedFields).toEqual(['layout']);return undefined})
  try{f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate});f.view.updateEditingValue('1','layout',undefined);expect((await f.ds.saveChanges()).success).toBe(true);expect(validate).toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored[0]?.['layout']).toBeNull()}finally{f.ds.destroy()}
 })
 it('accepts an omitted nullable dependency on an explicitly created row',async()=>{
  const f=await fixture(),validate=vi.fn((input:Parameters<DataTableQuerySaveRule['validate']>[0])=>{expect(input.created).toBe(true);expect(input.values).toEqual({layout:undefined,kind:'flat'});return undefined})
  try{f.view.dataTable!.setQuerySaveRule({fields:['layout','kind'],validate});const row=await f.view.addRow({kind:'flat',name:'new'}),id=f.view.getPkKey(row)!;expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:[id]}]})).success).toBe(true);expect(validate).toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored).toHaveLength(3)}finally{f.ds.destroy()}
 })

 it('does not apply value-edit rules to an explicitly authorized deletion',async()=>{
  const f=await fixture(),validate=vi.fn(()=>{throw Error('deleted row must not be revalidated')})
  try{f.view.dataTable!.setQuerySaveRule({fields:['layout'],validate});await f.view.removeRow('1');expect((await f.ds.saveChanges()).success).toBe(true);expect(validate).not.toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored.map(row=>row['id'])).toEqual(['2'])}finally{f.ds.destroy()}
 })

})
