import {describe, expect, it, vi} from 'vitest'
import {queryBlueprintReadonlyView} from '@/views/app/dev-system/blueprint-workspace/blueprint-readonly-info'

function fakeView(resultRows:Record<string,unknown>[]) {
  const view={rows:[] as Record<string,unknown>[],queryColumns:Object.keys(resultRows[0]??{}).map(name=>({name})),filterExpression:undefined as unknown,
    loadingError:undefined as unknown,resetState:vi.fn(()=>{view.rows=[]}),refresh:vi.fn(async()=>{view.rows=resultRows}),
    fieldAccess:(row:Record<string,unknown>,field:string)=>({read:Object.hasOwn(row,field)&&field!=='secret'?'visible':'invisible'})}
  return view
}

describe('blueprint readonly DataView binding',()=>{
  it('filters by current node and returns the same DataView without projecting row arrays',async()=>{
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'history',secret:'hidden'}])
    const runtime={resolveView:vi.fn(()=>view)}
    const result=await queryBlueprintReadonlyView(runtime as never,'scene@Base_Navigation_Desc_Version@default','n1',()=>{})
    expect(result).toBe(view)
    expect(view.filterExpression).toMatchObject({field:'prowid',operator:'eq',value:'n1'})
    expect(view.rows).toHaveLength(1)
    expect(view.resetState).toHaveBeenCalledOnce()
    expect(view.refresh).toHaveBeenCalledOnce()
  })

  it('clears the DataView after a failed query',async()=>{
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'history'}])
    view.refresh.mockRejectedValueOnce(new Error('query failed'))
    const runtime={resolveView:()=>view}
    await expect(queryBlueprintReadonlyView(runtime as never,'scene@Base_Navigation_DataRelation@default','n1',()=>{})).rejects.toThrow('query failed')
    expect(view.rows).toEqual([])
    expect(view.resetState).toHaveBeenCalledTimes(2)
  })

  it('rejects and clears rows outside the requested node or without readable prowid',async()=>{
    const mismatch=fakeView([{rowid:'r1',prowid:'other',title:'wrong node'}])
    await expect(queryBlueprintReadonlyView({resolveView:()=>mismatch} as never,'scene@Base_Navigation_DataRelation@default','n1',()=>{})).rejects.toThrow('身份不匹配')
    expect(mismatch.rows).toEqual([])
    const hidden=fakeView([{rowid:'r2',prowid:'n1',title:'unreadable scope'}])
    hidden.fieldAccess=()=>({read:'invisible'})
    await expect(queryBlueprintReadonlyView({resolveView:()=>hidden} as never,'scene@Base_Navigation_DataRelation@default','n1',()=>{})).rejects.toThrow('不可读')
    expect(hidden.rows).toEqual([])
  })

  it('rejects a response after its project or runtime scope becomes stale',async()=>{
    let finish!:()=>void
    const view=fakeView([{rowid:'h1',prowid:'n1',desc:'late'}])
    view.refresh=vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{view.rows=[{rowid:'h1',prowid:'n1',desc:'late'}];resolve()}}))
    let current=true
    const pending=queryBlueprintReadonlyView({resolveView:()=>view} as never,'scene@Base_Navigation_Desc_Version@default','n1',()=>{if(!current)throw new Error('scope stale')})
    current=false;finish()
    await expect(pending).rejects.toThrow('scope stale')
    expect(view.rows).toEqual([])
  })
})
