import { describe, expect, it } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { PageRuntime } from '../src/page/runtime-page'
import { PageTool } from '../src/page/page-tool'
function tool():PageTool { const result=new PageTool({pageId:'shared'});result.markLoaded();return result }
function data(scenarioId:string):DataSet { return DataSet.fromJson({dataSetName:scenarioId,scenarioId,tables:{}}) }
describe('PageRuntime lifecycle',()=>{
  it('keeps an opaque layout draft dirty and rejects config reload', async()=>{
    const runtime=new PageRuntime({tool:tool(),scenarioIds:['design'],loadScenario:async id=>data(id)})
    await runtime.load()
    const content=runtime.getContent('design@DS-1')
    content.acceptRead(null)
    content.setDraft('{"graphVersion":1,"nodes":[],"edges":[]}')
    expect(runtime.isDirty).toBe(true)
    await expect(runtime.reload()).rejects.toThrow('PAGE_RUNTIME_DIRTY')
    expect(runtime.getContent('design@DS-1')).toBe(content)
    content.discardDraft()
    expect(runtime.isDirty).toBe(false)
    runtime.dispose()
  })
  it('settles a host write after a renderer leaves and preserves an unknown result', async()=>{
    const runtime=new PageRuntime({tool:tool(),scenarioIds:['design'],loadScenario:async id=>data(id)})
    await runtime.load()
    const content=runtime.getContent('design@DS-1')
    content.acceptRead('old')
    content.setDraft('new')
    let complete:(value:void)=>void=()=>{}
    const pending=content.startWrite({kind:'save',submitted:'new',expectedContent:'old',
      run:()=>new Promise<void>(resolve=>{complete=resolve})})
    expect(content.status).toBe('pending')
    expect(runtime.isDirty).toBe(true)
    complete()
    await pending
    expect(content.baseline).toBe('new')
    expect(content.draft).toBeUndefined()
    expect(runtime.isDirty).toBe(false)
    content.setDraft('old')
    await expect(content.startWrite({kind:'save',submitted:'old',expectedContent:'new',
      run:async()=>{throw new Error('unknown')}})).rejects.toThrow('unknown')
    expect(content.status).toBe('unknown')
    expect(runtime.isDirty).toBe(true)
    runtime.dispose()
  })
  it('keeps unknown dirty even when text equals the old baseline and ignores settlement after disposal', async()=>{
    const runtime=new PageRuntime({tool:tool(),scenarioIds:['design'],loadScenario:async id=>data(id)})
    await runtime.load()
    const content=runtime.getContent('design@DS-1')
    content.acceptRead('old')
    await expect(content.startWrite({kind:'save',submitted:'old',expectedContent:'old',
      run:async()=>{throw new Error('result unknown')}})).rejects.toThrow('result unknown')
    expect(content.isDirty).toBe(true)
    await expect(runtime.reload()).rejects.toThrow('PAGE_RUNTIME_DIRTY')
    const remote=content.offerRemote('old',content.revision)
    content.adoptRemote(remote,remote.revision)
    expect(runtime.isDirty).toBe(false)
    let finish:(value:void)=>void=()=>{}
    const pending=content.startWrite({kind:'save',submitted:'new',expectedContent:'old',
      run:()=>new Promise<void>(resolve=>{finish=resolve})})
    runtime.dispose()
    finish()
    await pending
    expect(content.baseline).toBe('old')
  })
  it('isolates datasets for two calls of the same shared tool',async()=>{const shared=tool();const a=new PageRuntime({tool:shared,scenarioIds:['a'],loadScenario:async id=>data(id)});const b=new PageRuntime({tool:shared,scenarioIds:['a'],loadScenario:async id=>data(id)});await Promise.all([a.load(),b.load()]);expect(a.instanceId).not.toBe(b.instanceId);expect(a.getDataSet('a')).not.toBe(b.getDataSet('a'));a.dispose();expect(b.getDataSet('a')?.destroyed).toBe(false);b.dispose()})
  it('loads multiple declared scenarios and never defaults local binding to the first',async()=>{const runtime=new PageRuntime({tool:tool(),scenarioIds:['a','b'],loadScenario:async id=>data(id)});await runtime.load();expect(runtime.getDataSet('a')?.scenarioId).toBe('a');expect(runtime.getDataSet('b')?.scenarioId).toBe('b');expect(()=>runtime.resolveView('Orders@default')).toThrow('主场景');expect(runtime.resolveView('#b@Orders@default')).toBeUndefined();expect(()=>runtime.resolveView('#c@Orders@default')).toThrow('未声明');runtime.dispose()})
  it('invalidates loading and destroys late scenario data after disposal',async()=>{let resolve:(ds:DataSet)=>void=()=>{};const runtime=new PageRuntime({tool:tool(),scenarioIds:['a'],loadScenario:()=>new Promise(res=>{resolve=res})});const loading=runtime.load();const rejection=expect(loading).rejects.toThrow('DESTROYED');runtime.dispose();const ds=data('a');resolve(ds);await rejection;expect(ds.destroyed).toBe(true);expect(runtime.generation).toBe(2)})
  it('destroys successful siblings when any declared scenario fails',async()=>{const ds=data('a');const runtime=new PageRuntime({tool:tool(),scenarioIds:['a','b'],loadScenario:async id=>{if(id==='b')throw new Error('missing scene');return ds}});await expect(runtime.load()).rejects.toThrow('missing scene');expect(ds.destroyed).toBe(true);expect(runtime.isLoaded).toBe(false)})
  it('rejects wrong scenario assembly and duplicate call declarations',async()=>{const ds=data('wrong');const runtime=new PageRuntime({tool:tool(),scenarioIds:['a'],loadScenario:async()=>ds});await expect(runtime.load()).rejects.toThrow('身份');expect(ds.destroyed).toBe(true);expect(()=>new PageRuntime({tool:tool(),scenarioIds:['a','a'],loadScenario:async id=>data(id)})).toThrow('重复')})
  it('materializes local bindings against the explicit main scene without mutating the tool',async()=>{
    const shared=tool();shared.setFileText('rule.json',JSON.stringify([{id:'grid',type:'table',props:{dataViewKey:'Orders@default'}}]))
    const ds=DataSet.fromJson({dataSetName:'scene',scenarioId:'scene',tables:{Orders:{tableName:'Orders',columns:[{name:'id',type:'number',isPrimaryKey:true},{name:'name',type:'string'}],views:{default:{rows:[{id:1,name:'Original'}]}}}}})
    const runtime=new PageRuntime({tool:shared,scenarioIds:['scene'],mainScenarioId:'scene',loadScenario:async()=>ds});await runtime.load()
    expect(JSON.stringify(runtime.materialize().rule)).toContain('#scene@Orders@default');expect(shared.getFileText('rule.json')).not.toContain('#scene')
    ds.getView('Orders','default')!.updateEditingValue(1,'name','Draft');expect(runtime.isDirty).toBe(true)
    runtime.markConfigPending();await expect(runtime.reload()).rejects.toThrow('PAGE_RUNTIME_DIRTY');expect(runtime.configPending).toBe(true);expect(ds.destroyed).toBe(false)
    runtime.dispose()
  })
  it('rejects a definition whose declared scene has no bound view',async()=>{
    const shared=tool();shared.setFileText('rule.json',JSON.stringify([{id:'grid',type:'table',props:{dataViewKey:'#scene@Missing@default'}}]))
    const runtime=new PageRuntime({tool:shared,scenarioIds:['scene'],loadScenario:async()=>data('scene')});await runtime.load();expect(()=>runtime.materialize()).toThrow('视图不存在');runtime.dispose()
  })

  it('keeps call identity while refreshing pending configuration and destroys the old scene',async()=>{
    const sets:DataSet[]=[];const runtime=new PageRuntime({tool:tool(),scenarioIds:['a'],loadScenario:async id=>{const ds=data(id);sets.push(ds);return ds}})
    await runtime.load();const identity=runtime.instanceId;runtime.markConfigPending();expect(runtime.configPending).toBe(true)
    await runtime.reload();expect(runtime.instanceId).toBe(identity);expect(sets[0]?.destroyed).toBe(true);expect(runtime.getDataSet('a')).toBe(sets[1]);expect(runtime.configPending).toBe(false);runtime.dispose()
  })
  it('does not let a late invalidated load clear the refreshed dataset',async()=>{
    let complete:(ds:DataSet)=>void=()=>{};let calls=0;const current=data('a');const runtime=new PageRuntime({tool:tool(),scenarioIds:['a'],loadScenario:async()=>++calls===1?new Promise(resolve=>{complete=resolve}):current})
    const old=runtime.load();const rejected=expect(old).rejects.toThrow('STALE');await runtime.reload();const late=data('a');complete(late);await rejected
    expect(late.destroyed).toBe(true);expect(runtime.getDataSet('a')).toBe(current);expect(current.destroyed).toBe(false);runtime.dispose()
  })

})
