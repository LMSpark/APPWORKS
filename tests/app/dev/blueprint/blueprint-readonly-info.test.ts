import {describe, expect, it, vi} from 'vitest'
import {queryBlueprintReadonlyView} from '@/views/app/dev-system/blueprint-workspace/blueprint-readonly-info'

function fakeView(resultRows:Record<string,unknown>[],modelName='Base_Navigation_Desc_Version') {
  const view={rows:[] as Record<string,unknown>[],queryColumns:Object.keys(resultRows[0]??{}).map(name=>({name})),filterExpression:undefined as unknown,
    dataSet:{scenarioId:'scene'},dataTable:{modelBinding:{modelName}},tableName:`internal:${modelName}`,viewId:'default',total:resultRows.length,page:1,pageSize:20,
    loadingError:undefined as unknown,resetState:vi.fn(()=>{view.rows=[]}),refresh:vi.fn(async()=>{view.rows=resultRows}),
    fieldAccess:(row:Record<string,unknown>,field:string)=>({read:Object.hasOwn(row,field)&&field!=='secret'?'visible':'invisible'})}
  return view
}

describe('blueprint readonly DataView binding',()=>{
  it('filters by current node and returns the same DataView without projecting row arrays',async()=>{
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'history',secret:'hidden'}])
    const runtime={resolveView:vi.fn(()=>view)}
    const result=await queryBlueprintReadonlyView({runtime:runtime as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})
    expect(result).toBe(view)
    expect(view.filterExpression).toMatchObject({field:'prowid',operator:'eq',value:'n1'})
    expect(view.rows).toHaveLength(1)
    expect(view.resetState).toHaveBeenCalledOnce()
    expect(view.refresh).toHaveBeenCalledOnce()
  })

  it('clears the DataView after a failed query',async()=>{
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'history'}],'Base_Navigation_DataRelation')
    view.refresh.mockRejectedValueOnce(new Error('query failed'))
    const runtime={resolveView:()=>view}
    await expect(queryBlueprintReadonlyView({runtime:runtime as never,binding:'scene@Base_Navigation_DataRelation@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('query failed')
    expect(view.rows).toEqual([])
    expect(view.resetState).toHaveBeenCalledTimes(2)
  })

  it('rejects and clears rows outside the requested node or without readable prowid',async()=>{
    const mismatch=fakeView([{rowid:'r1',prowid:'other',title:'wrong node'}],'Base_Navigation_DataRelation')
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>mismatch} as never,binding:'scene@Base_Navigation_DataRelation@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('身份不匹配')
    expect(mismatch.rows).toEqual([])
    const hidden=fakeView([{rowid:'r2',prowid:'n1',title:'unreadable scope'}],'Base_Navigation_DataRelation')
    hidden.fieldAccess=()=>({read:'invisible'})
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>hidden} as never,binding:'scene@Base_Navigation_DataRelation@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('不可读')
    expect(hidden.rows).toEqual([])
  })

  it('rejects a response after its project or runtime scope becomes stale',async()=>{
    let finish!:()=>void
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'late'}])
    view.refresh=vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{view.rows=[{rowid:'h1',prowid:'n1',desc:'late'}];resolve()}}))
    let current=true
    const pending=queryBlueprintReadonlyView({runtime:{resolveView:()=>view} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{if(!current)throw new Error('scope stale')}})
    current=false;finish()
    await expect(pending).rejects.toThrow('scope stale')
    expect(view.rows).toEqual([])
  })

  it('requires every row to expose a nonempty unique rowid and the requested readable prowid',async()=>{
    for(const rows of [
      [{prowid:'n1'}],
      [{rowid:'',prowid:'n1'}],
      [{rowid:'r1',prowid:'n1'},{rowid:'r1',prowid:'n1'}],
      [{rowid:'r1',prowid:'n1'},{rowid:'r2',prowid:'other'}],
    ]){
      const view=fakeView(rows)
      if(rows.length===1&&!Object.hasOwn(rows[0]??{},'rowid'))view.fieldAccess=(row,field)=>({read:field==='rowid'?'visible':Object.hasOwn(row,field)?'visible':'invisible'})
      await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>view} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow()
      expect(view.rows).toEqual([])
    }
    const hiddenId=fakeView([{rowid:'r1',prowid:'n1'}])
    hiddenId.fieldAccess=(row,field)=>({read:field==='rowid'?'invisible':Object.hasOwn(row,field)?'visible':'invisible'})
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>hiddenId} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('rowid')
    expect(hiddenId.rows).toEqual([])
  })

  it('accepts finite numeric row identities and preserves their type during uniqueness checks',async()=>{
    const view=fakeView([{rowid:1,prowid:'n1'},{rowid:'1',prowid:'n1'}])
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>view} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).resolves.toBe(view)
    expect(view.rows).toHaveLength(2)
  })

  it('validates the resolved DataView declared scenario, model name and view id against the binding',async()=>{
    const view=fakeView([{rowid:'r1',prowid:'n1'}])
    view.dataSet={scenarioId:'other-scene'}
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>view} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('绑定身份不匹配')
    expect(view.rows).toEqual([])
  })

  it('rejects inconsistent DataView pagination metadata rather than projecting or slicing rows',async()=>{
    const countMismatch=fakeView([{rowid:'r1',prowid:'n1'}]);countMismatch.total=2
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>countMismatch} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('分页结果不一致')
    const pageMismatch=fakeView([{rowid:'r1',prowid:'n1'}]);pageMismatch.page=2
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>pageMismatch} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('分页结果不一致')
    const sizeMismatch=fakeView([{rowid:'r1',prowid:'n1'}]);sizeMismatch.pageSize=0
    await expect(queryBlueprintReadonlyView({runtime:{resolveView:()=>sizeMismatch} as never,binding:'scene@Base_Navigation_Desc_Version@default',nodeId:'n1',assertCurrent:()=>{}})).rejects.toThrow('分页结果不一致')
  })
})
