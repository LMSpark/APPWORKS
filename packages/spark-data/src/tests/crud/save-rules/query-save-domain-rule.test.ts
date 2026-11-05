import {describe,it,expect,vi} from 'vitest'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSet} from '../../../dataset'
import {DataView} from '../../../data-view'
import type {DataTableQuerySaveRule,DataTableQuerySaveRuleGroup,DataTableQuerySaveReferences,DataTableQueryReferenceChange} from '../../../data-table'
import type {DataRow} from '../../../types'
async function fixture(options:Readonly<{layoutType?:string;declaredPk?:boolean;omitted?:string;undefinedChanges?:'clear';newRowsNeedAdd?:boolean}>={}){
 const layoutType=options.layoutType??'string'
 const ds=DataSet.fromJson({scenarioId:'S',tables:{Items:{modelBinding:{modelId:'M',modelName:'Items'},columns:[{name:'id',type:'string',isPrimaryKey:options.declaredPk??true},{name:'layout',type:layoutType},{name:'kind',type:'string'},{name:'name',type:'string'}],views:{default:{commitMode:'staged'}}}}})
 const view=ds.getView('Items')!,stored:DataRow[]=[{id:'1',layout:'ok',kind:'flat',name:'first'},{id:'2',layout:'ok',kind:'flat',name:'second'}],masked=new Set<string>()
 if(options.omitted!==undefined)for(const row of stored)Reflect.deleteProperty(row,options.omitted)
 let writes=0,pending=false,failAfterWrite=false,allowAdd=true
 const denied=new Set<unknown>()
 const query=()=>({...(options.undefinedChanges===undefined?{}:{undefinedChanges:options.undefinedChanges}),rows:structuredClone(stored),total:stored.length,assertIdentity:()=>{},rowKey:(row:DataRow)=>row['id'],prepareNewRow:(row:DataRow)=>({...row,id:'TEMP'}),
 fieldAccess:(key:unknown,field:string)=>({read:masked.has(field)?'masked' as const:'visible' as const,write:denied.has(key)?'denied' as const:'allowed' as const,component:denied.has(key)?'readonly' as const:'editable' as const,required:false,writeMode:denied.has(key)?'readonly' as const:'editable' as const}),readFieldAccess:(_row:unknown,field:string)=>masked.has(field)?'masked' as const:'visible' as const,
 addActionState:(available=true)=>!allowAdd?'hidden' as const:available?'enabled' as const:'disabled' as const,editActionState:(key:unknown)=>options.newRowsNeedAdd&&(!stored.some(row=>row['id']===key)||denied.has(key))?'hidden' as const:'enabled' as const,deleteActionState:()=>'enabled' as const,createChildActionState:()=>'enabled' as const,viewActionState:()=>'enabled' as const})
 type Command=Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0]
 const owner={executeQuery:async()=>query(),hasUnconfirmedSave:()=>pending,save:vi.fn(async(command:Command)=>{
  if(!pending){writes++;for(const change of command.changes)for(const row of change.changes.changed??[]){const original=stored.find(item=>item['id']===row['id']);Object.assign(original??{},Object.fromEntries(Object.entries(row).map(([field,value])=>[field,value===undefined&&options.undefinedChanges==='clear'?null:value])))}
   for(const change of command.changes){for(const row of change.changes.added??[])stored.push(structuredClone(row));for(const row of change.changes.deleted??[]){const index=stored.findIndex(item=>item['id']===row['id']);if(index>=0)stored.splice(index,1)}}
   if(failAfterWrite){pending=true;failAfterWrite=false;throw Error('ack lost')}}
  pending=false
  return command.changes.map(change=>({metaName:'Items',added:change.changes.added??[],deleted:change.changes.deleted??[],changed:change.changes.changed??[],changedFields:(change.changes.changed??[]).map(row=>Object.keys(row).filter(field=>field!=='id')),context:query()}))
 })}
 view.bindQueryExecutor(owner);await view.refresh()
 return {ds,view,stored,owner,masked,denied,setAllowAdd:(value:boolean)=>{allowAdd=value},writes:()=>writes,loseNextAck:()=>{failAfterWrite=true}}
}
describe('DataTable instance query save rule',()=>{
 it('rejects sparse groups and invalid callbacks without replacing the current registration',async()=>{
  const f=await fixture()
  try{
   const table=f.view.dataTable!;table.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined}]});const original=table.querySaveRule
   expect(()=>table.setQuerySaveRule({groups:new Array<DataTableQuerySaveRuleGroup>(1)})).toThrow('规则组')
   expect(table.querySaveRule).toBe(original)
   const invalid={fields:['layout'],validate:()=>undefined};Reflect.set(invalid,'validate',undefined)
   expect(()=>table.setQuerySaveRule({groups:[invalid]})).toThrow('规则组');expect(table.querySaveRule).toBe(original)
   const invalidReference={fields:['layout'],triggerFields:['layout'],validate:async()=>{}};Reflect.set(invalidReference,'validate',undefined)
   expect(()=>table.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:invalidReference}]})).toThrow('引用');expect(table.querySaveRule).toBe(original)
  }finally{f.ds.destroy()}
 })
 it('checks declaration order even when named views encounter the second group first',async()=>{
  const f=await fixture(),order:string[]=[]
  try{
   f.view.dataTable!.setQuerySaveRule({groups:['layout','name'].map(field=>({fields:[field],validate:()=>undefined,references:{fields:[field],triggerFields:[field],validate:async()=>{order.push(field)}}}))})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','name','first view');other.updateEditingValue('2','layout','second view')
   expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).success).toBe(true)
   expect(order).toEqual(['layout','name'])
  }finally{f.ds.destroy()}
 })
 it('copies and freezes every group atomically without replacing a valid registration on failure',async()=>{
  const f=await fixture(),group={fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],operations:['update' as const],validate:vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})}},rule={groups:[group]}
  try{
   const table=f.view.dataTable!;table.setQuerySaveRule(rule);const registered=table.querySaveRule!
   expect(registered.groups[0]).not.toBe(group)
   for(const value of [registered,registered.groups,registered.groups[0],registered.groups[0]!.fields,registered.groups[0]!.references,registered.groups[0]!.references!.fields,registered.groups[0]!.references!.triggerFields,registered.groups[0]!.references!.operations])expect(Object.isFrozen(value)).toBe(true)
   group.fields.push('name');group.references.fields.push('name');group.references.triggerFields.push('name');rule.groups.push(group)
   expect(registered.groups).toHaveLength(1);expect(registered.groups[0]!.fields).toEqual(['layout'])
   expect(()=>table.setQuerySaveRule({groups:[{fields:['name'],validate:()=>undefined},{fields:['missing'],validate:()=>undefined}]})).toThrow('业务字段')
   expect(table.querySaveRule).toBe(registered)
   expect(()=>table.setQuerySaveRule({groups:[]})).toThrow('非空规则组');expect(table.querySaveRule).toBe(registered)
   f.view.updateEditingValue('1','layout','valid');expect((await f.ds.saveChanges()).success).toBe(true)
   expect(group.references.validate).toHaveBeenCalledOnce()
  }finally{f.ds.destroy()}
 })
 it('does not merge identical caller groups registered on different DataTable instances',async()=>{
  const f=await fixture(),other=f.ds.addTableFromJson({...f.view.dataTable!.toJson(),tableName:'Other',modelBinding:{modelId:'M2',modelName:'Other'}}).getView('default')!
  let checked=0
  const reference=vi.fn<DataTableQuerySaveReferences['validate']>(async input=>{expect(input.changes).toHaveLength(1);if(++checked===2)throw Error('isolated second table')})
  const shared={fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate:reference}}
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[shared]});other.dataTable!.setQuerySaveRule({groups:[shared]})
   expect(f.view.dataTable!.querySaveRule!.groups[0]).not.toBe(other.dataTable!.querySaveRule!.groups[0])
   other.bindQueryExecutor(f.owner);await other.refresh()
   await f.view.editRowById('1',{layout:'first'});await other.editRowById('2',{layout:'second'})
   await expect(DataView.saveQueryViews([{view:f.view,ids:['1']},{view:other,ids:['2']}])).rejects.toThrow('isolated second table')
   expect(reference).toHaveBeenCalledTimes(2);expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('merges named views separately for each group and applies neither view when the second group rejects',async()=>{
  const f=await fixture(),first=vi.fn<DataTableQuerySaveReferences['validate']>(async input=>{expect(input.changes).toHaveLength(2)}),second=vi.fn<DataTableQuerySaveReferences['validate']>(async input=>{expect(input.changes).toHaveLength(2);throw Error('second group rejected')})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate:first}},{fields:['name'],validate:()=>undefined,references:{fields:['name'],triggerFields:['name'],validate:second}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   for(const [view,id]of [[f.view,'1'],[other,'2']] as const){view.updateEditingValue(id,'layout','new');view.updateEditingValue(id,'name','new')}
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('second group rejected')
   expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce();expect(f.writes()).toBe(0)
   expect(f.view.rows[0]?.['layout']).toBe('ok');expect(other.rows[1]?.['layout']).toBe('ok')
   expect(f.view.hasEditingChanges()).toBe(true);expect(other.hasEditingChanges()).toBe(true)
  }finally{f.ds.destroy()}
 })
 it.each([['layout','name'],['name','layout']])('projects only the changed independent rule group: %s with unreadable %s',async(field,unreadable)=>{
  const f=await fixture(),checks=[vi.fn(()=>undefined),vi.fn(()=>undefined)],references=[vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{}),vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})]
  try{
   f.view.dataTable!.setQuerySaveRule({groups:['layout','name'].map((field,index)=>({fields:[field],validate:checks[index]!,references:{fields:[field],triggerFields:[field],operations:['update'],validate:references[index]!}}))})
   f.masked.add(unreadable);f.view.updateEditingValue('1',field,'changed')
   expect((await f.ds.saveChanges()).success).toBe(true)
   const active=field==='layout'?0:1,inactive=1-active
   expect(checks[active]).toHaveBeenCalled();expect(checks[inactive]).not.toHaveBeenCalled()
   expect(references[active]).toHaveBeenCalledOnce();expect(references[inactive]).not.toHaveBeenCalled()
   expect(Object.keys(references[active]!.mock.calls[0]![0].changes[0].values)).toEqual([field])
   expect(f.writes()).toBe(1)
  }finally{f.ds.destroy()}
 })
 it('checks both independent groups before the same capture can write',async()=>{
  const f=await fixture(),first=vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{}),second=vi.fn(async()=>{throw Error('second group rejected')})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate:first}},{fields:['name'],validate:()=>undefined,references:{fields:['name'],triggerFields:['name'],validate:second}}]})
   f.view.updateEditingValue('1','layout','new layout');f.view.updateEditingValue('1','name','new name')
   await expect(f.ds.saveChanges()).rejects.toThrow('second group rejected')
   expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce();expect(f.writes()).toBe(0)
   expect(f.view.getEditingRow('1')).toMatchObject({layout:'new layout',name:'new name'})
  }finally{f.ds.destroy()}
 })
 it('recovers one original unknown capture without rerunning either rule group',async()=>{
  const f=await fixture(),checks=[vi.fn(()=>undefined),vi.fn(()=>undefined)],references=[vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{}),vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})]
  try{
   f.view.dataTable!.setQuerySaveRule({groups:['layout','name'].map((field,index)=>({fields:[field],validate:checks[index]!,references:{fields:[field],triggerFields:[field],validate:references[index]!}}))})
   f.view.updateEditingValue('1','layout','new layout');f.view.updateEditingValue('1','name','new name');f.loseNextAck()
   await expect(f.ds.saveChanges()).rejects.toThrow('ack lost');expect(f.view.hasUnconfirmedSave).toBe(true)
   const calls=checks.map(check=>check.mock.calls.length)
   expect((await f.ds.saveChanges({applyEditingRows:false})).success).toBe(true)
   expect(f.writes()).toBe(1);expect(f.view.hasUnconfirmedSave).toBe(false)
   expect(checks.map(check=>check.mock.calls.length)).toEqual(calls)
   for(const reference of references)expect(reference).toHaveBeenCalledOnce()
   expect(f.stored[0]).toMatchObject({layout:'new layout',name:'new name'})
  }finally{f.ds.destroy()}
 })
 it('excludes undeclared operations before reading reference dependencies while retaining native delete authorization',async()=>{
  const f=await fixture(),references=vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],operations:['create','update'],validate:references}}]})
   f.masked.add('layout');await f.view.removeRow('1')
   expect((await f.ds.saveChanges()).success).toBe(true)
   expect(references).not.toHaveBeenCalled();expect(f.writes()).toBe(1)
   expect(f.stored.map(row=>row['id'])).toEqual(['2'])
  }finally{f.ds.destroy()}
 })
 it.each(['abandon','failure'])('preserves later unknown ownership during earlier verification: %s',async mode=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve})
  const makeOwner=(pause:boolean)=>{
   let pending=false
   return {...f.owner,hasUnconfirmedSave:()=>pending,abandonUnconfirmedSave:()=>{pending=false},save:vi.fn(async(...args:Parameters<typeof f.owner.save>)=>{
    if(!pending){await f.owner.save(...args);pending=true;throw Error('ack lost')}
    if(pause)await waiting
    if(pause&&mode==='failure')throw Error('verify failed')
    pending=false;return f.owner.save(...args)
   })}
  }
  const first=makeOwner(true),second=makeOwner(false)
  const ds=DataSet.fromJson({scenarioId:'S',tables:{Items:{modelBinding:{modelId:'M',modelName:'Items'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'layout',type:'string'}],views:{default:{commitMode:'staged'},other:{commitMode:'staged'}}}}})
  try{
   const view=ds.getView('Items')!,other=ds.getView('Items','other')!
   view.bindQueryExecutor(first);await view.refresh()
   other.bindQueryExecutor(second);await other.refresh()
   await view.editRowById('1',{layout:'first'});await other.editRowById('2',{layout:'second'})
   await expect(view.saveChanges(['1'])).rejects.toThrow('ack lost')
   let originalFailure:Error|undefined
   try{await other.saveChanges(['2'])}catch(cause){if(cause instanceof Error)originalFailure=cause;else throw cause}
   expect(originalFailure?.message).toBe('ack lost')
   const saving=DataView.saveQueryViews([{view,ids:['1']},{view:other,ids:['2']}])
   const rejected=expect(saving).rejects.toThrow(mode==='abandon'?'DATA_VIEW_SAVE_RECOVERY':'verify failed')
   await vi.waitFor(()=>expect(first.save).toHaveBeenCalledTimes(2))
   if(mode==='abandon')expect(other.abandonUnconfirmedSave()).toBe(true)
   release();await rejected
   expect(second.save).toHaveBeenCalledTimes(1)
   if(mode==='failure'){
    expect(other.hasUnconfirmedSaveFor(['2'],originalFailure)).toBe(true)
    expect(other.mutatingError).toBe(originalFailure)
   }
  }finally{release();ds.destroy();f.ds.destroy()}
 })
 it('preserves the checked independent dispatch order when the caller reverses its target array during validation',async()=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve})
  const validate=vi.fn(async()=>{await waiting})
  try{
   Object.assign(f.owner,{saveIndependently:true})
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   await f.view.editRowById('1',{layout:'release'});await other.editRowById('2',{layout:'claim'})
   const targets=[{view:f.view,ids:['1']},{view:other,ids:['2']}]
   const saving=DataView.saveQueryViews(targets)
   await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(1));targets.reverse();release();await saving
   expect(f.owner.save.mock.calls.map(([command])=>command.changes.flatMap(change=>(change.changes.changed??[]).map(row=>row['id'])))).toEqual([['1'],['2']])
  }finally{release();f.ds.destroy()}
 })
 it.each([2,3])('rejects an unsafe cumulative prefix across %s independently confirmed requests',async count=>{
  const f=await fixture()
  const validate=vi.fn(async(input:Readonly<{changes:readonly DataTableQueryReferenceChange[]}>)=>{
   const values=input.changes.map(change=>change.values)
   const first=values.find(row=>row['kind']==='producer')?.['layout']??'a'
   const third=values.find(row=>row['kind']==='other producer')?.['layout']??'c'
   const consumer=values.find(row=>row['kind']==='consumer')?.['layout']??'b'
   if(!['b',first,third].includes(consumer))throw Error('consumer loses its producer in a confirmed prefix')
  })
  try{
   f.stored[0]!['layout']='a';f.stored[0]!['kind']='producer';f.stored[1]!['layout']='b';f.stored[1]!['kind']='consumer'
   if(count===3)f.stored.push({id:'3',layout:'c',kind:'other producer',name:'third'})
   await f.view.refresh();Object.assign(f.owner,{saveIndependently:true})
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   const third=f.view.createQueryView('third');third.commitMode='staged';await third.refresh()
   f.view.updateEditingValue('1','layout','d');other.updateEditingValue('2','layout','a')
   const views=[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]
   if(count===3){third.updateEditingValue('3','layout','a');views.push({tableName:'Items',viewId:'third',ids:['3']})}
   await expect(f.ds.saveChanges({views})).rejects.toThrow('confirmed prefix')
   expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('a');expect(other.rows[1]?.['layout']).toBe('b')
  }finally{f.ds.destroy()}
 })
 it('uses the original add permission only for a live pending creation, then returns to the acknowledged edit permission',async()=>{
  const f=await fixture({newRowsNeedAdd:true})
  try{
   await f.view.addRow({layout:'ok',kind:'flat'});const row=f.view.rows.find(row=>row['id']==='TEMP');if(!row)throw Error('missing local creation')
   expect(f.view.editActionState(row)).toBe('enabled')
   f.setAllowAdd(false);expect(f.view.editActionState(row)).toBe('hidden');expect(f.view.editActionState(f.view.rows[0]??null)).toBe('enabled')
   f.setAllowAdd(true);f.denied.add('TEMP');expect((await f.ds.saveChanges()).success).toBe(true)
   const accepted=f.view.rows.find(row=>row['id']==='TEMP');if(!accepted)throw Error('missing accepted creation')
   expect(f.view.editActionState(accepted)).toBe('hidden');expect(f.view.fieldAccess(accepted,'layout').write).toBe('denied')
  }finally{f.ds.destroy()}
 })
 it('does not reuse new-draft action permission after the query inputs change',async()=>{
  const f=await fixture({newRowsNeedAdd:true})
  try{
   await f.view.addRow({layout:'ok',kind:'flat'});const row=f.view.rows.find(row=>row['id']==='TEMP');if(!row)throw Error('missing local creation')
   f.view.queryContext={scope:'changed'}
   expect(f.view.editActionState(row)).not.toBe('enabled')
  }finally{f.ds.destroy()}
 })
 it('matches only the complete original unknown scope and its actual failure object without disclosing keys',async()=>{
  const f=await fixture();let failure:Error|undefined
  try{
   f.view.updateEditingValue('1','layout','saved');f.loseNextAck()
   try{await f.ds.saveChanges()}catch(cause){if(cause instanceof Error)failure=cause;else throw cause}
   expect(failure).toBeDefined();expect(f.view.hasUnconfirmedSaveFor(['1'],failure)).toBe(true)
   expect(f.view.hasUnconfirmedSaveFor(['1'],new Error('ack lost'))).toBe(false)
   expect(f.view.hasUnconfirmedSaveFor(['2'])).toBe(false);expect(f.view.hasUnconfirmedSaveFor(['1','2'])).toBe(false);expect(f.view.hasUnconfirmedSaveFor([])).toBe(false)
   expect(f.writes()).toBe(1);expect((await f.ds.saveChanges()).success).toBe(true);expect(f.view.hasUnconfirmedSaveFor(['1'],failure)).toBe(false)
  }finally{f.ds.destroy()}
 })
 it('checks each independent dispatch before applying a jointly valid but individually unsafe change',async()=>{
  const f=await fixture(),validate=vi.fn(async(input:Readonly<{changes:readonly unknown[]}>)=>{if(input.changes.length!==2)throw Error('independent reference rejected')})
  try{
   Object.assign(f.owner,{saveIndependently:true})
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','first');other.updateEditingValue('2','layout','second')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('independent reference rejected')
   expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('ok');expect(other.rows[1]?.['layout']).toBe('ok')
  }finally{f.ds.destroy()}
 })
 it('projects original formal dependency values for a deleted record even after an unsaved staged edit',async()=>{
  const f=await fixture(),validate=vi.fn(async(input:Readonly<{changes:readonly {values:Readonly<Record<string,unknown>>;originalValues?:Readonly<Record<string,unknown>>}[]}>)=>{
   expect(input.changes[0]?.values['layout']).toBe('ok');expect(input.changes[0]?.originalValues?.['layout']).toBe('ok')
  })
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   await f.view.editRowById('1',{layout:'not saved'});await f.view.removeRow('1')
   expect((await f.ds.saveChanges()).success).toBe(true);expect(validate).toHaveBeenCalledTimes(1)
  }finally{f.ds.destroy()}
 })
 it('rejects an undefined original field used only by the reference check',async()=>{
  const f=await fixture(),validate=vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   f.stored[0]!['kind']=undefined;await f.view.refresh();f.view.updateEditingValue('1','layout','new')
   await expect(f.ds.saveChanges()).rejects.toThrow('kind');expect(validate).not.toHaveBeenCalled();expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('does not dispatch the same view twice when two saves overlap during asynchronous model references',async()=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve}),validate=vi.fn(()=>waiting)
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   f.view.updateEditingValue('1','layout','new')
   const first=f.ds.saveChanges(),second=f.ds.saveChanges()
   await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(2));release()
   const results=await Promise.allSettled([first,second]);expect(results.some(result=>result.status==='fulfilled')).toBe(true)
   expect(f.writes()).toBe(1)
  }finally{release();f.ds.destroy()}
 })
 it.each(['view','static'] as const)('applies model references to the direct %s save entry',async entry=>{
  const f=await fixture(),validate=vi.fn(async()=>{throw Error('direct reference rejected')})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   await f.view.editRowById('1',{layout:'new'})
   await expect(entry==='view'?f.view.saveChanges(['1']):DataView.saveQueryViews([{view:f.view,ids:['1']}])).rejects.toThrow('direct reference rejected')
   expect(validate).toHaveBeenCalledTimes(1);expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('does not run replacement references while recovering the original unknown capture',async()=>{
  const f=await fixture(),validate=vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   f.view.updateEditingValue('1','layout','accepted');f.loseNextAck()
   await expect(f.ds.saveChanges()).rejects.toThrow('ack lost');expect(f.view.hasUnconfirmedSave).toBe(true)
   const newer=vi.fn(async()=>{throw Error('do not run new references')})
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate:newer}}]})
   expect((await f.ds.saveChanges()).success).toBe(true)
   expect(validate).toHaveBeenCalledTimes(1);expect(newer).not.toHaveBeenCalled();expect(f.writes()).toBe(1)
  }finally{f.ds.destroy()}
 })
 it('does not admit an initially clean selected target that becomes dirty during the reference wait',async()=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve}),validate=vi.fn(()=>waiting)
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','first');const saving=f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})
   await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(1));other.updateEditingValue('2','layout','later');release()
   await expect(saving).rejects.toThrow('STALE');expect(f.writes()).toBe(0)
   expect(f.view.rows[0]?.['layout']).toBe('ok');expect(other.rows[1]?.['layout']).toBe('ok')
  }finally{release();f.ds.destroy()}
 })
 it('does not reuse a validated batch when its second target changes while the first overlay is applied',async()=>{
  const f=await fixture(),validate=vi.fn<DataTableQuerySaveReferences['validate']>(async()=>{})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','first');other.updateEditingValue('2','layout','second')
   const apply=f.view.applyEditingRows.bind(f.view)
   vi.spyOn(f.view,'applyEditingRows').mockImplementation(async ids=>{const result=await apply(ids);other.updateEditingValue('2','layout','changed while applying');return result})
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('STALE')
   expect(validate).toHaveBeenCalledTimes(1);expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('awaits one model reference batch before applying any selected view',async()=>{
  const f=await fixture(),validate=vi.fn(async()=>{throw Error('reference rejected')})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','good');other.updateEditingValue('2','layout','bad')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('reference rejected')
   expect(validate).toHaveBeenCalledTimes(1);expect(f.writes()).toBe(0)
   expect(f.view.rows[0]?.['layout']).toBe('ok');expect(other.rows[1]?.['layout']).toBe('ok')
  }finally{f.ds.destroy()}
 })
 it('rejects dependency edits made while model references are awaiting and preserves the original overlay',async()=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve}),validate=vi.fn(()=>waiting)
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   f.view.updateEditingValue('1','layout','first');const saving=f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']}]})
   await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(1));f.view.updateEditingValue('1','layout','later');release()
   await expect(saving).rejects.toThrow(/STALE|变化/)
   expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('ok');expect(f.view.getEditingRow('1')?.['layout']).toBe('later')
  }finally{release();f.ds.destroy()}
 })
 it('rechecks reference-only readability after awaiting before applying edits',async()=>{
  const f=await fixture();let release=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve}),validate=vi.fn(()=>waiting)
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   f.view.updateEditingValue('1','layout','first');const saving=f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']}]})
   await vi.waitFor(()=>expect(validate).toHaveBeenCalledTimes(1));f.masked.add('kind');release()
   await expect(saving).rejects.toThrow('kind');expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('ok')
  }finally{release();f.ds.destroy()}
 })
 it('projects one update and one delete across named views without exposing keys or credentials',async()=>{
  const f=await fixture(),validate=vi.fn(async(input:unknown)=>{
   if(!isRecord(input)||!Array.isArray(input['changes']))throw Error('missing batch')
   const rows=input['changes'];expect(rows.map(row=>row['kind'])).toEqual(['update','delete'])
   for(const row of rows){expect(Object.keys(row).sort()).toEqual(['changedFields','kind','matchesKey','originalValues','values']);expect(Object.keys(row['values']).sort()).toEqual(['kind','layout']);expect(typeof row['matchesKey']).toBe('function')}
   expect(rows[0]['matchesKey']('1')).toBe(true);expect(rows[0]['matchesKey']('2')).toBe(false);expect(rows[1]['matchesKey']('2')).toBe(true)
  })
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined,references:{fields:['layout','kind'],triggerFields:['layout'],validate}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','new');await other.removeRow('2')
   expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).success).toBe(true)
   expect(validate).toHaveBeenCalledTimes(1);expect(f.writes()).toBe(1);expect(f.stored.map(row=>row['id'])).toEqual(['1'])
  }finally{f.ds.destroy()}
 })
 it('validates exact ids and original editing overlay without scanning another dirty row',async()=>{
  const f=await fixture(),calls:unknown[]=[]
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate:input=>{calls.push(input);if(input.values['layout']==='bad')throw Error('bad layout');return undefined}}]})
   f.view.updateEditingValue('1','layout','good');f.view.updateEditingValue('2','layout','bad')
   expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']}]})).success).toBe(true)
   expect(f.writes()).toBe(1);expect(f.view.getEditingRow('2')?.['layout']).toBe('bad')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['2']}]})).rejects.toThrow('bad layout')
   expect(f.writes()).toBe(1);expect(f.view.rows.find(row=>row['id']==='2')?.['layout']).toBe('ok')
   expect(calls.length).toBeGreaterThan(0)
  }finally{f.ds.destroy()}
 })
 it('ignores unchanged dependencies and gives the callback only detached declared values',async()=>{
  const f=await fixture(),check=vi.fn((input:Parameters<DataTableQuerySaveRuleGroup['validate']>[0])=>{expect(Object.keys(input.values).sort()).toEqual(['kind','layout']);expect(input.changedFields).toEqual(['layout']);expect(input.created).toBe(false);return undefined})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate:check}]})
   f.view.updateEditingValue('1','name','rename');expect((await f.ds.saveChanges()).success).toBe(true);expect(check).not.toHaveBeenCalled()
   f.view.updateEditingValue('1','layout','new');expect((await f.ds.saveChanges()).success).toBe(true);expect(check).toHaveBeenCalled()
  }finally{f.ds.destroy()}
 })
 it('covers a cloned named view and rejects an unreadable dependency before a write',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate:()=>undefined}]})
   const clone=f.view.createQueryView('other');clone.commitMode='staged';await clone.refresh();f.masked.add('kind')
   clone.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'other',ids:['1']}]})).rejects.toThrow('kind')
   expect(f.writes()).toBe(0)
  }finally{f.ds.destroy()}
 })
 it('does not replay a new rule or a new draft while verifying the original unknown capture',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:()=>undefined}]});f.view.updateEditingValue('1','layout','accepted');f.loseNextAck()
   await expect(f.ds.saveChanges()).rejects.toThrow('ack lost');expect(f.view.hasUnconfirmedSave).toBe(true);expect(f.writes()).toBe(1)
   const rejected=vi.fn(()=>{throw Error('new rule must not run')});f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:rejected}]})
   expect((await f.ds.saveChanges()).success).toBe(true);expect(rejected).not.toHaveBeenCalled();expect(f.writes()).toBe(1)
   f.view.updateEditingValue('1','layout','later');await expect(f.ds.saveChanges()).rejects.toThrow('new rule must not run');expect(f.writes()).toBe(1)
  }finally{f.ds.destroy()}
 })
 it('preflights all selected views before applying any valid editing overlay',async()=>{
  const f=await fixture()
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:input=>{if(input.values['layout']==='bad')throw Error('bad layout');return undefined}}]})
   const other=f.view.createQueryView('other');other.commitMode='staged';await other.refresh()
   f.view.updateEditingValue('1','layout','good');other.updateEditingValue('2','layout','bad')
   await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:['1']},{tableName:'Items',viewId:'other',ids:['2']}]})).rejects.toThrow('bad layout')
   expect(f.writes()).toBe(0);expect(f.view.rows[0]?.['layout']).toBe('ok');expect(f.view.getEditingRow('1')?.['layout']).toBe('good')
  }finally{f.ds.destroy()}
 })
 it('does not validate or apply an excluded editing buffer',async()=>{
  const f=await fixture(),validate=vi.fn(()=>{throw Error('excluded overlay')})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate}]});f.view.updateEditingValue('1','layout','bad');expect((await f.ds.saveChanges({applyEditingRows:false})).success).toBe(true);expect(validate).not.toHaveBeenCalled();expect(f.writes()).toBe(0);expect(f.view.getEditingRow('1')?.['layout']).toBe('bad')}finally{f.ds.destroy()}
 })
 it('isolates nested JSON callback values and never serializes the runtime rule',async()=>{
  const f=await fixture({layoutType:'json'})
  try{
   f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate:input=>{const value=input.values['layout'];if(!isRecord(value)||!isRecord(value['nested']))throw Error('expected nested JSON');value['nested']['n']=99;return undefined}}]})
   f.view.updateEditingValue('1','layout',{nested:{n:1}});expect((await f.ds.saveChanges()).success).toBe(true);expect(f.stored[0]?.['layout']).toEqual({nested:{n:1}})
   const restored=DataSet.fromJson(f.ds.toJson());try{expect(restored.getView('Items')?.dataTable?.querySaveRule).toBeUndefined()}finally{restored.destroy()}
  }finally{f.ds.destroy()}
 })
 it('rejects undeclared, internal, primary and duplicate dependencies',async()=>{
  const f=await fixture()
  try{for(const fields of [['missing'],['_pk'],['id'],['lingma_sys_key'],['layout','layout'],[]])expect(()=>f.view.dataTable!.setQuerySaveRule({groups:[{fields,validate:()=>undefined}]})).toThrow('业务字段')}finally{f.ds.destroy()}
 })

 it('rejects a fallback id dependency even when the column was not marked as primary',async()=>{
  const f=await fixture({declaredPk:false})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['id','layout'],validate:()=>undefined}]});f.view.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges()).rejects.toThrow('身份');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('rejects a named view primary-key override in the declared dependency projection',async()=>{
  const f=await fixture()
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['name','layout'],validate:()=>undefined}]});const other=f.view.createQueryView('other');other.primaryKey='name';other.commitMode='staged';await other.refresh();other.updateEditingValue('first','layout','new');await expect(f.ds.saveChanges({views:[{tableName:'Items',viewId:'other'}]})).rejects.toThrow('身份');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('does not equate a visible but omitted dependency with a returned empty value',async()=>{
  const f=await fixture({omitted:'layout'})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate:()=>undefined}]});f.view.updateEditingValue('1','kind','tree');await expect(f.ds.saveChanges()).rejects.toThrow('未返回');expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })
 it('rejects an asynchronous JS callback without leaving its rejection unhandled',async()=>{
  const f=await fixture(),rule:DataTableQuerySaveRule={groups:[{fields:['layout'],validate:()=>undefined}]}
  Reflect.set(rule.groups[0]!,'validate',async()=>{throw Error('async rejection')})
  try{f.view.dataTable!.setQuerySaveRule(rule);f.view.updateEditingValue('1','layout','new');await expect(f.ds.saveChanges()).rejects.toThrow('同步');await new Promise(resolve=>setTimeout(resolve,0));expect(f.writes()).toBe(0)}finally{f.ds.destroy()}
 })

 it('accepts explicit undefined clearing only when the original owner declares clear semantics',async()=>{
  const f=await fixture({undefinedChanges:'clear'}),validate=vi.fn((input:Parameters<DataTableQuerySaveRuleGroup['validate']>[0])=>{expect(input.created).toBe(false);expect(input.values['layout']).toBeUndefined();expect(input.changedFields).toEqual(['layout']);return undefined})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate}]});f.view.updateEditingValue('1','layout',undefined);expect((await f.ds.saveChanges()).success).toBe(true);expect(validate).toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored[0]?.['layout']).toBeNull()}finally{f.ds.destroy()}
 })
 it('accepts an omitted nullable dependency on an explicitly created row',async()=>{
  const f=await fixture(),validate=vi.fn((input:Parameters<DataTableQuerySaveRuleGroup['validate']>[0])=>{expect(input.created).toBe(true);expect(input.values).toEqual({layout:undefined,kind:'flat'});return undefined})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout','kind'],validate}]});const row=await f.view.addRow({kind:'flat',name:'new'}),id=f.view.getPkKey(row)!;expect((await f.ds.saveChanges({views:[{tableName:'Items',viewId:'default',ids:[id]}]})).success).toBe(true);expect(validate).toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored).toHaveLength(3)}finally{f.ds.destroy()}
 })

 it('does not apply value-edit rules to an explicitly authorized deletion',async()=>{
  const f=await fixture(),validate=vi.fn(()=>{throw Error('deleted row must not be revalidated')})
  try{f.view.dataTable!.setQuerySaveRule({groups:[{fields:['layout'],validate}]});await f.view.removeRow('1');expect((await f.ds.saveChanges()).success).toBe(true);expect(validate).not.toHaveBeenCalled();expect(f.writes()).toBe(1);expect(f.stored.map(row=>row['id'])).toEqual(['2'])}finally{f.ds.destroy()}
 })

})
