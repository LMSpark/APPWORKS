import {afterEach, describe, expect, it} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
const fixtures: ReturnType<typeof dataSpacePageFixture>[]=[]
afterEach(()=>fixtures.splice(0).forEach(f=>f.dispose()))
async function setup(options:Parameters<typeof dataSpacePageFixture>[0]={}){
  const f=dataSpacePageFixture({allowArrayEdit:true,sourceFields:[
    {rowid:'F1',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',description:'名称',Order:1,IsOutput:1,IsPKey:0},
    {rowid:'F2',dataModelId:'M1',Name:'count',type:'dataModel',FieldType:'number',description:'数量',Order:2,IsOutput:1,IsPKey:0},
  ],...options});fixtures.push(f)
  f.setModelValues({Type:'数组',items:' [{"name":"first","count":2,"active":false}] '})
  const session=await f.open('A');return{f,session,owner:session.getModelEdit('M1'),writes:()=>f.requests.filter(r=>r.url?.includes('BatchTableOperate'))}
}
describe('array model items persistence',()=>{
  it('uses formal headers and saves typed JSON through the model query, with fresh reopen',async()=>{
    const {f,session,owner,writes}=await setup()
    expect(owner.readArray().headers.map(h=>[h.name,h.label])).toEqual([['name','名称'],['count','数量']])
    const next='[{"name":"changed","count":3,"active":false,"nested":{"n":null}}]'
    owner.stage('items',next);await owner.save()
    expect(writes()).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel')?.getEditingRow('M1')?.['items']).toBe(next)
    const fresh=await f.open('A');expect(fresh.getModelEdit('M1').read().fields.find(f=>f.name==='items')?.value).toBe(next)
  })
  it('keeps malformed original text while saving an unrelated description, but rejects invalid new arrays',async()=>{
    const {f,owner,session,writes}=await setup()
    f.setModelValues({items:'[broken'});await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer();await owner.reload(false)
    owner.stage('description','still editable');await owner.save()
    expect(session.metadataDataSet.getView('Base_DataModel')?.rows.find(r=>r['rowid']==='M1')?.['items']).toBe('[broken')
    for(const bad of ['{}','[1]','[null]','[[]]','[new-broken'])expect(()=>owner.stage('items',bad)).toThrow()
    expect(writes()).toHaveLength(1)
  })
  it('does not grant array writes to other model types or a readonly formal field',async()=>{
    const {f,owner,session,writes}=await setup({readOnly:true})
    expect(owner.readArray().writable).toBe(false);expect(()=>owner.stage('items','[]')).toThrow('不可写')
    f.setModelValues({Type:'数据库表'});await session.metadataDataSet.getView('Base_DataModel')!.loadFromServer()
    expect(()=>owner.readArray()).toThrow();expect(writes()).toHaveLength(0)
  })
  it('retains uncertain writes for readback without replay and supports local discard',async()=>{
    const {f,owner,writes}=await setup()
    owner.stage('items','[]');owner.discard();expect(owner.getState().pending).toBe(false)
    owner.stage('items','[]');f.loseNextResponse();await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown');await expect(owner.save()).rejects.toThrow()
    await owner.reload(true);expect(owner.getState().status).toBe('idle');expect(writes()).toHaveLength(1)
  })
})
