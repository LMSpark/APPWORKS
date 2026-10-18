import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
const fixtures: ReturnType<typeof dataSpacePageFixture>[]=[]
afterEach(()=>fixtures.splice(0).forEach(f=>f.dispose()))
async function setupForView(options:Parameters<typeof dataSpacePageFixture>[0],fieldViewId:'default'|'modelFields') {
  const f=dataSpacePageFixture({allowArrayEdit:true,allowModelRename:true,formalProjection:true,allowFieldEdit:true,editableFieldProperties:['description','Order'],
    sourceFields:[{rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'id',description:'编码',FieldType:'string',IsPKey:1,IsOutput:1,AsName:'',Expression:'',ValueFun:'',Order:0},
      {rowid:'F2',dataModelId:'M2',type:'dataModel',Name:'reference',FieldType:'计算字段',IsPKey:0,IsOutput:1,ValueFun:'{"Type":"GetTableField","Field":"Orders.id"}'}],...options})
  fixtures.push(f);f.setModelValues({Type:'数组',PrimaryKeyFields:'id',items:'[{"id":"a"}]'})
  const session=await f.open('A')
  if(fieldViewId==='modelFields')await session.loadModelFields('M1')
  const owner=session.getArrayEdit('M1',fieldViewId),view=session.metadataDataSet.getView('Base_DataModel')!
  return{f,session,owner,view,writes:()=>f.requests.filter(r=>r.url?.includes('BatchTableOperate'))}
}
describe.each(['default','modelFields'] as const)('array dialog registered name and definition transaction using %s',fieldViewId=>{
  const setup=(options:Parameters<typeof dataSpacePageFixture>[0]={})=>setupForView(options,fieldViewId)
  it('saves name, values, headers and qualified references in one database batch before updating pagedata',async()=>{
    const {f,session,owner,view,writes}=await setup()
    const save=vi.spyOn(session.metadataDataSet,'saveChanges')
    view.updateEditingValue('M1','Name','LocalOrders');view.updateEditingValue('M1','items','[{"id":"b"}]')
    const draft=owner.beginHeaders();draft.beginHeaders();draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'新编码'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();await owner.save()
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1);expect(session.hasPendingModelEdits()).toBe(false)
    expect(save.mock.calls.some(([options])=>options?.views?.some(selected=>selected.tableName==='DataTableBindingDefinition'))).toBe(true)
    const fresh=await f.open('A'),models=fresh.metadataDataSet.getView('Base_DataModel')!.rows,fields=fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows
    expect(models.find(r=>r['rowid']==='M1')).toMatchObject({Name:'LocalOrders',MetaName:'OrderSource',items:'[{"id":"b"}]'})
    expect(fields.find(r=>r['rowid']==='F1')).toMatchObject({Name:'id',description:'新编码'})
    expect(String(fields.find(r=>r['rowid']==='F2')?.['ValueFun'])).toContain('LocalOrders.id')
    expect(fresh.viewState!.text).toContain('LocalOrders')
    const result=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
    expect((await result.loadFromServer()).success).toBe(true);expect(result.rows).toMatchObject([{id:'b'}])
  })
  it('retains the rename input for cancel and rejects duplicate names without writing any array data',async()=>{
    const {owner,view,writes}=await setup()
    view.updateEditingValue('M1','Name','Customers');view.updateEditingValue('M1','description','changed')
    await expect(owner.save()).rejects.toThrow('已存在');expect(writes()).toHaveLength(0)
    owner.discard();expect(owner.getState().pending).toBe(false);expect(view.getEditingRow('M1')?.['Name']).toBe('Orders')
  })
  it('verifies a lost database receipt then completes original file writes without replaying the batch',async()=>{
    const {owner,f,view,writes}=await setup();view.updateEditingValue('M1','Name','LocalOrders');f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
  })
  it('recovers an unknown scene file receipt without resending the database or confirmed file',async()=>{
    const {owner,f,view,writes,session}=await setup();view.updateEditingValue('M1','Name','LocalOrders');f.loseNextFileResponse()
    await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('configuration')
    expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
    expect(session.hasPendingModelEdits()).toBe(false);expect((await f.open('A')).viewState!.text).toContain('LocalOrders')
  })
  it('checks fresh name permission before sending any changed values',async()=>{
    const {owner,f,view,writes}=await setup();view.updateEditingValue('M1','Name','LocalOrders');view.updateEditingValue('M1','items','[{"id":"b"}]')
    f.denyModelField('Name');await expect(owner.save()).rejects.toThrow(/不可写/)
    expect(writes()).toHaveLength(0);expect(f.fileWrites).toHaveLength(0);expect(owner.getState().status).toBe('idle')
    expect(view.getEditingRow('M1')?.['Name']).toBe('LocalOrders');owner.discard()
  })
  it('retains partial database results for explicit acceptance and does not write files',async()=>{
    const {owner,f,view,writes}=await setup({omitModelProperties:['Name']});view.updateEditingValue('M1','Name','LocalOrders')
    await expect(owner.save()).rejects.toThrow(/回读/);expect(await owner.verify()).toBe(false)
    expect(owner.getState().status).toBe('different');expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    owner.acceptCurrent();expect(owner.getState().pending).toBe(false);expect(f.modelRow().Name).toBe('Orders')
  })
  it('detects old-name references introduced during the write without silently rewriting or claiming completion',async()=>{
    const {owner,f,view,writes}=await setup();view.updateEditingValue('M1','Name','LocalOrders')
    const release=f.holdModelResponse(),saving=owner.save()
    await new Promise(resolve=>setTimeout(resolve,0))
    f.created.set('Base_DataModel_Field',[{rowid:'LATE',dataSetId:'A',dataModelId:'M2',Name:'late',type:'inputParams',ValueFun:'{"Type":"GetTableField","Field":"Orders.id"}'}])
    release();await expect(saving).rejects.toThrow(/回读/);expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification.join()).toContain('LATE');expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
  })
  it('updates bound tool files through their existing owners and resumes after a lost tool receipt',async()=>{
    const files=new Map<string,string>(),saves:string[]=[],pages=['ONE','TWO'];let lose=true
    for(const page of pages){files.set(`${page}/rule.json`,JSON.stringify({type:'r-table',props:{dataViewKey:'A@Orders@shared'}}));files.set(`${page}/script.js`,'');files.set(`${page}/style.css`,'')}
    const {owner,view,writes,f}=await setup({pageFiles:{readPageFile:async command=>{const text=files.get(`${command.pageId}/${command.fileName}`);if(text===undefined)throw new Error('file unavailable');return text},
      saveFileContent:async(id,name,text)=>{files.set(`${id}/${name}`,text);saves.push(`${id}/${name}`);if(lose){lose=false;throw new Error('tool receipt lost')}}},
      blueprint:{loadRoot:async()=>({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:pages.map(id=>({
        nodeId:id,parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:id},source:{},navigation:{target:`cfg:${id}`,title:id,order:0,publishInMenu:true,showChildren:true,beginGroup:false},
      }))})}})
    view.updateEditingValue('M1','Name','LocalOrders');await expect(owner.save()).rejects.toThrow('tool receipt lost')
    expect(owner.getState().status).toBe('configuration');expect(saves).toEqual(['ONE/rule.json']);expect(await owner.verify()).toBe(true)
    expect(saves).toEqual(['ONE/rule.json','TWO/rule.json']);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
    for(const id of pages)expect(JSON.parse(files.get(`${id}/rule.json`)!).props.dataViewKey).toBe('A@LocalOrders@shared')
    const fresh=await f.open('A');expect(fresh.definitionDataSet!.getTable('OrdersAlias')!.modelBinding!.modelName).toBe('LocalOrders')
  })
  it('migrates a structured model relation in the same batch and preserves physical source names',async()=>{
    const {owner,view,writes,f}=await setup({allowRelationEdit:true,relationRows:[{rowid:'R',parentModId:'M1',childModId:'M2',parentTable:'OrderSource',childTable:'CustomerSource',
      filter:'{"Type":"cond","Field":"Orders.id","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":"Orders.id"}}'}]})
    view.updateEditingValue('M1','Name','LocalOrders');await owner.save();expect(writes()).toHaveLength(1)
    const row=(await f.open('A')).metadataDataSet.getView('Base_DataModel_Relation')!.rows[0]!
    expect(row['parentTable']).toBe('OrderSource');expect(JSON.parse(String(row['filter']))).toMatchObject({Field:'LocalOrders.id',ValueFun:{Value:'Orders.id'}})
  })
  it.each(['model','field'])('can retry a failed %s readback without replaying the saved database batch',async target=>{
    const {owner,view,writes,f}=await setup();view.updateEditingValue('M1','Name','LocalOrders')
    const release=f.holdModelResponse(),saving=owner.save();await new Promise(resolve=>setTimeout(resolve,0))
    if(target==='model')f.failNextModelRead();else f.failNextFieldRead()
    release();await expect(saving).rejects.toThrow();expect(owner.getState().status).toBe('readback')
    expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
  })
  it('rechecks the complete rename dependency set after asynchronous file preflight',async()=>{
    const preflight:{gate?:Promise<void>}={};let release=()=>{},reached=()=>{}
    const entered=new Promise<void>(resolve=>{reached=resolve})
    const {owner,view,writes,f,session}=await setup({blueprint:{loadRoot:async()=>{
      if(preflight.gate){reached();await preflight.gate}
      return{nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[]}
    }}})
    view.updateEditingValue('M1','Name','LocalOrders');preflight.gate=new Promise<void>(resolve=>{release=resolve})
    const saving=owner.save();await entered
    f.created.set('Base_DataModel_Field',[{rowid:'LATE',dataSetId:'A',dataModelId:'M2',Name:'late',type:'inputParams',ValueFun:'{"Type":"GetTableField","Field":"Orders.id"}'}])
    await session.metadataDataSet.getView('Base_DataModel_Field')!.refresh();release()
    await expect(saving).rejects.toThrow(/引用.*变化/);expect(writes()).toHaveLength(0);expect(f.fileWrites).toHaveLength(0)
    expect(owner.getState().status).toBe('idle');expect(view.getEditingRow('M1')?.['Name']).toBe('LocalOrders')
  })
})

