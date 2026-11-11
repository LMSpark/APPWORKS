import {afterEach,expect,it} from 'vitest'
import type {DataSet} from '@spark-appworks/spark-data'
import {cacheDeleteFixture} from './cache-delete.fixture'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
async function fixture(){const f=await cacheDeleteFixture();sets.push(f.ds);return f}
it('stages the original readable key and performs a single native command save',async()=>{
 const f=await fixture();expect(f.list.deleteActionState(f.list.currentRow)).toBe('enabled')
 await f.command.addRow({key:'A'});expect(f.http.deletes).toBe(0)
 await f.save();expect(f.http.deletes).toBe(1);expect(f.command.rows[0]).toMatchObject({key:'A',outcome:'confirmed'});expect(f.http.keys).toEqual(['B'])
})
it.each([
 {keyless:true,allowDelete:true},
 {keyless:false,allowDelete:false},
])('rejects a readable row without a confirmed delete action: %j',async options=>{
 const f=await cacheDeleteFixture(options);sets.push(f.ds)
 expect(f.list.fieldAccess(f.list.currentRow!,'cacheKey').read).toBe('visible')
 expect(f.list.deleteActionState(f.list.currentRow)).not.toBe('enabled')
 await expect(f.command.addRow({key:'A'})).rejects.toThrow('CACHE_DELETE_PERMISSION')
 expect(f.command.rows).toEqual([]);expect(f.http.deletes).toBe(0)
})
it('rechecks delete permission after staging and before dispatch',async()=>{
 const f=await fixture();await f.command.addRow({key:'A'})
 f.list.allowDelete=false
 await expect(f.save()).rejects.toThrow('CACHE_DELETE_PERMISSION')
 expect(f.http.deletes).toBe(0);expect(f.command.hasUnconfirmedSave).toBe(false)
 f.command.discardPendingChanges();expect(f.command.rows).toEqual([])
})
it.each(['selection','refresh','key'] as const)('rejects a changed %s before dispatch without replacing the original intent',async mode=>{
 const f=await fixture();await f.command.addRow({key:'A'})
 if(mode==='selection')f.list.setCurrentRow(f.list.rows[1]!)
 else if(mode==='refresh')await f.list.refresh()
 else f.command.updateEditingValue(String(f.command.rows[0]?.['commandId']),'key','B')
 await expect(f.save()).rejects.toThrow(/CACHE_DELETE|DATA_VIEW_READ_ROW/);expect(f.http.deletes).toBe(0)
})
it('does not adopt a missing capture from the current list selection',async()=>{
 const f=await fixture();await expect(f.binding.submit({commandId:'uncaptured',key:'A'})).rejects.toThrow('CACHE_DELETE_CAPTURE');expect(f.http.deletes).toBe(0)
})
it('does not overwrite a captured command id',async()=>{
 const f=await fixture();await f.command.addRow({commandId:'fixed',key:'A'})
 await expect(f.command.addRow({commandId:'fixed',key:'A'})).rejects.toThrow('CACHE_DELETE');expect(f.command.rows).toHaveLength(1)
 await f.save();expect(f.http.deletes).toBe(1)
})
it('keeps a lost receipt unknown after the source changes and never repeats the command',async()=>{
 const f=await fixture();f.http.lostReceipt=true;await f.command.addRow({key:'A'})
 await expect(f.save()).rejects.toThrow('未知');expect(f.http.deletes).toBe(1)
 await f.list.refresh();f.list.setCurrentRow(f.list.rows[0]!)
 await expect(f.save()).rejects.toThrow('未知');expect(f.http.deletes).toBe(1);expect(f.command.hasUnconfirmedSave).toBe(true)
})
it('cancels only the staged command, makes no service call and permits a new explicit intent',async()=>{
 const f=await fixture(),row=f.list.currentRow;await f.command.addRow({key:'A'})
 f.command.discardPendingChanges();expect(f.command.rows).toEqual([]);expect(f.list.currentRow).toBe(row);expect(f.http.deletes).toBe(0)
 await f.command.refresh();await f.command.addRow({key:'A'});await f.save();expect(f.http.deletes).toBe(1)
})
it('rejects changed query inputs before adopting stale displayed rows into a new intent',async()=>{
 const f=await fixture();f.list.queryContext={prefix:'not-the-loaded-input'}
 await expect(f.command.addRow({key:'A'})).rejects.toThrow();expect(f.command.rows).toEqual([]);expect(f.http.deletes).toBe(0)
})
it('rejects a natively mutated readonly source value before creating a new intent',async()=>{
 const f=await fixture();f.list.rows[0]!['cacheKey']='B'
 await expect(f.command.addRow({key:'B'})).rejects.toThrow();expect(f.command.rows).toEqual([]);expect(f.http.deletes).toBe(0)
})
it.each(['query','value'] as const)('rejects changed source %s after capture and before dispatch',async mode=>{
 const f=await fixture();await f.command.addRow({key:'A'})
 if(mode==='query')f.list.queryContext={prefix:'changed-after-capture'}
 else f.list.rows[0]!['cacheKey']='B'
 await expect(f.save()).rejects.toThrow(/DATA_VIEW_READ_ROW|CACHE_DELETE/)
 expect(f.http.deletes).toBe(0);expect(f.command.hasUnconfirmedSave).toBe(false)
})

it('does not dispatch a prepared sibling after an unknown command is explicitly abandoned',async()=>{
 const f=await fixture()
 const first=await f.command.addRow({key:'A'}),second=await f.command.addRow({key:'A'})
 if(!('commandId'in first)||!('commandId'in second))throw Error('missing command row')
 const saveId=(id:unknown)=>{if(typeof id!=='string')throw Error('missing id');return f.ds.saveChanges({views:[{tableName:'Request',viewId:'default',ids:[id]}]})}
 f.http.lostReceipt=true
 await expect(saveId(first['commandId'])).rejects.toThrow('未知');expect(f.http.deletes).toBe(1)
 f.command.abandonUnconfirmedSave()
 await expect(saveId(second['commandId'])).rejects.toThrow('未知')
 expect(f.command.hasUnconfirmedSaveFor([String(second['commandId'])])).toBe(false)
 f.command.discardPendingChanges([String(second['commandId'])])
 expect(f.command.dirtyTracking.pendingCreateIds.has(String(second['commandId']))).toBe(false)
 await expect(saveId(first['commandId'])).rejects.toThrow('未知')
 expect(f.command.hasUnconfirmedSaveFor([String(first['commandId'])])).toBe(true)
 expect(f.http.deletes).toBe(1)
})

it('keeps a local model command preflight rejection cancellable with zero dispatch',async()=>{
 const f=await fixture();await f.command.addRow({key:'A'})
 f.definition.queryConfig={allPages:true}
 await expect(f.save()).rejects.toThrow('SPARK_MODEL_COMMAND')
 expect(f.http.deletes).toBe(0);expect(f.command.hasUnconfirmedSave).toBe(false)
 f.command.discardPendingChanges();expect(f.command.rows).toEqual([])
})
