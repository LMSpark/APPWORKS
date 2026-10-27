import {afterEach,describe,expect,it,vi} from 'vitest'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceArrayConfiguration} from '@/lowcode/data-space/model-source/array/lowcode-data-space-array-configuration'
const fixtures:ReturnType<typeof dataSpacePageFixture>[]=[]
afterEach(()=>fixtures.splice(0).forEach(f=>f.dispose()))
async function setup(options:Parameters<typeof dataSpacePageFixture>[0]={}) {
  const f=dataSpacePageFixture({missing:true,allowArrayEdit:true,allowModelRename:true,allowFieldEdit:true,allowRelationEdit:true,formalProjection:true,
    editableFieldProperties:['Name','description','Order','IsPKey','IsOutput','ValueFun'],sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'code',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1,Order:0,AsName:'',ValueFun:'',Expression:''},
      {rowid:'F2',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1,Order:1,AsName:'',ValueFun:'',Expression:''},
      {rowid:'F3',dataModelId:'M2',Name:'reference',type:'dataModel',FieldType:'计算字段',IsPKey:0,IsOutput:1,ValueFun:'{"Type":"GetTableField","Field":"Orders.code","Extra":false}'},
    ],relationRows:[{rowid:'R',parentModId:'M1',childModId:'M2',parentTable:'OrderSource',childTable:'CustomerSource',
      filter:'{"Type":"cond","Field":"CustomerSource.reference","Operator":"equal","ValueFun":{"Type":"GetTableField","Field":"OrderSource.code"},"Extra":0}'}],...options})
  fixtures.push(f);f.setModelValues({Type:'数组',PrimaryKeyFields:'code',parentField:'code',hasChildField:'name',items:'[{"code":"a","name":"A"}]',
    Filter:'{"Type":"cond","Field":"code","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":"code"},"Extra":true}'})
  const session=await f.open('A'),owner=session.getArrayEdit('M1')
  const rename=async(names:Record<string,string>)=>{const draft=owner.beginHeaders();draft.beginHeaders()
    try{draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:names[h.id]??h.name}))));draft.applyHeaders();await owner.applyHeaders(draft.definition())}finally{draft.dispose()}}
  return{f,session,owner,rename,writes:()=>f.requests.filter(r=>r.url?.includes('BatchTableOperate'))}
}
describe('array field references follow formal field identity',()=>{
  it.each(['saved', 'unknown', 'query-retry'])('submits view, relation and cascade field references together through native resources: %s', async outcome => {
    const {f, writes} = await setup()
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {valueField: 'code', labelField: 'name'}}},
      CustomersAlias: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}, untouched: {pageSize: 37}}},
    }, resourceRelations: [{relationId: 'native', parentTable: 'OrdersAlias', childTable: 'CustomersAlias',
      filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'code'}}}],
    viewCascades: [{kind: 'query', parentTable: 'OrdersAlias', parentViewId: 'default', childTable: 'CustomersAlias', childViewId: 'default',
      filterBindings: [{sourceField: 'code', targetField: 'parentId'}], autoLoad: false}]}))
    const session = await f.open('A'), data = session.metadataDataSet, owner = session.getArrayEdit('M1')
    const save = vi.spyOn(data, 'saveChanges')
    if (outcome === 'query-retry') {
      const source = data.getView('DataViewDefinition')!, create = source.createQueryView.bind(source)
      vi.spyOn(source, 'createQueryView').mockImplementation(id => {
        const query = create(id)
        vi.spyOn(query, 'loadFromServer').mockRejectedValueOnce(new Error('definition query unavailable'))
        return query
      })
    }
    const draft = owner.beginHeaders(); draft.beginHeaders()
    draft.view.updateEditingValue('array', 'headerDraft', JSON.stringify(draft.headers().map(header => ({...header, name: header.id === 'F1' ? 'id' : 'label'}))))
    draft.applyHeaders();await owner.applyHeaders(draft.definition()); draft.dispose()
    data.getView('Base_DataModel')!.updateEditingValue('M1', 'Name', 'LocalOrders')
    if (outcome !== 'saved') {
      if (outcome === 'unknown') f.loseNextFileResponse()
      await expect(owner.save()).rejects.toThrow(outcome === 'unknown' ? /file response/ : /definition query unavailable/)
      expect(owner.getState().status).toBe('configuration')
      expect(await owner.verify()).toBe(true)
    } else await owner.save()
    const expected = ['DataTableBindingDefinition', 'DataViewDefinition', 'DataResourceRelationDefinition', 'DataViewCascadeDefinition']
    expect(save.mock.calls.some(([options]) => expected.every(name => options?.views?.some(view => view.tableName === name)))).toBe(true)
    expect(writes()).toHaveLength(1); expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A'), config = reopened.viewState!.config
    expect(config).toMatchObject({tables: {
      OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'LocalOrders'}, views: {default: {valueField: 'id', labelField: 'label'}}},
      CustomersAlias: {views: {untouched: {pageSize: 37}}},
    }, resourceRelations: [{filterExpression: {field: 'parentId', value: {Field: 'id'}}}],
    viewCascades: [{filterBindings: [{sourceField: 'id', targetField: 'parentId'}]}]})
    expect(reopened.definitionError).toBeNull()
    expect(owner.getState().pending).toBe(false)
  })

  it('saves tree fields, structured filters, value functions and physical relation references in the original batch',async()=>{
    const {f,owner,rename,writes}=await setup();await rename({F1:'id',F2:'label'});await owner.save()
    expect(writes()).toHaveLength(1);const fresh=await f.open('A'),model=fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')!
    expect(model).toMatchObject({PrimaryKeyFields:'id',parentField:'id',hasChildField:'label',items:'[{"id":"a","label":"A"}]'})
    expect(JSON.parse(String(model['Filter']))).toMatchObject({Field:'id',ValueFun:{Value:'code'},Extra:true})
    const fields=fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows
    expect(fields.find(r=>r['rowid']==='F1')).toMatchObject({Name:'id',IsPKey:1})
    expect(JSON.parse(String(fields.find(r=>r['rowid']==='F3')?.['ValueFun']))).toEqual({Type:'GetTableField',Field:'Orders.id',Extra:false})
    expect(JSON.parse(String(fresh.metadataDataSet.getView('Base_DataModel_Relation')!.rows[0]?.['filter']))).toMatchObject({Field:'CustomerSource.reference',ValueFun:{Field:'OrderSource.id'},Extra:0})
  })
  it('composes simultaneous field-name swaps and model registration changes without sequential replacement',async()=>{
    const {f,owner,rename,session,writes}=await setup();await rename({F1:'name',F2:'code'})
    session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','Name','LocalOrders');await owner.save()
    expect(writes()).toHaveLength(1);const fresh=await f.open('A'),model=fresh.metadataDataSet.getView('Base_DataModel')!.rows.find(r=>r['rowid']==='M1')!
    expect(model).toMatchObject({Name:'LocalOrders',PrimaryKeyFields:'name',parentField:'name',hasChildField:'code',items:'[{"name":"a","code":"A"}]'})
    expect(JSON.parse(String(fresh.metadataDataSet.getView('Base_DataModel_Field')!.rows.find(r=>r['rowid']==='F3')?.['ValueFun']))).toMatchObject({Field:'LocalOrders.name'})
  })
  it('uses the formal write permission for every referenced property and preserves the proposed headers on fresh denial',async()=>{
    const {f,owner,rename,writes}=await setup();await rename({F1:'id'});f.denyFieldProperty('ValueFun')
    await expect(owner.save()).rejects.toThrow(/不可写/);expect(writes()).toHaveLength(0)
    expect(owner.headers().find(h=>h.id==='F1')?.name).toBe('id');expect(owner.getState().status).toBe('idle')
    owner.discard();expect(owner.headers().find(h=>h.id==='F1')?.name).toBe('code')
  })
  it.each([
    [{Type:'GetRefData',RefTableName:'Orders',RefFieldName:'code',FkFieldName:'name'}, {RefFieldName:'id',FkFieldName:'label'}],
    [{Type:'GetGroupData',GroupTableName:'Orders',GroupField:'code',Field:'name'}, {GroupField:'id',Field:'label'}],
  ])('preserves structured %j value-function members while migrating referenced fields',async(value,expected)=>{
    const {f,owner,rename,writes}=await setup({sourceFields:[
      {rowid:'F1',dataModelId:'M1',Name:'code',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1,Order:0},
      {rowid:'F2',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1,Order:1},
      {rowid:'F3',dataModelId:'M2',Name:value.Type==='GetRefData'?'inputReference':'reference',type:value.Type==='GetRefData'?'inputParams':'dataModel',FieldType:value.Type==='GetRefData'?'string':'计算字段',IsPKey:0,IsOutput:1,ValueFun:JSON.stringify({...value,Extra:{Field:'code'}})},
      ...value.Type==='GetRefData'?[{rowid:'F4',dataModelId:'M2',Name:'reference',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1}]:[],
    ]})
    await rename({F1:'id',F2:'label'});await owner.save();expect(writes()).toHaveLength(1)
    const row=(await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!.rows.find(r=>r['rowid']==='F3')!
    expect(JSON.parse(String(row['ValueFun']))).toEqual({...value,...expected,Extra:{Field:'code'}})
  })
  it.each(['Orders', 'PhysicalOrders'])('does not rename physical columns in %s with array metadata fields', async source => {
    const raw = ` {"Type":"GetRefData","RefTableName":"${source}","RefFieldName":"code","FkFieldName":"name","Extra":0} `
    const {f, owner, rename, writes} = await setup({sourceFields: [
      {rowid:'F1',dataModelId:'M1',Name:'code',type:'dataModel',FieldType:'string',IsPKey:1,IsOutput:1,Order:0},
      {rowid:'F2',dataModelId:'M1',Name:'name',type:'dataModel',FieldType:'string',IsPKey:0,IsOutput:1,Order:1},
      {rowid:'F3',dataModelId:'M2',Name:'reference',type:'dataModel',FieldType:'计算字段',IsPKey:0,IsOutput:1,ValueFun:raw},
    ]})
    await rename({F1:'id',F2:'label'}); await owner.save()
    const saved = (await f.open('A')).metadataDataSet.getView('Base_DataModel_Field')!
    expect(saved.rows.find(row => row['rowid'] === 'F1')?.['Name']).toBe('id')
    expect(saved.rows.find(row => row['rowid'] === 'F3')?.['ValueFun']).toBe(raw)
    expect(writes()).toHaveLength(1)
    expect(JSON.stringify(writes()[0]?.data)).not.toContain('"rowid":"F3"')
  })
  it('verifies a lost receipt without repeating the field and reference batch',async()=>{
    const {f,owner,rename,writes}=await setup();await rename({F1:'id'});f.loseNextResponse()
    await expect(owner.save()).rejects.toThrow();expect(owner.getState().status).toBe('unknown')
    expect(await owner.verify()).toBe(true);expect(writes()).toHaveLength(1)
  })
  it('keeps partial field writes unresolved and does not repair references by replaying',async()=>{
    const {f,owner,rename,writes}=await setup({omitFieldProperties:['Name']});await rename({F1:'id'})
    await expect(owner.save()).rejects.toThrow(/回读/);expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification.join()).toContain('F1');expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
    owner.acceptCurrent();expect(owner.getState().pending).toBe(false)
  })
  it('detects a concurrent new definition even when swapped old names are still valid field names',async()=>{
    const {f,owner,rename,writes}=await setup();await rename({F1:'name',F2:'code'})
    const release=f.holdModelResponse(),saving=owner.save();await new Promise(resolve=>setTimeout(resolve,0))
    f.created.set('Base_DataModel_Field',[{rowid:'LATE',dataSetId:'A',dataModelId:'M2',Name:'late',type:'inputParams',ValueFun:'{"Type":"GetTableField","Field":"Orders.code"}'}])
    release();await expect(saving).rejects.toThrow(/回读/);expect(await owner.verify()).toBe(false)
    expect(owner.getState().verification.join()).toContain('定义集合已变化');expect(writes()).toHaveLength(1)
  })
  it.each([false,true])('migrates configured view references after database confirmation and reopens the renamed array; lost file receipt=%s',async lost=>{
    const {f,writes}=await setup({missing:false})
    const config=JSON.parse(f.stored.get('A')!);Object.assign(config.tables.OrdersAlias.views.shared,{valueField:['code','name'],labelField:'name',
      sortExpression:[{field:'code',direction:'asc'}],filterExpression:{field:'code',operator:'eq',value:'a'},aggregates:{code:{type:'count'}}})
    f.stored.set('A',JSON.stringify(config))
    const fresh=await f.open('A'),current=fresh.getArrayEdit('M1'),draft=current.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:h.id==='F1'?'id':'label'}))))
    draft.applyHeaders();await current.applyHeaders(draft.definition());draft.dispose()
    if(lost){f.loseNextFileResponse();await expect(current.save()).rejects.toThrow();expect(current.getState().status).toBe('configuration');expect(await current.verify()).toBe(true)}
    else await current.save()
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
    const reopened=await f.open('A'),view=reopened.definitionDataSet!.getView('OrdersAlias','shared')!
    expect((await view.loadFromServer()).success).toBe(true);expect(view.rows).toMatchObject([{id:'a',label:'A'}])
    const saved=JSON.parse(f.stored.get('A')!).tables.OrdersAlias.views.shared
    expect(saved).toMatchObject({valueField:['id','label'],labelField:'label',sortExpression:[{field:'id'}],filterExpression:{field:'id',value:'a'},aggregates:{code:{field:'id'}}})
    expect(current.getState().pending).toBe(false)
  })
  it('migrates field swaps exactly once together with the registered model name',async()=>{
    const {f,writes}=await setup({missing:false})
    const config=JSON.parse(f.stored.get('A')!);Object.assign(config.tables.OrdersAlias.views.shared,{valueField:['code','name'],labelField:'name'});f.stored.set('A',JSON.stringify(config))
    const fresh=await f.open('A'),current=fresh.getArrayEdit('M1'),draft=current.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:h.id==='F1'?'name':'code'}))))
    draft.applyHeaders();await current.applyHeaders(draft.definition());draft.dispose();fresh.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1','Name','LocalOrders')
    f.loseNextFileResponse();await expect(current.save()).rejects.toThrow();expect(current.getState().status).toBe('configuration');expect(await current.verify()).toBe(true)
    expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(1)
    expect(JSON.parse(f.stored.get('A')!).tables.OrdersAlias).toMatchObject({modelBinding:{modelName:'LocalOrders'},views:{shared:{valueField:['name','code'],labelField:'code'}}})
  })
  it.each([false,true])('projects tree, filters, stable field projections, native relations and both cascade kinds without changing constants; imported=%s', imported=>{
    const model={rowid:'M1',Name:'Orders',MetaName:'ArraySource',Type:'数组',PrimaryKeyFields:'code'},rows=[
      {rowid:'F1',dataModelId:'M1',Name:'code',IsPKey:1,IsOutput:1,type:'dataModel',FieldType:'string'},
      {rowid:'F2',dataModelId:'M1',Name:'name',IsPKey:0,IsOutput:1,type:'dataModel',FieldType:'string'},
    ],original=DataSpaceDesignApi.projectModel(model,rows,''),candidate=DataSpaceDesignApi.projectModel({...model,PrimaryKeyFields:'id'},rows.map(row=>({...row,Name:row.rowid==='F1'?'id':'label'})),'')
    const projection={fieldId:'F1',resourceFieldId:'F1',resourceField:'code',viewField:'code',source:'resource',type:'string',label:'code',primaryKey:true,output:true,distinct:false,
      sortOrder:0,sortDirection:null,group:0,value:'code',valueFunction:'',expression:''}
    const config=new ScenarioViewConfig('A',JSON.stringify({scenarioId:'A',...(imported?{schemaVersion:2}:{}),tables:{
      OrdersAlias:{modelBinding:{modelId:'M1',modelName:'Orders'},columns:[{name:'code',required:true}],views:{default:{valueField:'code',treeConfig:{idField:'code',parentIdField:'name',textField:'name'},
        queryConfig:{outputType:'SelfRefData',fields:['code','name'],tree:{keyField:'code',parentField:'name',nodeId:'code'}},fieldProjection:[projection],filterExpression:JSON.stringify({field:'code',operator:'eq',value:{Type:'GetConstValue',Value:{field:'code'}}})}}},
      Other:{modelBinding:{modelId:'M2',modelName:'Other'},views:{default:{valueField:'code',queryConfig:{filterLookups:[{field:'code',sourceViewKey:'A@Orders@default',matchField:'name',valueField:'code'}]}}}}},
      resourceRelations:[{relationId:'N',...(imported?{sourceRelationId:'LEGACY'}:{}),parentTable:'OrdersAlias',childTable:'Other',filterExpression:{field:'code',operator:'eq',value:{Type:'GetTableField',Field:'OrdersAlias.code'}}}],
      viewCascades:[{kind:'query',cascadeId:'Q',parentTable:'OrdersAlias',parentViewId:'default',childTable:'Other',childViewId:'default',when:[{field:'name',equals:'code'}],
        filterBindings:[{sourceField:'code',targetField:'code',operator:'eq'}],inputBindings:[{sourceField:'name',target:'queryContext',format:'json',when:{field:'code',equals:'name'}}]},
      {kind:'field',cascadeId:'F',tableName:'OrdersAlias',viewId:'default',targetField:'name',valueFormat:'native',parents:[{tableName:'OrdersAlias',viewId:'default',field:'code',parameter:'code'}],optionsView:{tableName:'Other',viewId:'default'},valuePolicy:{mode:'retain'}}]}))
    const actual=LowcodeDataSpaceArrayConfiguration.rewrite(config,{original,candidate,changes:[],removals:[],references:[]}).toJSON()
    expect(actual).toMatchObject({tables:{OrdersAlias:{columns:[{name:'id'}],views:{default:{valueField:'id',treeConfig:{idField:'id',parentIdField:'label',textField:'label'},
      queryConfig:{fields:['id','label'],tree:{keyField:'id',parentField:'label',nodeId:'code'}},fieldProjection:[{resourceField:'id',viewField:'id',label:'code',value:'code'}]}}},Other:{views:{default:{valueField:'code',queryConfig:{filterLookups:[{field:'code',sourceViewKey:'A@Orders@default',matchField:'label',valueField:'id'}]}}}}},
      resourceRelations:[{filterExpression:{field:'code',value:{Field:'OrdersAlias.id'}}}],viewCascades:[{when:[{field:'label',equals:'code'}],filterBindings:[{sourceField:'id',targetField:'code'}],inputBindings:[{sourceField:'label',when:{field:'id',equals:'name'}}]},
        {targetField:'label',parents:[{field:'id',parameter:'code'}]}]})
    expect(JSON.stringify(actual)).toContain('GetConstValue');expect(JSON.stringify(actual)).toContain('\\"field\\":\\"code\\"')
    expect(config.toJSON()).toMatchObject({tables:{OrdersAlias:{columns:[{name:'code'}]}}})
  })
  it('migrates inherited static tool fields with scoped overrides and does not replay a lost tool save',async()=>{
    const files=new Map<string,string>(),saves:string[]=[];let lose=true
    files.set('ONE/rule.json',JSON.stringify({type:'r-table',props:{dataViewKey:'A@Orders@shared'},children:[
      {type:'r-text',props:{field:'code',label:'code',header:{type:'r-text',props:{field:'name'}}}},{type:'r-text',props:{field:'name'}},
      {type:'r-text',props:{dataViewKey:'B@Orders@shared',field:'code'}},
      {type:'r-json',props:{field:'document',mode:'rows',children:[{type:'r-text',props:{field:'code'}}]},children:[{type:'r-text',props:{field:'name'}}]},
    ]}));files.set('ONE/script.js','');files.set('ONE/style.css','')
    const {owner,rename,writes}=await setup({pageFiles:{readPageFile:async command=>files.get(`${command.pageId}/${command.fileName}`)??'',
      saveFileContent:async(id,name,text)=>{files.set(`${id}/${name}`,text);saves.push(`${id}/${name}`);if(lose){lose=false;throw new Error('tool receipt lost')}}},
      blueprint:{}, blueprintTreeProjection:()=>({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[{
        nodeId:'ONE',parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{},navigation:{target:'cfg:ONE',title:'One',order:0,publishInMenu:true,showChildren:true,beginGroup:false},
      }]})})
    await rename({F1:'name',F2:'code'});await expect(owner.save()).rejects.toThrow('tool receipt lost');expect(owner.getState().status).toBe('configuration')
    expect(await owner.verify()).toBe(true);expect(saves).toEqual(['ONE/rule.json']);expect(writes()).toHaveLength(1)
    expect(JSON.parse(files.get('ONE/rule.json')!)).toMatchObject({props:{dataViewKey:'A@Orders@shared'},children:[
      {props:{field:'name',label:'code',header:{props:{field:'code'}}}},{props:{field:'code'}},{props:{field:'code',dataViewKey:'B@Orders@shared'}},
      {props:{field:'document',children:[{props:{field:'code'}}]},children:[{props:{field:'name'}}]},
    ]})
  })
  it('preserves a fixed output alias',()=>{
    const model={rowid:'M1',Name:'Orders',MetaName:'ArraySource',Type:'数组',PrimaryKeyFields:'code'},row={rowid:'F1',dataModelId:'M1',Name:'code',AsName:'publicId',type:'dataModel',FieldType:'string',IsOutput:1,IsPKey:1}
    const original=DataSpaceDesignApi.projectModel(model,[row],''),candidate=DataSpaceDesignApi.projectModel({...model,PrimaryKeyFields:'id'},[{...row,Name:'id'}],'')
    const config=new ScenarioViewConfig('A',JSON.stringify({scenarioId:'A',tables:{Local:{modelBinding:{modelId:'M1',modelName:'Orders'},views:{default:{valueField:'publicId'}}}}}))
    expect(LowcodeDataSpaceArrayConfiguration.rewrite(config,{original,candidate,changes:[],removals:[],references:[]}).toJSON()).toEqual(config.toJSON())
  })
  it('preserves concurrent scene changes after the database write without replaying the batch',async()=>{
    const {f,writes}=await setup({missing:false});const config=JSON.parse(f.stored.get('A')!);config.tables.OrdersAlias.views.shared.valueField='code';f.stored.set('A',JSON.stringify(config))
    const fresh=await f.open('A'),current=fresh.getArrayEdit('M1'),draft=current.beginHeaders();draft.beginHeaders()
    draft.view.updateEditingValue('array','headerDraft',JSON.stringify(draft.headers().map(h=>({...h,name:h.id==='F1'?'id':h.name}))));draft.applyHeaders();await current.applyHeaders(draft.definition());draft.dispose()
    const release=f.holdModelResponse(),saving=current.save();await new Promise(resolve=>setTimeout(resolve,0))
    config.tables.OrdersAlias.views.shared.pageSize=99;const changed=JSON.stringify(config);f.stored.set('A',changed);release()
    await expect(saving).rejects.toThrow(/配置已变化/);expect(current.getState().status).toBe('configuration')
    await expect(current.verify()).rejects.toThrow(/冲突/);expect(f.stored.get('A')).toBe(changed);expect(writes()).toHaveLength(1);expect(f.fileWrites).toHaveLength(0)
  })
})
