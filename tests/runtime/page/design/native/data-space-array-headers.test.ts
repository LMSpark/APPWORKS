import {afterEach, describe, expect, it, vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {RequestState} from '@spark-appworks/spark-data'

const fixtures: ReturnType<typeof dataSpacePageFixture>[]=[]
afterEach(()=>{vi.restoreAllMocks();fixtures.splice(0).forEach(f=>f.dispose())})
async function setup(options:Parameters<typeof dataSpacePageFixture>[0]={}) {
  const f=dataSpacePageFixture({allowArrayEdit:true,allowFieldEdit:true,allowFieldAdd:true,allowDelete:true,formalProjection:true,missing:true,
    editableFieldProperties:['description','Order','IsPKey','IsOutput'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'code',description:'编号',FieldType:'string',IsOutput:1,IsPKey:1,Order:0,AsName:'',ValueFun:'',Expression:'',allowAIAdd:1,Group:0},
      {rowid:'F2',dataModelId:'M1',type:'dataModel',Name:'name',description:'名称',FieldType:'string',IsOutput:1,IsPKey:0,Order:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:1,Group:0},
      {rowid:'F3',dataModelId:'M1',type:'dataModel',Name:'obsolete',description:'旧字段',FieldType:'number',IsOutput:0,IsPKey:0,Order:2,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,Group:0},
    ],...options});fixtures.push(f)
  f.setModelValues({Type:'数组',PrimaryKeyFields:'code',items:'[{"code":"a","name":"A","obsolete":7,"extra":false}]'})
  const session=await f.open('A'),owner=session.getArrayEdit('M1')
  return{f,session,owner,writes:()=>f.requests.filter(r=>r.url?.includes('BatchTableOperate'))}
}
describe('existing array headers use the formal definition batch',()=>{
  it('does not create edits for unchanged nullable or numeric-string header metadata',async()=>{
    const {owner,session,writes}=await setup({sourceFields:[
      {rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'code',description:null,FieldType:'string',IsOutput:'1',IsPKey:'1',Order:'0'},
    ]})
    const fields=session.metadataDataSet.getView('Base_DataModel_Field')!,draft=owner.beginHeaders();draft.beginHeaders()
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    expect(fields.hasEditingChanges()).toBe(false);expect(owner.getState().pending).toBe(false)
    await owner.save();expect(writes()).toHaveLength(0)
  })
  it('tracks confirmed header edits in the formal field DataView and follows its cancellation',async()=>{
    const {owner,session,writes}=await setup(),fields=session.metadataDataSet.getView('Base_DataModel_Field')!
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:h.id==='F2'?'已确认标题':h.label}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    expect(fields.getEditingRow('F2')?.['description']).toBe('已确认标题')
    expect(fields.hasEditingChanges('F2')).toBe(true)
    fields.discardPendingChanges(['F2'])
    expect(owner.headers().find(h=>h.id==='F2')?.label).toBe('名称')
    expect(owner.getState().pending).toBe(false);expect(writes()).toHaveLength(0)
  })
  it('preserves later native drafts when asynchronous preflight rejects a changed header',async()=>{
    const {owner,session,writes}=await setup(),fields=session.metadataDataSet.getView('Base_DataModel_Field')!,models=session.metadataDataSet.getView('Base_DataModel')!
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:h.id==='F2'?'确认标题':h.label}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    models.updateEditingValue('M1','description','保存前描述')
    let release=()=>{},reached=()=>{}
    const gate=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{reached=resolve}),create=fields.createQueryView.bind(fields)
    vi.spyOn(fields,'createQueryView').mockImplementation(id=>{
      const query=create(id),load=query.loadFromServer.bind(query)
      vi.spyOn(query,'loadFromServer').mockImplementationOnce(async options=>{reached();await gate;return load(options)})
      return query
    })
    const saving=owner.save();await entered
    fields.updateEditingValue('F2','description','后来字段输入');models.updateEditingValue('M1','description','后来模型输入')
    release();await expect(saving).rejects.toThrow('预检期间输入已变化')
    expect(fields.getEditingRow('F2')?.['description']).toBe('后来字段输入')
    expect(models.getEditingRow('M1')?.['description']).toBe('后来模型输入')
    expect(owner.getState()).toMatchObject({status:'idle',pending:true});expect(writes()).toHaveLength(0)
    owner.discard();expect(owner.getState().pending).toBe(false)
  })
  it('keeps confirmed additions and removals in native tracking before save and cancels them together',async()=>{
    const {owner,session,writes}=await setup(),fields=session.metadataDataSet.getView('Base_DataModel_Field')!
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify([...draft.headers().filter(h=>h.id!=='F3'),{id:'dialog-only',name:'memo',label:'备注',order:3,primary:false}]))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    expect(fields.dirtyTracking.pendingDeleteIds.has('F3')).toBe(true)
    const added=fields.dirtyTracking.pendingCreateRows.find(row=>row['Name']==='memo')!
    expect(added).toBeDefined();expect(added['rowid']).not.toBe('dialog-only')
    expect(owner.headers().find(h=>h.name==='memo')?.id).toBe(added['rowid'])
    owner.discard()
    expect(fields.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(fields.hasEditingChanges()).toBe(false);expect(owner.headers().map(h=>h.id)).toEqual(['F1','F2','F3'])
    expect(writes()).toHaveLength(0)
  })
  it.each([
    {scope:'page',lost:false,ordinary:false}, {scope:'filter',lost:false,ordinary:false},
    {scope:'filter',lost:true,ordinary:false}, {scope:'filter',lost:true,ordinary:true},
  ])('keeps the selected array model through save and reopen: $scope, lost=$lost, ordinary=$ordinary',async({scope,lost,ordinary})=>{
    const {f,writes}=await setup({overviewOnly:true,sourceFields:[
      {rowid:'M2F1',dataModelId:'M2',type:'dataModel',Name:'code',description:'编号',FieldType:'string',IsOutput:1,IsPKey:1,Order:0},
      {rowid:'M2F2',dataModelId:'M2',type:'dataModel',Name:'name',description:'名称',FieldType:'string',IsOutput:1,IsPKey:0,Order:1},
    ]})
    f.setModelValues({Type:'数组',PrimaryKeyFields:'code',items:'[{"code":"b","name":"B"}]'},'A','M2')
    const session=await f.open('A'),models=session.metadataDataSet.getView('Base_DataModel')!
    if(scope==='filter')models.filterExpression={logic:'and',filters:[models.filterExpression!,{field:'rowid',operator:'eq',value:'M2'}]}
    await models.setPageSize(1)
    if(scope==='page')await models.setPage(2)
    expect(models.rows.map(row=>row['rowid'])).toEqual(['M2'])
    const before={page:models.page,total:models.total,filter:structuredClone(models.filterExpression)}
    await session.loadModelFields('M2')
    const owner=session.getArrayEdit('M2','modelFields')
    if(ordinary)models.updateEditingValue('M2','items','[{"code":"c","name":"C"}]')
    else {
      const draft=owner.beginHeaders();draft.beginHeaders()
      draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(header=>({...header,label:header.id==='M2F2'?'目标数组新名称':header.label}))))
      draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    }
    if(lost) {
      f.loseNextResponse();await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown')
      await expect(owner.save()).rejects.toThrow(/未决|草稿/);expect(writes()).toHaveLength(1)
      expect(await owner.verify()).toBe(true)
    } else await owner.save()
    expect(models.rows.map(row=>row['rowid'])).toEqual(['M2'])
    expect({page:models.page,total:models.total,filter:models.filterExpression}).toEqual(before)
    expect(owner.getState()).toMatchObject({status:'idle',pending:false});expect(writes()).toHaveLength(1)
    const fresh=await f.open('A');await fresh.loadModelFields('M2')
    expect(fresh.getArrayEdit('M2','modelFields').headers().find(header=>header.id==='M2F2')?.label).toBe(ordinary?'名称':'目标数组新名称')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M2')).toMatchObject({
      items:ordinary?'[{"code":"c","name":"C"}]':'[{"code":"b","name":"B"}]',
    })
  })

  it('keeps ordinary array description saves available for a historical non-output alias conflict',async()=>{
    const {f,session,owner,writes}=await setup({sourceFields:[
      {rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'code',description:'编号',FieldType:'string',IsOutput:1,IsPKey:1,Order:0,AsName:'',ValueFun:''},
      {rowid:'F2',dataModelId:'M1',type:'dataModel',Name:'name',description:'名称',FieldType:'string',IsOutput:1,IsPKey:0,Order:1,AsName:'',ValueFun:''},
      {rowid:'F3',dataModelId:'M1',type:'dataModel',Name:'obsolete',description:'旧字段',FieldType:'number',IsOutput:0,IsPKey:0,Order:2,AsName:'name',ValueFun:''},
    ]})
    session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','description','仅更新说明')
    await owner.save()
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toEqual([])
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName:'Base_DataModel',CrudModel:{
      Added:[],Changed:[{rowid:'M1',description:'仅更新说明',lingma_sys_key:'token-A-M1'}],Deleted:[],
    }})])
    const reopened=await f.open('A')
    expect(reopened.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')?.['description']).toBe('仅更新说明')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row=>row['rowid']==='F3')).toMatchObject({Name:'obsolete',AsName:'name',IsOutput:0})
  })

  it('rejects a new array header colliding with a non-output canonical column before accepting the draft',async()=>{
    const {f,owner,writes}=await setup({sourceFields:[
      {rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'code',description:'编号',FieldType:'string',IsOutput:1,IsPKey:1,Order:0,AsName:'',ValueFun:''},
      {rowid:'F2',dataModelId:'M1',type:'dataModel',Name:'name',description:'名称',FieldType:'string',IsOutput:1,IsPKey:0,Order:1,AsName:'',ValueFun:''},
      {rowid:'F3',dataModelId:'M1',type:'dataModel',Name:'obsolete',description:'旧字段',FieldType:'number',IsOutput:0,IsPKey:0,Order:2,AsName:'hiddenAlias',ValueFun:''},
    ]})
    const draft=owner.beginHeaders()
    try {
      draft.beginHeaders()
      draft.view.updateEditingValue('array','headerDraft',JSON.stringify([...draft.headers(),{id:'new-header',name:'hiddenAlias',label:'新列',order:3,primary:false}]))
      draft.applyHeaders()
      await expect(owner.applyHeaders(draft.definition())).rejects.toThrow('字段重复')
      expect(owner.getState().pending).toBe(false)
      expect(owner.headers().map(header=>header.id)).toEqual(['F1','F2','F3'])
      expect(writes()).toEqual([]);expect(f.fileWrites).toEqual([])
    } finally {draft.dispose()}
  })

  it.each([false,true])('saves only array values through the native receipt without reading catalogs, paged=%s',async paged=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    const fields=await session.loadModelFields('M1'),models=session.metadataDataSet.getView('Base_DataModel')!
    if(paged)await models.loadFromServer({page:1,pageSize:1})
    const owner=session.getArrayEdit('M1','modelFields'),modelCount=models.rows.length,before=f.requests.length
    models.updateEditingValue('M1','items','[]');owner.discard()
    expect(models.getEditingRow('M1')?.['items']).toContain('extra')
    const next='[{"code":"b","name":"B","extra":false,"nested":{"n":null}}]'
    models.updateEditingValue('M1','items',next);models.updateEditingValue('M1','description','数组说明')
    await owner.save()
    expect(f.requests).toHaveLength(before+1);expect(writes()).toHaveLength(1)
    expect(writes()[0]?.data).toEqual([expect.objectContaining({TableName:'Base_DataModel',CrudModel:{
      Added:[],Changed:[{rowid:'M1',items:next,description:'数组说明',lingma_sys_key:'token-A-M1'}],Deleted:[],
    }})])
    expect(models.rows).toHaveLength(modelCount);expect(models.total).toBe(2)
    expect(fields.rows).toHaveLength(3);expect(fields.hasEditingChanges()).toBe(false)
    expect(owner.getState()).toMatchObject({status:'idle',pending:false});expect(f.fileWrites).toHaveLength(0)
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])expect(session.metadataDataSet.getView(name)!.requestState).toBe(RequestState.Idle)
    models.updateEditingValue('M1','description','再次修改');await owner.save()
    expect(f.requests).toHaveLength(before+2)
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')).toMatchObject({items:next,description:'再次修改'})
    expect(fresh.getArrayEdit('M1','modelFields').headers().map(header=>header.id)).toEqual(['F1','F2','F3'])
  })
  it('keeps the model page while verifying a structural header change',async()=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M1')
    const models=session.metadataDataSet.getView('Base_DataModel')!
    await models.setPageSize(1)
    const owner=session.getArrayEdit('M1','modelFields'),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(header=>({...header,label:header.id==='F2'?'新的名称':header.label}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    await owner.save()
    expect(models.rows.map(row=>row['rowid'])).toEqual(['M1']);expect(models.total).toBe(2);expect(models.pageSize).toBe(1)
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    expect(owner.getState()).toMatchObject({status:'idle',pending:false})
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    expect(fresh.getArrayEdit('M1','modelFields').headers().find(header=>header.id==='F2')?.label).toBe('新的名称')
  })
  it('preserves remote values outside an ordinary array patch',async()=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),models=session.metadataDataSet.getView('Base_DataModel')!,before=f.requests.length
    f.setModelValues({items:'[]'})
    models.updateEditingValue('M1','description','仅改说明');await owner.save()
    expect(f.requests).toHaveLength(before+1);expect(writes()).toHaveLength(1)
    const fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')).toMatchObject({items:'[]',description:'仅改说明'})
  })
  it('verifies an ordinary lost array receipt without replaying or expanding the model page',async()=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M1')
    const models=session.metadataDataSet.getView('Base_DataModel')!;await models.setPageSize(1)
    const owner=session.getArrayEdit('M1','modelFields'),before=f.requests.length
    models.updateEditingValue('M1','items','[]');f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow()
    expect(owner.getState().status).toBe('unknown');expect(f.requests).toHaveLength(before+1)
    await expect(owner.save()).rejects.toThrow('未决')
    expect(await owner.verify()).toBe(true)
    expect(models.rows.map(row=>row['rowid'])).toEqual(['M1']);expect(models.total).toBe(2)
    expect(models.rows[0]?.['items']).toBe('[]');expect(writes()).toHaveLength(1)
    expect(owner.getState()).toMatchObject({status:'idle',pending:false})
  })
  it('retains a later array draft after the native receipt arrives',async()=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),models=session.metadataDataSet.getView('Base_DataModel')!
    models.updateEditingValue('M1','items','[]')
    const release=f.holdModelResponse(),saving=owner.save()
    await vi.waitFor(()=>expect(writes()).toHaveLength(1))
    models.updateEditingValue('M1','description','后来输入');release();await saving
    expect(owner.getState()).toMatchObject({status:'idle',pending:true})
    expect(models.getEditingPatch('M1')).toEqual({description:'后来输入'})
    expect(f.modelRow().description).not.toBe('后来输入')
    owner.discard();expect(owner.getState().pending).toBe(false)
    expect(models.rows.find(row=>row['rowid']==='M1')?.['items']).toBe('[]')
  })
  it.each([false,true])('preserves a later field change while accepting an ordinary array receipt, staged=%s',async staged=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    const fields=await session.loadModelFields('M1'),models=session.metadataDataSet.getView('Base_DataModel')!
    const owner=session.getArrayEdit('M1','modelFields'),before=f.requests.length
    models.updateEditingValue('M1','items','[]')
    const release=f.holdModelResponse(),saving=owner.save()
    await vi.waitFor(()=>expect(writes()).toHaveLength(1))
    fields.updateEditingValue('F2','description','后续字段修改')
    if(staged)expect((await fields.applyEditingRows(['F2'])).success).toBe(true)
    release();await saving
    expect(f.requests).toHaveLength(before+1);expect(owner.getState()).toMatchObject({status:'idle',pending:false})
    expect(fields.getEditingRow('F2')?.['description']).toBe('后续字段修改')
    expect(staged?fields.dirtyTracking.hasPendingChanges('F2'):fields.hasEditingChanges('F2')).toBe(true)
    expect(models.rows.find(row=>row['rowid']==='M1')?.['items']).toBe('[]')
  })
  it.each([false,true])('preserves a later field draft between array recovery queries, staged=%s',async staged=>{
    const {f,session,owner,writes}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:h.id==='F2'?'已写标题':h.label}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    f.loseNextResponse();await expect(owner.save()).rejects.toThrow()
    const models=session.metadataDataSet.getView('Base_DataModel')!,fields=session.metadataDataSet.getView('Base_DataModel_Field')!
    const load=models.loadFromServer.bind(models)
    let release!:()=>void
    const gate=new Promise<void>(resolve=>{release=resolve})
    const held=vi.spyOn(models,'loadFromServer').mockImplementationOnce(async options=>{const result=await load(options);await gate;return result})
    const verifying=expect(owner.verify()).rejects.toThrow(/草稿|覆盖/)
    await vi.waitFor(()=>expect(held).toHaveBeenCalledTimes(1))
    fields.updateEditingValue('F2','description','后续标题')
    if(staged)expect((await fields.applyEditingRows(['F2'])).success).toBe(true)
    release();await verifying
    expect(fields.getEditingRow('F2')?.['description']).toBe('后续标题');expect(writes()).toHaveLength(1)
    await expect(owner.verify()).rejects.toThrow(/草稿|覆盖/)
    fields.discardPendingChanges(['F2'])
    expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1)
    const fresh=await f.open('A')
    expect(fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(row=>row['rowid']==='F2')?.['description']).toBe('已写标题')
  })
  it.each(['plain','projection','lost-db','lost-file','promote','hidden-primary','clear'] as const)('switches array primary metadata within the lazy workspace: %s',async mode=>{
    let toolReads=0
    const {f,writes}=await setup({overviewOnly:true,blueprint:{loadRoot:async()=>{toolReads++;throw new Error('Unchanged tool bindings must not be read')}}})
    const projection=[['F1','code',true,true],['F2','name',false,mode!=='hidden-primary']].map(([id,name,primary,output])=>({
      fieldId:id,resourceFieldId:id,resourceField:name,viewField:name,source:'resource',type:'string',primaryKey:primary,
      output,label:name,sortOrder:0,sortDirection:null,expression:'',valueFunction:'',value:'',group:0,distinct:false,
    }))
    const config=JSON.stringify({scenarioId:'A',tables:{ArrayRows:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{
      default:{},implicit:{...(mode==='plain'?{}:{fieldProjection:projection})},explicit:{valueField:'code'},
    }}}},null,2)
    f.stored.set('A',config)
    const session=await f.open('A');await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),id=mode==='clear'?'':mode==='promote'?'F3':'F2',key=id==='F3'?'obsolete':id?'name':''
    const changePrimary=async()=>{
      const draft=owner.beginHeaders();draft.beginHeaders()
      try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,primary:h.id===id}))))
        draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}
    }
    await changePrimary();owner.discard();expect(owner.headers().find(h=>h.primary)?.id).toBe('F1');expect(writes()).toHaveLength(0)
    await changePrimary()
    if(mode==='lost-db')f.loseNextResponse()
    if(mode==='lost-file')f.loseNextFileResponse()
    if(mode==='lost-db'||mode==='lost-file'){
      await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe(mode==='lost-db'?'unknown':'configuration')
      await expect(owner.save()).rejects.toThrow('先核验');expect(await owner.verify()).toBe(true)
    }else await owner.save()
    expect(owner.getState()).toMatchObject({status:'idle',pending:false});expect(writes()).toHaveLength(1);expect(toolReads).toBe(0)
    expect(f.fileWrites).toHaveLength(mode==='plain'?0:1)
    if(mode==='plain')expect(f.stored.get('A')).toBe(config)
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])expect(session.metadataDataSet.getView(name)!.requestState).toBe(RequestState.Idle)
    for(const request of f.requests.filter(r=>r.url.includes('GetData')&&JSON.stringify(r.data).includes('Base_DataModel_Field'))){
      expect(JSON.stringify(request.data)).toContain('dataModelId');expect(JSON.stringify(request.data)).toContain('M1')
    }
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')).toMatchObject({PrimaryKeyFields:key,items:'[{"code":"a","name":"A","obsolete":7,"extra":false}]'})
    const fields=fresh.metadataDataSet.getView('Base_DataModel_Field','modelFields')!.rows
    expect(fields.filter(r=>r['IsPKey']===1).map(r=>r['rowid'])).toEqual(id?[id]:[])
    if(id)expect(fields.find(r=>r['rowid']===id)?.['IsOutput']).toBe(1)
    const implicit=fresh.definitionDataSet!.getView('ArrayRows','implicit')!,explicit=fresh.definitionDataSet!.getView('ArrayRows','explicit')!
    for(const view of [implicit,explicit]){expect(view.primaryKey).toBe(key);expect((await view.loadFromServer()).success).toBe(true)}
    if(key){implicit.setSelectedRows(implicit.rows);explicit.setSelectedRows(explicit.rows)
      expect(implicit.getSelectedValues()).toEqual([mode==='promote'?7:'A']);expect(explicit.getSelectedValues()).toEqual([mode==='promote'?7:'A'])
      expect(implicit.value).toBe(mode==='promote'?'7':'A');expect(explicit.value).toBe('a')
      expect(implicit.dataTable?.columns.find(c=>c.name===key)?.isPrimaryKey).toBe(true)
      if(mode!=='promote')expect(implicit.columns.find(c=>c.name===key)?.isPrimaryKey).toBe(true)
    }
    if(mode!=='plain')expect(JSON.parse(f.stored.get('A')!).tables.ArrayRows.views.implicit.fieldProjection.map((p:{primaryKey:boolean})=>p.primaryKey)).toEqual([false,id==='F2'])
  })
  it.each(['IsPKey','IsOutput','PrimaryKeyFields','remote'] as const)('keeps a lazy primary draft on preflight %s failure',async failure=>{
    const {f,session,writes}=await setup({overviewOnly:true});await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),draft=owner.beginHeaders();draft.beginHeaders()
    try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,primary:h.id==='F3'}))))
      draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}
    if(failure==='remote')f.stored.set('A',JSON.stringify({scenarioId:'A',tables:{}}))
    else if(failure==='PrimaryKeyFields')f.denyModelField(failure)
    else f.denyFieldProperty(failure)
    await expect(owner.save()).rejects.toThrow(failure==='remote'?'远端场景配置已变化':'不可写')
    expect(writes()).toHaveLength(0);expect(f.fileWrites).toHaveLength(0);expect(owner.headers().find(h=>h.primary)?.id).toBe('F3')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    owner.discard();expect(owner.headers().find(h=>h.primary)?.id).toBe('F1')
  })
  it('retains a partial primary result without saving the file or replaying the batch',async()=>{
    const {f,session,writes}=await setup({overviewOnly:true,omitFieldProperties:['IsPKey']});await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),draft=owner.beginHeaders();draft.beginHeaders()
    try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,primary:h.id==='F2'}))))
      draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}
    await expect(owner.save()).rejects.toThrow('回读');expect(owner.getState().pending).toBe(true)
    await expect(owner.save()).rejects.toThrow('先核验');expect(await owner.verify()).toBe(false)
    expect(owner.getState().status).toBe('different');expect(owner.getState().verification.join()).toContain('F1')
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    expect(f.modelRow()).toMatchObject({PrimaryKeyFields:'name'})
    expect(session.metadataDataSet.getView('Base_DataModel_Field','modelFields')!.rows.find(r=>r['rowid']==='F1')?.['IsPKey']).toBe(1)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    owner.acceptCurrent();expect(owner.getState().pending).toBe(false)
  })
  it.each([false,true])('adds a header from the lazy workspace and consumes it after reopening, existing configuration=%s',async configured=>{
    const {f,session:initial,writes}=await setup({overviewOnly:true})
    const config=JSON.stringify({scenarioId:'A',tables:{ArrayRows:{modelBinding:{modelId:'M1',modelName:'Orders'},
      columns:[{name:'local',type:'string',computeExpression:'"kept"'}],views:{default:{},list:{pageSize:7}}}}})
    if(configured)f.stored.set('A',config)
    const session=configured?await f.open('A'):initial
    await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields')
    const addHeader=async()=>{
      const draft=owner.beginHeaders();draft.beginHeaders()
      try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify([...draft.headers(),{name:'memo',label:'备注',order:3,primary:false}]))
        draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}
    }
    await addHeader();owner.discard()
    expect(owner.headers().map(h=>h.id)).toEqual(['F1','F2','F3']);expect(writes()).toHaveLength(0)
    await addHeader();session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','items','[{"code":"a","name":"A","obsolete":7,"extra":false,"memo":"保存备注"}]')
    if(configured){f.loseNextResponse();await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown');expect(await owner.verify()).toBe(true)}
    else await owner.save()
    expect(owner.getState()).toMatchObject({pending:false,status:'idle'});expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    if(configured)expect(f.stored.get('A')).toBe(config)
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])expect(session.metadataDataSet.getView(name)!.requestState).toBe(RequestState.Idle)
    for(const request of f.requests.filter(r=>r.url.includes('GetData')&&JSON.stringify(r.data).includes('Base_DataModel_Field'))){
      expect(JSON.stringify(request.data)).toContain('dataModelId');expect(JSON.stringify(request.data)).toContain('M1')
    }
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    const rows=fresh.metadataDataSet.getView('Base_DataModel_Field','modelFields')!.rows
    expect(rows).toHaveLength(4);expect(rows.find(r=>r['rowid']==='F1')).toMatchObject({Name:'code',IsPKey:1,allowAIAdd:1})
    const field=rows.find(r=>r['Name']==='memo')!
    expect(field).toMatchObject({dataModelId:'M1',dataSetId:'A',type:'dataModel',description:'备注',IsOutput:1,IsPKey:0})
    expect(field['rowid']).toBeTruthy();expect(String(field['rowid'])).not.toMatch(/^new:/)
    if(!configured){await fresh.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: fresh.targetId, tableName: 'ArrayRows', dataModelId: 'M1', dataModelName: 'Orders', viewId: 'list'});await expect(fresh.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})}
    const consumer=await f.open('A'),view=consumer.definitionDataSet!.getView('ArrayRows','list')!
    expect((await view.loadFromServer()).success).toBe(true);expect(view.columns.some(c=>c.name==='memo')).toBe(true)
    expect(view.rows).toMatchObject([{code:'a',name:'A',memo:'保存备注'}])
  })
  it.each(['collision','remote','permission'] as const)('keeps a lazy added header unsubmitted on %s conflict',async failure=>{
    const {f,writes}=await setup({overviewOnly:true})
    const config=(name:string)=>JSON.stringify({scenarioId:'A',tables:{ArrayRows:{modelBinding:{modelId:'M1',modelName:'Orders'},
      columns:[{name,type:'string',computeExpression:'"kept"'}],views:{default:{}}}}})
    f.stored.set('A',config(failure==='collision'?'memo':'local'))
    const session=await f.open('A');await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),draft=owner.beginHeaders();draft.beginHeaders()
    try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify([...draft.headers(),{name:'memo',label:'备注',order:3,primary:false}]))
      draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}
    if(failure==='remote')f.stored.set('A',config('remoteColumn'))
    if(failure==='permission')f.denyFieldAdd()
    await expect(owner.save()).rejects.toThrow(failure==='collision'?'本地计算':failure==='remote'?'远端视图配置已变化':'增删权限已变化')
    expect(writes()).toHaveLength(0);expect(f.fileWrites).toHaveLength(0);expect(owner.headers().some(h=>h.name==='memo')).toBe(true)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Idle)
    owner.discard();expect(owner.headers()).toHaveLength(3)
  })
  it.each([false,true])('edits a loaded model field view while the full catalogs stay idle, lost receipt=%s',async lost=>{
    const {f,session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M1')
    const owner=session.getArrayEdit('M1','modelFields'),models=session.metadataDataSet.getView('Base_DataModel')!
    expect(owner.headers().map(h=>h.id)).toEqual(['F1','F2','F3'])
    models.updateEditingValue('M1','items','[]');owner.discard()
    expect(models.getEditingRow('M1')?.['items']).toContain('extra')
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'新的标题'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    models.updateEditingValue('M1','items','[{"code":"b","name":"B","extra":false}]')
    if(lost){f.loseNextResponse();await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown');expect(await owner.verify()).toBe(true)}
    else await owner.save()
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    expect(owner.getState()).toMatchObject({pending:false,status:'idle'})
    for(const name of ['Base_DataModel_Field','Base_DataModel_Relation'])expect(session.metadataDataSet.getView(name)!.requestState).toBe(RequestState.Idle)
    const fieldReads=f.requests.filter(request=>request.url.includes('GetData')&&JSON.stringify(request.data).includes('Base_DataModel_Field'))
    expect(fieldReads.length).toBeGreaterThan(0)
    for(const request of fieldReads){expect(JSON.stringify(request.data)).toContain('dataModelId');expect(JSON.stringify(request.data)).toContain('M1')}
    const fresh=await f.open('A');await fresh.loadModelFields('M1')
    expect(fresh.getArrayEdit('M1','modelFields').headers()[0]?.label).toBe('新的标题')
    expect(fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')?.['items']).toBe('[{"code":"b","name":"B","extra":false}]')
    expect(session.metadataDataSet.getView('Base_DataModel_Field','modelFields')!.queryContext).toMatchObject({dataSpaceId:'A',modelId:'M1'})
  })
  it('rejects a field view from another model and refuses saving after the bound query switches',async()=>{
    const {session,writes}=await setup({overviewOnly:true})
    await session.loadModelFields('M2')
    expect(()=>session.getArrayEdit('M1','modelFields')).toThrow('所属模型不符')
    const fields=await session.loadModelFields('M1'),owner=session.getArrayEdit('M1','modelFields')
    session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','items','[]')
    fields.queryContext={dataSpaceId:'A',modelId:'M2'}
    await expect(owner.save()).rejects.toThrow('正式查询或目标已变化')
    expect(writes()).toHaveLength(0)
  })
  it('renames by field identity, adds/deletes headers, preserves attributes and JSON values, then reopens',async()=>{
    const {f,session,owner,writes}=await setup()
    const draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify([
      {...draft.headers()[0],name:'id',label:'标识'},
      {...draft.headers()[1],label:'标题',order:2},
      {name:'newField',label:'新增字段',order:1,primary:false},
    ]));draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    expect(session.hasPendingModelEdits()).toBe(true)
    await owner.save()
    expect(writes()).toHaveLength(1)
    const fresh=await f.open('A'),model=fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')!
    expect(model['PrimaryKeyFields']).toBe('id');expect(JSON.parse(String(model['items']))).toEqual([{id:'a',name:'A',extra:false}])
    const rows=fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.filter(r=>r['dataModelId']==='M1')
    expect(rows).toHaveLength(3)
    expect(rows.find(r=>r['rowid']==='F1')).toMatchObject({Name:'id',description:'标识',allowAIAdd:1,FieldType:'string',IsPKey:1})
    expect(rows.find(r=>r['rowid']==='F2')).toMatchObject({Name:'name',description:'标题',allowAIAdd:1,Order:2})
    expect(rows.find(r=>r['Name']==='newField')).toMatchObject({type:'dataModel',dataSetId:'A',IsPKey:0,Order:1})
    expect(session.hasPendingModelEdits()).toBe(false);expect(f.fileWrites).toHaveLength(0)
    await fresh.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: fresh.targetId, tableName: 'ArrayRows', dataModelId: 'M1', dataModelName: 'Orders', viewId: 'list'})
    await expect(fresh.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    const consumer=await f.open('A'),view=consumer.definitionDataSet!.getView('ArrayRows','list')!
    expect((await view.loadFromServer()).success).toBe(true);expect(view.rows).toMatchObject([{id:'a',name:'A'}]);expect(view.rows[0]).not.toHaveProperty('obsolete')
  })
  it('discards unsubmitted header/data changes together',async()=>{
    const {owner,session,writes}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'changed'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();owner.discard()
    expect(owner.headers()[0]?.label).toBe('编号');expect(session.hasPendingModelEdits()).toBe(false);expect(writes()).toHaveLength(0)
  })
  it('does not replay unknown writes and checks changed fields on readback',async()=>{
    const {f,owner,writes}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'changed'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown')
    await expect(owner.save()).rejects.toThrow();expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1)
  })
  it.each([{readOnly:true},{denyDeleteIds:['F3']}])('enforces formal access %j',async options=>{
    const {owner,writes}=await setup(options)
    await expect((async()=>{
      const draft=owner.beginHeaders();draft.beginHeaders();draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().filter(h=>h.id!=='F3')))
      try{draft.applyHeaders();await owner.applyHeaders(draft.definition());await owner.save()}finally{draft.dispose()}
    })()).rejects.toThrow()
    expect(writes()).toHaveLength(0)
  })
  it('rejects unreadable header identities before opening the editor',async()=>{await expect(setup({hiddenFieldProperties:['Name']})).rejects.toThrow('不可读')})
  it('keeps partial formal results for explicit adoption and never replays them',async()=>{
    const {owner,f,writes,session}=await setup({omitFieldProperties:['description']}),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'changed'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    await expect(owner.save()).rejects.toThrow('回读');expect(await owner.verify()).toBe(false)
    expect(owner.getState().status).toBe('different');expect(session.hasPendingModelEdits()).toBe(true)
    expect(owner.getState().verification.join()).toContain('F1');owner.acceptCurrent()
    expect(session.hasPendingModelEdits()).toBe(false);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
  })
  it('checks fresh field permissions and remote changes before a structural dispatch',async()=>{
    const one=await setup(),draft=one.owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'changed'}))))
    draft.applyHeaders();await one.owner.applyHeaders(draft.definition());draft.dispose();one.f.denyFieldProperty('description')
    await expect(one.owner.save()).rejects.toThrow('不可写');expect(one.writes()).toHaveLength(0)
    const two=await setup(),second=two.owner.beginHeaders();second.beginHeaders()
    second.view.updateEditingValue('array','headerDraft',JSON.stringify(second.headers().map(header=>({...header,label:'changed'}))))
    second.applyHeaders();await two.owner.applyHeaders(second.definition());second.dispose();two.f.setModelValues({items:'[]'})
    two.session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','description','changed')
    await expect(two.owner.save()).rejects.toThrow('正式定义已变化');expect(two.writes()).toHaveLength(0)
    two.session.metadataDataSet.getView('Base_DataModel')!.queryContext={dataSpaceId:'B'}
    await expect(two.owner.save()).rejects.toThrow('目标已变化');expect(two.writes()).toHaveLength(0)
  })
  it('migrates an existing parent-field reference with the confirmed header in one batch',async()=>{
    const {owner,f,writes}=await setup();f.setModelValues({parentField:'name'})
    // Reload a new instance so the reference is part of the authoritative baseline.
    const fresh=await f.open('A'),current=fresh.getArrayEdit('M1'),draft=current.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:h.name==='name'?'label':h.name}))))
    draft.applyHeaders();await current.applyHeaders(draft.definition());draft.dispose()
    await current.save()
    expect(current.headers().some(h=>h.name==='label')).toBe(true);expect(writes()).toHaveLength(1);expect(owner.getState().status).toBe('idle')
    expect((await f.open('A')).metadataDataSet.getView('Base_DataModel')!.rows.find(row=>row['rowid']==='M1')?.['parentField']).toBe('label')
  })
  it('switches the primary field and swaps JSON members simultaneously without losing values',async()=>{
    const {owner,f}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,
      name:h.name==='code'?'name':h.name==='name'?'code':h.name,primary:h.id==='F2'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();await owner.save()
    const fresh=await f.open('A'),model=fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')!
    expect(model['PrimaryKeyFields']).toBe('code');expect(JSON.parse(String(model['items']))).toEqual([{name:'a',code:'A',obsolete:7,extra:false}])
    const fields=fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows
    expect(fields.find(r=>r['rowid']==='F1')).toMatchObject({Name:'name',IsPKey:0});expect(fields.find(r=>r['rowid']==='F2')).toMatchObject({Name:'code',IsPKey:1})
  })
  it('preserves an unrelated opaque field configuration when only the header title changes',async()=>{
    const {owner,f,writes}=await setup({sourceFields:[{rowid:'F1',dataModelId:'M1',type:'dataModel',Name:'code',description:'编号',FieldType:'string',
      IsOutput:1,IsPKey:1,Order:0,AsName:'',ValueFun:'',Expression:'',allowAIAdd:1},
      {rowid:'F2',dataModelId:'M1',type:'dataModel',Name:'name',description:'名称',FieldType:'string',IsOutput:1,IsPKey:0,Order:1,AsName:'',ValueFun:'',Expression:'ExistingRuleId',allowAIAdd:1},
    ]}),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,label:'新标题'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();await owner.save()
    const fresh=await f.open('A');expect(fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(r=>r['rowid']==='F2')).toMatchObject({description:'新标题',Expression:'ExistingRuleId',allowAIAdd:1})
    expect(writes()).toHaveLength(1)
  })
  it('does not silently repair inconsistent historical primary metadata during a data-only save',async()=>{
    const {f,writes}=await setup();f.setModelValues({PrimaryKeyFields:'name'})
    const fresh=await f.open('A'),owner=fresh.getArrayEdit('M1')
    fresh.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','description','edit description only')
    await expect(owner.save()).rejects.toThrow('主键声明与表头不一致');expect(writes()).toHaveLength(0)
  })
  it('does not infer deletion success from missing rows after a lost batch receipt',async()=>{
    const {owner,f,writes}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().filter(h=>h.id!=='F3')))
    draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose();f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown');expect(writes()).toHaveLength(1);expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification.join()).toContain('缺少正式回执');expect(owner.getState().status).toBe('different')
    owner.acceptCurrent();expect(writes()).toHaveLength(1)
  })
  it.each(['add','remove'] as const)('confirms a batch with only a header %s and changed visible row count',async operation=>{
    const {owner,f,writes}=await setup(),draft=owner.beginHeaders();draft.beginHeaders()
    const headers=operation==='remove'?draft.headers().filter(h=>h.id!=='F3'):[...draft.headers(),{name:'extraField',label:'追加',order:3,primary:false}]
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(headers));draft.applyHeaders();await owner.applyHeaders(draft.definition());draft.dispose()
    await owner.save();expect(owner.getState()).toMatchObject({status:'idle',pending:false});expect(writes()).toHaveLength(1)
    const fresh=await f.open('A');expect(fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.filter(r=>r['dataModelId']==='M1')).toHaveLength(operation==='remove'?2:4)
  })
})
