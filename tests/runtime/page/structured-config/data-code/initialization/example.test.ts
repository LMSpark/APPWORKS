import {describe,expect,it,vi} from 'vitest'
import {isRecord} from '@spark-appworks/spark-utils'
import {fixture} from './fixture'
import {CodeExampleWorkspace} from '@/lowcode/resources/structured-config/data-code/example-workspace'
import {saveDataCodeDesign} from '@/lowcode/resources/structured-config/data-code/design-ops'

describe('code example through the current native views',()=>{
  it('uses effective sorted nodes, compiles fixed text without altering node drafts and persists only on design save',async()=>{
    const {ds,service}=await fixture(),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    nodes.updateEditingValue('N1','ParameterName','CURRENT')
    const read=vi.fn(async()=> 'CURRENT202611001'),workspace=new CodeExampleWorkspace({dataSet:ds,client:{read}})
    await workspace.refresh()
    expect(read).toHaveBeenCalledWith({busTableId:'T1',nodes:[{NodeNo:1,NodeType:2,CodeNodeDesignJson:'{"ConstString":"CURRENT"}'},{NodeNo:2,NodeType:3,CodeNodeDesignJson:'{"DateFormat":"yyyyMM"}'},{NodeNo:3,NodeType:4,CodeNodeDesignJson:'{"Format":"001-999","StartNo":"1","EndNo":"2","Incre":"2"}'}]})
    expect(main.getEditingRow('C1')?.['CodeExample']).toBe('CURRENT202611001')
    expect(nodes.getEditingRow('N1')?.['CodeNodeDesignJson']).toBe('{"ConstString":"A"}')
    expect(service.http.saves).toEqual([])
    expect(workspace.view.rows).toMatchObject([{id:'C1',value:'CURRENT202611001'}])
    expect(workspace.view.fieldAccess(workspace.view.rows[0]!,'value').write).toBe('denied')
    await saveDataCodeDesign(ds)
    expect(service.http.records['Base_CodeDesign']![0]?.['CodeExample']).toBe('CURRENT202611001')
    expect(service.http.saves.map(save=>save.table).sort()).toEqual(['Base_CodeDesign','Base_CodeNodeDesign'])
  })
  it('cancels the example using the original main view and does not clear unrelated edits',async()=>{
    const {ds,service}=await fixture(),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    nodes.updateEditingValue('N1','ParameterName','KEEP')
    main.updateEditingValue('C1','Name','改名')
    const workspace=new CodeExampleWorkspace({dataSet:ds,client:{read:async()=> 'EXAMPLE'}})
    await workspace.refresh();main.discardPendingChanges(['C1'])
    expect(main.getEditingRow('C1')?.['CodeExample']??main.rows[0]?.['CodeExample']).toBe('A')
    expect(nodes.getEditingRow('N1')?.['ParameterName']).toBe('KEEP')
    expect(service.http.saves).toEqual([])
  })
  it.each(['nodes','example','scope','destroy'])('rejects a late result after %s changes without overwriting the draft',async change=>{
    const {ds}=await fixture(),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    let finish:(value:string)=>void=()=>undefined
    const read=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve})),workspace=new CodeExampleWorkspace({dataSet:ds,client:{read}})
    const pending=workspace.refresh();await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(1))
    if(change==='nodes')nodes.updateEditingValue('N1','ParameterName','NEW')
    if(change==='example')main.updateEditingValue('C1','CodeExample','USER')
    if(change==='scope')main.queryContext={...main.queryContext,applicationId:'OTHER'}
    if(change==='destroy')ds.destroy()
    finish('LATE');await expect(pending).rejects.toThrow()
    if(change!=='destroy')expect(main.getEditingRow('C1')?.['CodeExample']??main.rows[0]?.['CodeExample']).toBe(change==='example'?'USER':'A')
  })
  it('keeps the original example on a service error and retries only on a new explicit refresh',async()=>{
    const {ds}=await fixture(),main=ds.getView('Base_CodeDesign')!
    const read=vi.fn().mockRejectedValueOnce(new Error('业务表数据为空')).mockResolvedValueOnce('NEW')
    const workspace=new CodeExampleWorkspace({dataSet:ds,client:{read}})
    await expect(workspace.refresh()).rejects.toThrow('业务表数据为空')
    expect(main.hasEditingChanges()).toBe(false);expect(read).toHaveBeenCalledTimes(1)
    await workspace.refresh();expect(main.getEditingRow('C1')?.['CodeExample']).toBe('NEW')
  })
  it('requires readable valid owned nodes and an editable result before calling the service',async()=>{
    const {ds}=await fixture(),nodes=ds.getView('Base_CodeNodeDesign')!,read=vi.fn(async()=> 'BAD')
    const workspace=new CodeExampleWorkspace({dataSet:ds,client:{read}})
    nodes.updateEditingValue('N1','NodeNo',null)
    await expect(workspace.refresh()).rejects.toThrow();expect(read).not.toHaveBeenCalled()
    nodes.discardPendingChanges();nodes.updateEditingValue('N1','CodeNodeDesignJson','{invalid')
    await expect(workspace.refresh()).rejects.toThrow();expect(read).not.toHaveBeenCalled()
  })
  it.each(['CodeExample','CodeNodeDesignJson'])('consumes formal %s field restrictions before invoking the function',async field=>{
    const {ds,service}=await fixture(),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    service.http.interceptors.response.use({onResponse:response=>{
      const body:unknown=response.data
      if(isRecord(body)&&isRecord(body['Result'])&&isRecord(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items'])){
        for(const row of body['Result']['data']['Items'])if(isRecord(row)&&isRecord(row['lingma_sys_params'])&&Object.hasOwn(row,field)){
          const permission=row['lingma_sys_params']
          if(field==='CodeExample'&&Array.isArray(permission['e']))permission['e']=permission['e'].filter(value=>value!==field)
          if(field==='CodeNodeDesignJson'){permission['m']=[field];row[field]='***'}
        }
      }
      return response
    }})
    await(field==='CodeExample'?main:nodes).refresh()
    const read=vi.fn(async()=> 'UNAUTHORIZED'),workspace=new CodeExampleWorkspace({dataSet:ds,client:{read}})
    await expect(workspace.refresh()).rejects.toThrow();expect(read).not.toHaveBeenCalled();expect(service.http.saves).toEqual([])
  })
})
