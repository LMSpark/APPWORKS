import {describe,expect,it} from 'vitest'
import {workspaceFixture} from './workspace-fixture'
describe('initialization workspace native date and candidate lifecycle',()=>{
  it('owns one resource view, binds date parameters to a native input view and reopens without rebinding owners',async()=>{
    const {workspace,calls}=await workspaceFixture()
    const first=workspace.view
    await workspace.open()
    expect(workspace.date).toMatchObject({visible:true,format:'YYYYMM',value:'202611'})
    expect(calls).toEqual([{date:'202611'}])
    expect(workspace.inputs.getEditingRow('INPUT')).toMatchObject({date:'202611',range:'001-999'})
    expect(workspace.view.rows[0]).toMatchObject({prefix:'A202611',InitVal:'005',recordId:'OLD'})
    await workspace.open();expect(workspace.view).toBe(first)
    expect(calls).toHaveLength(2)
  })
  it('clears a clean prior result before changing date and rejects changes while candidate edits are pending',async()=>{
    const {workspace,calls}=await workspaceFixture();await workspace.open()
    const key=workspace.view.getPkKey(workspace.view.rows[0]!)!
    workspace.view.updateEditingValue(key,'InitVal','007')
    expect(()=>workspace.beforeDateChange()).toThrow()
    expect(workspace.inputs.getEditingRow('INPUT')?.['date']).toBe('202611')
    workspace.cancel();workspace.beforeDateChange();workspace.inputs.updateEditingValue('INPUT','date','202612')
    await workspace.reload()
    expect(calls.at(-1)).toEqual({date:'202612'})
    expect(workspace.view.rows[0]).toMatchObject({prefix:'A202612',recordId:'',InitVal:'001'})
  })
  it('saves only initialization changes, and requires explicit cancel before closing an edited resource',async()=>{
    const {workspace,service}=await workspaceFixture();await workspace.open()
    const key=workspace.view.getPkKey(workspace.view.rows[0]!)!
    workspace.view.updateEditingValue(key,'InitVal','007')
    expect(()=>workspace.assertClose()).toThrow('保存')
    expect((await workspace.save()).success).toBe(true);expect(()=>workspace.assertClose()).not.toThrow()
    expect(service.http.saves.map(save=>save.table)).toEqual(['Base_CodeSerialPerform'])
    expect(service.http.records['Base_CodeSerialPerform']![0]).toMatchObject({Code:'005',NodeDesignId:null})
    expect(workspace.inputs.hasEditingChanges()).toBe(true)
  })
})