describe('array compound changes after overview loading',()=>{
  it.each([false,true])('saves model and field names with references without loading default fields (lost=%s)',async lost=>{
    const {f,session,owner,view,writes}=await setupForView({overviewOnly:true,deferDefinition:true},'modelFields')
    view.updateEditingValue('M1','Name','LocalOrders')
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:'code',label:'编码'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    expect(view.getEditingRow('M1')?.['Name']).toBe('LocalOrders')
    if(lost){f.loseNextResponse();await expect(owner.save()).rejects.toThrow();expect(await owner.verify()).toBe(true)}
    else await owner.save()
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.rows).toEqual([])
    const fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')).toMatchObject({Name:'LocalOrders',PrimaryKeyFields:'code',items:'[{"code":"a"}]'})
    expect((await fresh.loadModelFields('M1')).rows.find(r=>r['rowid']==='F1')).toMatchObject({Name:'code'})
    expect((await fresh.loadModelFields('M2')).rows.find(r=>r['rowid']==='F2')?.['ValueFun']).toContain('LocalOrders.code')
    await fresh.loadDefinition()
    const result=fresh.definitionDataSet!.getView('OrdersAlias','shared')!
    expect((await result.loadFromServer()).success).toBe(true);expect(result.rows).toMatchObject([{code:'a'}])
    session.releaseArrayEdit('M1','modelFields')
    const next=session.getArrayEdit('M1','modelFields')
    view.updateEditingValue('M1','Name','FinalOrders');await next.save()
    expect(writes()).toHaveLength(2);expect(f.fileWrites).toHaveLength(2)
    expect(next.getState().pending).toBe(false)
  })
})
