import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {createMemoryHistory,createRouter} from 'vue-router'
import ElementPlus, {ElSelect} from 'element-plus'
import {DataSet,type DataView,type QueryParams,type DataViewFilterTree} from '@spark-appworks/spark-data'
import {Spark,FieldText,FieldSelect,RendererButton,RendererTable,RendererFilter,RendererToolbar,RendererForm} from '@spark-appworks/spark-component'
import RendererFieldScope from '../../../../packages/spark-component/src/components/containers/support/scope/RendererFieldScope.vue'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
const {executeQuery,loadScenario,readRequestScope,openDesign}=vi.hoisted(()=>({executeQuery:vi.fn(),loadScenario:vi.fn(),openDesign:vi.fn(),
  readRequestScope:vi.fn(()=>({token:'scope-a',headers:{'X-AppId':'app-a'}}))}))
vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{readRequestScope,dataSpace:{runtime:{executeQuery,save:vi.fn()}}}}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',()=>({loadLowcodeRuntimeScenario:loadScenario}))
vi.mock('@/lowcode/data-space/lowcode-data-space-design',()=>({openLowcodeDataSpaceDesignSession:openDesign}))
// 列表页单独挂载、无系统页实例；只替换未保存来源登记，设计会话仍经 openDesign 观察目标 ID。
vi.mock('@spark-appworks/spark-app',async importOriginal=>({...await importOriginal<Record<string,unknown>>(),useSystemPageDirtySource:()=>undefined}))
import {LowcodeDataSpaceCatalog} from '@/lowcode/data-space/lowcode-data-space-catalog'
import CatalogPage from '@/views/features/data-platform/data-set-management/ui/data-set-list-page.vue'
const disposals:Array<()=>void>=[],originalStubs=config.global.stubs
const models={Base_DataSet:['rowid','Name','Type','description','sysid','createuser','createtime'],
  Base_AppSystemList:['rowid','AppDesc','AppName'],Base_UserInfo:['ID','ROWID','rowid','UserName'],
  Base_NavigationInfo:['rowid','SysId','conid','prowid','FunName','name','NavigationUrl']}
// 与线上导航模型一致：conid 只能作服务端过滤（output=false），查询结果不返回。
const navigationProjection=models.Base_NavigationInfo.map((field,index)=>({fieldId:field.toUpperCase(),source:'resource',resourceFieldId:field.toUpperCase(),
  resourceField:field,viewField:field,type:'string',label:field,output:field!=='conid',sortOrder:index,sortDirection:null,group:0,distinct:false,
  primaryKey:index===0,value:'',valueFunction:'',expression:''}))
function dataset(scenarioId='SCENE') {
  return DataSet.fromJson({scenarioId,dataSetName:scenarioId,tables:Object.fromEntries(Object.entries(models).map(([name,fields])=>[name,{
    modelBinding:{modelId:`M-${name}`,modelName:name},resourceType:'database-table',resourceId:name,
    columns:fields.map((field,index)=>({name:field,type:'string',isPrimaryKey:index===0})),
    views:{default:{autoLoad:false,...(name==='Base_NavigationInfo'?{fieldProjection:navigationProjection}:{})},[name==='Base_DataSet'?'catalog':name==='Base_UserInfo'?'catalogUsers':'catalogApps']:{autoLoad:false,
      ...(name==='Base_DataSet'?{commitMode:'staged',pageSize:10,sortExpression:[{field:'createtime',direction:'desc'}]}:{})}},
  }]))})
}
function context(view:DataView,rows:readonly Record<string,unknown>[],opts:{count?:boolean;total?:number;key?:string}={}) {
  const table=new DataSpaceQueryTable({scenarioId:view.dataSet!.scenarioId!,metaName:view.tableName})
  return new DataSpaceQueryContext({identity:table.identity,scope:'scope-a',readScope:()=>readRequestScope().token,
    snapshot:table.applyResult({Result:{primaryKeyField:opts.key??(view.tableName==='Base_UserInfo'?'ID':'rowid'),allowAdd:false,
      data:{Items:rows,Count:opts.count===false?undefined:opts.total??rows.length,hasNextPage:false,Action:[]}}})})
}
const defaults:Record<string,Record<string,unknown>[]>= {
  Base_DataSet:[{rowid:'TARGET',Name:'Directory item',Type:'datasource',sysid:'APP',createuser:'USER',createtime:'2026-01-01'}],
  Base_AppSystemList:[{rowid:'APP',AppDesc:'',AppName:'Application'}],Base_UserInfo:[{ID:'PERMISSION-USER',rowid:'USER',UserName:'Creator'}],
}
function writable() {
  const rowsByModel=structuredClone(defaults)
  let afterWrite: (()=>void)|undefined
  executeQuery.mockImplementation(async(view:DataView)=> {
    const rows=(rowsByModel[view.tableName]??[]).map(row=>({...row,lingma_sys_params:{e:['Name','description'],d:true,r:[],h:[],m:[]}}))
    const table=new DataSpaceQueryTable({scenarioId:view.dataSet!.scenarioId!,metaName:view.tableName})
    return new DataSpaceQueryContext({identity:table.identity,scope:'scope-a',readScope:()=>readRequestScope().token,
      snapshot:table.applyResult({Result:{primaryKeyField:view.tableName==='Base_UserInfo'?'ID':'rowid',allowAdd:true,
        data:{Items:rows,Count:rows.length,hasNextPage:false,Action:[]}}})})
  })
  const pending=new Set<unknown>();let writes=0
  // 与实际执行器同一契约：写入后结果未确认则登记；再次提交只按主键核验，不重放写入。
  const hasUnconfirmedSave=(context:unknown)=>pending.has(context)
  const save=vi.fn(async(command:Parameters<NonNullable<Parameters<DataView['bindQueryExecutor']>[0]['save']>>[0])=>{
    if(command.changes.some(change=>pending.has(change.context)))return command.changes.map(change=>{
      pending.delete(change.context)
      if(!(change.context instanceof DataSpaceQueryContext))throw Error('Expected formal query context')
      const rows=rowsByModel[change.identity.metaName]??[],requested=change.context.prepareSaveChanges(structuredClone(change.changes))
      const pick=(row:Record<string,unknown>)=>rows.find(item=>item['rowid']===row['rowid'])??{}
      return change.context.acceptSaveReceipt({requested,receipt:{metaName:change.identity.metaName,added:(requested.added??[]).map(pick),changed:(requested.changed??[]).map(pick),deleted:[...(requested.deleted??[])]}})
    })
    return command.changes.map(change=>{
      if(!(change.context instanceof DataSpaceQueryContext))throw Error('Expected formal query context')
      const rows=rowsByModel[change.identity.metaName]??=[]
      const requests=change.context.buildSaveRequest(change.changes)
      const added:Record<string,unknown>[]=[],changed:Record<string,unknown>[]=[],deleted:Record<string,unknown>[]=[]
      writes++
      for(const request of requests) {
        for(const row of request.CrudModel.Added){const result={...row,createuser:'USER',createtime:'2026-10-15'};rows.push(result);added.push(result)}
        for(const row of request.CrudModel.Changed){const original=rows.find(item=>item['rowid']===row['rowid']);if(!original)throw Error('Missing row');Object.assign(original,row);changed.push(row)}
        for(const row of request.CrudModel.Deleted){const i=rows.findIndex(item=>item['rowid']===row['rowid']);if(i<0)throw Error('Missing row');rows.splice(i,1);deleted.push(row)}
      }
      try{afterWrite?.()}catch(error){command.changes.forEach(item=>pending.add(item.context));throw error}
      return change.context.acceptSaveReceipt({requested:change.changes,receipt:{metaName:change.identity.metaName,added,changed,deleted}})
    })
  })
  loadScenario.mockImplementation(({scenarioId}:{scenarioId:string})=>{
    const dataSet=dataset(scenarioId)
    for(const name of Object.keys(models))dataSet.getTable(name)!.forEachView(view=>view.bindQueryExecutor({executeQuery,save,hasUnconfirmedSave}))
    return Promise.resolve(dataSet)
  })
  return {save,rows:rowsByModel['Base_DataSet']!,get writes(){return writes},onWrite(fn:()=>void){afterWrite=fn}}
}
function calls(name:string) {return executeQuery.mock.calls.filter(([view])=>view.tableName===name)}
function last(name='Base_DataSet'):QueryParams {return calls(name).at(-1)![1] as QueryParams}
async function owner() {const value=await LowcodeDataSpaceCatalog.load({projectId:'app-a',scenarioId:'SCENE'});disposals.push(()=>value.dispose());return value}
function button(wrapper:ReturnType<typeof mount>,text:string) {const found=wrapper.findAll('button').find(item=>item.text()===text);if(!found)throw new Error(`Missing ${text}`);return found}
const path='/t/TENANT/app-a/features/data-platform/data-set-management/ui/data-set-list-page'
async function page(scenarioId='SCENE') {
  const router=createRouter({history:createMemoryHistory(),routes:[{path,component:CatalogPage,meta:{blueprintScenarioId:scenarioId}},
    {path:'/t/TENANT/app-a/second',component:CatalogPage,meta:{blueprintScenarioId:'OTHER'}}]})
  await router.push(`${path}?scenarioId=UNTRUSTED&__sparkNavigationId=node`)
  const registry=Spark.createRegistry()
  for(const [type,component] of [['r-text',FieldText],['r-select',FieldSelect],['r-button',RendererButton],['r-filter',RendererFilter],['r-toolbar',RendererToolbar]] as const)registry.register({type,component})
  registry.register({type:'r-field-scope',component:RendererFieldScope})
  const wrapper=mount(CatalogPage,{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin({registry})]}})
  disposals.push(()=>wrapper.unmount());await flushPromises();return {router,wrapper}
}
beforeEach(()=>{
  executeQuery.mockReset();loadScenario.mockReset();readRequestScope.mockReset();openDesign.mockReset()
  readRequestScope.mockReturnValue({token:'scope-a',headers:{'X-AppId':'app-a'}})
  loadScenario.mockImplementation(({scenarioId}:{scenarioId:string})=>{
    const dataSet=dataset(scenarioId)
    for(const name of Object.keys(models))dataSet.getTable(name)!.forEachView(view=>view.bindQueryExecutor({executeQuery}))
    return Promise.resolve(dataSet)
  })
  executeQuery.mockImplementation(async(view:DataView)=>context(view,defaults[view.tableName]??[],view.tableName==='Base_DataSet'?{total:25}:{}))
  config.global.stubs={...originalStubs}
  for(const key of ['el-table','el-table-column','SparkComponentRenderer','spark-component-renderer'])delete config.global.stubs[key]
  vi.stubGlobal('ResizeObserver',class {observe(){}unobserve(){}disconnect(){}})
})
afterEach(()=>{disposals.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
describe('native DataView catalog',()=>{
  it.each(['count','missing','duplicate','wrong-key','non-scalar'] as const)('rejects application %s while keeping the catalog available',async kind=>{
    executeQuery.mockImplementation(async(view:DataView)=>view.tableName!=='Base_AppSystemList'?context(view,defaults[view.tableName]??[]):
      context(view,kind==='missing'?[{AppDesc:'missing'}]:kind==='duplicate'?[{rowid:'DUP'},{rowid:'DUP'}]:
        [{rowid:'APP',AppDesc:kind==='non-scalar'?{}:'name'}],{count:kind!=='count',...(kind==='wrong-key'?{key:'other'}:{})}))
    const value=await owner();await value.initialize();expect(value.apps.loadingError).not.toBeNull();expect(value.view.loadingError).toBeNull()
  })
  it('honors application key/title permissions and does not fall through a masked title',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_AppSystemList'?[
      {rowid:'MASK',AppDesc:'SECRET',AppName:'NO-FALLBACK',lingma_sys_params:{m:['AppDesc']}},
      {rowid:'HIDE',AppDesc:'NO-IDENTITY',lingma_sys_params:{h:['rowid']}},
      {rowid:'FALLBACK',AppDesc:'',AppName:'Fallback'},
    ]:defaults[view.tableName]??[]))
    const value=await owner();await value.initialize();expect(value.applicationLabel('MASK')).toBe('••••')
    expect(value.applicationLabel('HIDE')).toBe('未解析应用');expect(value.applicationLabel('FALLBACK')).toBe('Fallback')
  })
  it('rejects an application mismatch before reading formal configuration',async()=>{
    await expect(LowcodeDataSpaceCatalog.load({projectId:'other',scenarioId:'SCENE'})).rejects.toThrow('所属应用已失效')
    expect(loadScenario).not.toHaveBeenCalled()
  })
  it('discards a delayed user lookup after a newer list query',async()=>{
    let release!:(value:DataSpaceQueryContext)=>void,users!:DataView,attempts=0
    const pending=new Promise<DataSpaceQueryContext>(resolve=>{release=resolve})
    executeQuery.mockImplementation(async(view:DataView)=>{
      if(view.tableName==='Base_UserInfo'){users=view;return pending}
      return context(view,view.tableName==='Base_DataSet'?(++attempts===1?[{rowid:'OLD',createuser:'USER'}]:[{rowid:'NEW'}]):[])
    })
    const value=await owner(),first=value.view.refresh();await flushPromises();await value.view.refresh()
    release(context(users,[{ID:'P',ROWID:'USER',UserName:'Old'}]));await first
    expect(value.view.rows[0]?.['rowid']).toBe('NEW');expect(value.view.loadingError).toBeNull();expect(value.unresolvedCreatorCount).toBe(0)
  })
  it('loads formal views, retains native values and uses the same view for filtering and paging',async()=>{
    const value=await owner();await value.initialize()
    expect(loadScenario).toHaveBeenCalledWith({projectId:'app-a',scenarioId:'SCENE'})
    expect(value.view).toBe(value.dataSet.getView('Base_DataSet','catalog'));expect(value.view.rows[0]?.['createuser']).toBe('USER')
    expect(value.creatorLabel('USER')).toBe('Creator');expect(value.applicationLabel('APP')).toBe('Application')
    expect(last().sort).toBe('createtime:desc');expect(last().pageSize).toBe(10);expect(value.view.total).toBe(25)
    const filter:DataViewFilterTree={logic:'and',filters:[{logic:'or',filters:[{field:'Name',operator:'contains',value:'needle'},
      {field:'rowid',operator:'eq',value:'needle'}]},{field:'sysid',operator:'eq',value:'APP'}]}
    await value.view.executeFilter(filter);await value.view.setPage(2);expect(last()).toMatchObject({page:2,filter})
    expect(last('Base_UserInfo')).toMatchObject({allPages:true,fields:['ID','ROWID','UserName'],filter:{field:'ROWID',operator:'in',value:['USER']}})
    await value.view.executeFilter(undefined);expect(last()).not.toHaveProperty('filter')
  })
  it.each(['count','missing','duplicate','wrong-key','non-scalar'] as const)('rejects catalog %s failures',async kind=>{
    executeQuery.mockImplementation(async(view:DataView)=>view.tableName!=='Base_DataSet'?context(view,[]):
      context(view,kind==='missing'?[{Name:'missing'}]:kind==='duplicate'?[{rowid:'DUP'},{rowid:'DUP'}]:
        [{rowid:'ROW',Name:kind==='non-scalar'?{}:'name'}],{count:kind!=='count',...(kind==='wrong-key'?{key:'other'}:{})}))
    const value=await owner();await value.initialize();expect(value.view.loadingError).not.toBeNull();expect(value.designTarget()).toBe('')
  })
  it.each(['missing','duplicate','wrong-key','non-scalar','conflicting-alias','count'] as const)('rejects user directory %s without claiming list success',async kind=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_UserInfo'?
      kind==='missing'?[{ROWID:'USER'}]:kind==='duplicate'?[{ID:'DUP',ROWID:'USER'},{ID:'DUP',ROWID:'USER'}]:
      [{ID:'P',ROWID:'USER',...(kind==='conflicting-alias'?{rowid:'DIFFERENT'}:{}),UserName:kind==='non-scalar'?{}:'name'}]:defaults[view.tableName]??[],
      view.tableName==='Base_UserInfo'?{count:kind!=='count',...(kind==='wrong-key'?{key:'ROWID'}:{})}:{}))
    const value=await owner();await value.initialize();expect(value.view.loadingError).not.toBeNull()
  })
  it('consumes both permissions, rejects ambiguous associations and never uses user permission IDs as business IDs',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_DataSet'?[
      {rowid:'A',createuser:'VISIBLE'},{rowid:'B',createuser:'MISSING'},{rowid:'C',createuser:'MASKED',lingma_sys_params:{m:['createuser']}},
      {rowid:'D',createuser:'HIDDEN',lingma_sys_params:{h:['createuser']}},{rowid:'E',createuser:'VISIBLE'},
      {rowid:'F',createuser:'DUP'},{rowid:'G',createuser:'MASK-NAME'},{rowid:'H',createuser:'HIDE-NAME'},{rowid:'I',createuser:'HIDE-ASSOCIATION'},
    ]:view.tableName==='Base_UserInfo'?[
      {ID:'PERMISSION-VISIBLE',rowid:'VISIBLE',UserName:'Ada'},{ID:'P1',ROWID:'DUP',UserName:'First'},{ID:'P2',ROWID:'DUP',UserName:'Second'},
      {ID:'P3',ROWID:'MASK-NAME',UserName:'SECRET',lingma_sys_params:{m:['UserName']}},
      {ID:'P4',ROWID:'HIDE-NAME',UserName:'HIDDEN',lingma_sys_params:{h:['UserName']}},
      {ID:'HIDE-ASSOCIATION',ROWID:'HIDE-ASSOCIATION',UserName:'NEVER',lingma_sys_params:{h:['ROWID']}},
    ]:[]))
    const value=await owner();await value.initialize()
    expect(last('Base_UserInfo').filter).toEqual({field:'ROWID',operator:'in',value:['VISIBLE','MISSING','DUP','MASK-NAME','HIDE-NAME','HIDE-ASSOCIATION']})
    expect(value.creatorLabel('VISIBLE')).toBe('Ada');expect(value.creatorLabel('DUP')).toBe('未解析用户')
    expect(value.creatorLabel('MASK-NAME')).toBe('••••');expect(value.creatorLabel('HIDE-NAME')).toBe('')
    expect(value.creatorLabel('HIDE-ASSOCIATION')).toBe('未解析用户');expect(value.unresolvedCreatorCount).toBe(3)
  })
  it('does not query users when source identities are empty or unreadable',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_DataSet'?
      [{rowid:'A',createuser:'MASKED',lingma_sys_params:{m:['createuser']}},{rowid:'B'}]:[]))
    const value=await owner();await value.initialize();expect(calls('Base_UserInfo')).toHaveLength(0)
  })
  it.each(['success','failure'] as const)('keeps the newest result after an earlier query %s',async outcome=>{
    let resolve!:(value:DataSpaceQueryContext)=>void,reject!:(error:Error)=>void,oldView!:DataView,count=0
    const pending=new Promise<DataSpaceQueryContext>((yes,no)=>{resolve=yes;reject=no})
    executeQuery.mockImplementation(async(view:DataView)=>{if(view.tableName==='Base_DataSet'&&++count===1){oldView=view;return pending}
      return context(view,view.tableName==='Base_DataSet'?[{rowid:'NEW',Name:'Latest'}]:[])})
    const value=await owner(),first=value.view.refresh();await flushPromises();await value.view.refresh()
    if(outcome==='success')resolve(context(oldView,[{rowid:'OLD',Name:'Stale'}]));else reject(new Error('Old failure'))
    await first;expect(value.view.rows[0]?.['Name']).toBe('Latest');expect(value.view.loadingError).toBeNull()
  })
  it('rejects stale selected row identities and changed execution scopes',async()=>{
    const value=await owner();await value.initialize();const row=value.view.rows[0]!
    value.view.setSelectedRows([row]);expect(value.designTarget()).toBe('TARGET')
    await value.view.refresh();expect(value.designTarget(row)).toBe('')
    readRequestScope.mockReturnValue({token:'other',headers:{'X-AppId':'app-a'}});expect(value.isCurrent()).toBe(false);expect(value.designTarget()).toBe('')
  })
})
describe('catalog original-view mutations',()=>{
  async function selected(){const value=await owner();await value.initialize();value.view.setSelectedRows([value.view.rows[0]!]);return value}
  it('saves one original row and consumes the same result after independent reopening',async()=>{
    const server=writable(),value=await selected();value.beginEdit();value.view.updateEditingValue('TARGET','Name',' Renamed ')
    await value.saveEdit();expect(server.save).toHaveBeenCalledTimes(1);expect(value.editing).toBeUndefined()
    expect(server.rows[0]).toMatchObject({Name:'Renamed',Type:'datasource',sysid:'APP'})
    const reopened=await owner();await reopened.initialize();expect(reopened.view.rows[0]?.['Name']).toBe('Renamed')
  })
  it('creates only the configured fields, then reloads server creator/time',async()=>{
    const server=writable(),value=await selected();await value.beginCreate();const id=value.editing!.id
    value.view.updateEditingValue(id,'Name','New space');value.view.updateEditingValue(id,'sysid','APP')
    value.view.updateEditingValue(id,'description','Details');await value.saveEdit()
    expect(server.save).toHaveBeenCalledTimes(1);expect(server.rows).toHaveLength(2)
    expect(value.view.rows.find(row=>row['rowid']===id)).toMatchObject({Name:'New space',Type:'datasource',sysid:'APP',createuser:'USER',createtime:'2026-10-15'})
  })
  it('cancels a staged create without touching the server or other rows',async()=>{
    const server=writable(),value=await selected();await value.beginCreate();const id=value.editing!.id
    value.view.updateEditingValue(id,'Name','Discarded');value.cancelEdit()
    expect(server.save).not.toHaveBeenCalled();expect(value.view.rows).toHaveLength(1);expect(value.editing).toBeUndefined()
    expect(value.view.dirtyTracking.hasPendingChanges()).toBe(false)
  })
  it.each(['empty','length','application'] as const)('rejects invalid create %s before writing',async kind=>{
    const server=writable(),value=await selected();await value.beginCreate();const id=value.editing!.id
    value.view.updateEditingValue(id,'Name',kind==='empty'?'':kind==='length'?'N'.repeat(101):'New')
    value.view.updateEditingValue(id,'sysid',kind==='application'?'UNKNOWN':'APP')
    await expect(value.saveEdit()).rejects.toThrow();expect(server.save).not.toHaveBeenCalled();expect(value.editing).toMatchObject({unconfirmed:false,readbackFailed:false})
  })
  it('does not save unchanged edits or expand the editable property set',async()=>{
    const server=writable(),value=await selected();value.beginEdit();await value.saveEdit();expect(server.save).not.toHaveBeenCalled()
    value.beginEdit();value.view.updateEditingValue('TARGET','sysid','OTHER');await expect(value.saveEdit()).rejects.toThrow()
    expect(server.save).not.toHaveBeenCalled()
  })
  it('rejects an obsolete query and scope before committing',async()=>{
    const server=writable(),value=await selected();value.beginEdit();value.view.updateEditingValue('TARGET','Name','Obsolete')
    readRequestScope.mockReturnValue({token:'scope-b',headers:{'X-AppId':'app-a'}})
    await expect(value.saveEdit()).rejects.toThrow('STALE');expect(server.save).not.toHaveBeenCalled()
  })
  it('never replays an unknown write and verifies it through the original save entry',async()=>{
    const server=writable(),value=await selected();value.beginEdit();value.view.updateEditingValue('TARGET','Name','Applied')
    server.onWrite(()=>{throw Error('Network lost after write')});await expect(value.saveEdit()).rejects.toThrow()
    expect(value.editing?.unconfirmed).toBe(true);expect(()=>value.cancelEdit()).toThrow('核验')
    await value.saveEdit()
    expect(server.save).toHaveBeenCalledTimes(2);expect(server.writes).toBe(1);expect(value.view.rows[0]?.['Name']).toBe('Applied');expect(value.editing).toBeUndefined()
  })
  it('retains confirmed-write readback failure and retries only the read',async()=>{
    const server=writable(),value=await selected(),execute=executeQuery.getMockImplementation()!
    value.beginEdit();value.view.updateEditingValue('TARGET','Name','Applied')
    server.onWrite(()=>executeQuery.mockRejectedValue(Error('Read unavailable')))
    await expect(value.saveEdit()).rejects.toThrow('Read unavailable');expect(value.editing?.readbackFailed).toBe(true)
    executeQuery.mockImplementation(execute);await value.saveEdit();expect(server.save).toHaveBeenCalledTimes(1)
    expect(value.view.rows[0]?.['Name']).toBe('Applied')
  })
  it('keeps add/edit disabled for a formal read-only query',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,(defaults[view.tableName]??[]).map(row=>({...row,lingma_sys_params:{e:[],d:false}}))))
    const value=await selected();expect(value.canCreate()).toBe(false);expect(value.canEdit()).toBe(false)
    await expect(value.beginCreate()).rejects.toThrow();expect(()=>value.beginEdit()).toThrow()
  })
})

describe('catalog navigation bindings and API information',()=>{
  const parent={rowid:'PARENT',SysId:'APP',prowid:'000000',FunName:'Folder',name:'folder',NavigationUrl:''}
  const leaf={rowid:'LEAF',SysId:'APP',prowid:'PARENT',FunName:'Feature',name:'feature',NavigationUrl:'/feature'}
  function navigation(nodes:Record<string,unknown>[]=[parent,leaf],bound:Record<string,unknown>[]=[leaf]) {
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_NavigationInfo'
      ?view.viewId==='catalogBindings'?bound:nodes:defaults[view.tableName]??[]))
  }
  async function selected(){const value=await owner();await value.initialize();value.view.setSelectedRows([value.view.rows[0]!]);return value}
  it('uses formal derived views, preserves scope, and resolves complete ancestor paths',async()=>{
    navigation();const value=await selected(),source=value.dataSet.getView('Base_NavigationInfo')!
    source.filterExpression={field:'rowid',operator:'ne',value:'HIDDEN'}
    await value.queryBindings();expect(value.bindings).toBe(value.dataSet.getView('Base_NavigationInfo','catalogBindings'))
    expect(value.bindings?.rows).toMatchObject([leaf]);expect(value.bindingPath('LEAF')).toBe('Folder / Feature')
    expect(last('Base_NavigationInfo')).toMatchObject({allPages:true,filter:{logic:'and',filters:[source.filterExpression,{field:'SysId',operator:'eq',value:'APP'}]}})
    const bound=calls('Base_NavigationInfo')[0]![1] as QueryParams
    expect(bound.filter).toMatchObject({logic:'and',filters:[source.filterExpression,{field:'SysId',operator:'eq',value:'APP'},{field:'conid',operator:'eq',value:'TARGET'}]})
    expect(source.rows).toEqual([]);value.closeBindings();expect(value.bindings).toBeUndefined()
    expect(value.dataSet.getView('Base_NavigationInfo','catalogBindingAncestors')).toBeUndefined()
  })
  it('returns a real empty binding result without querying ancestors',async()=>{
    navigation([],[]);const value=await selected();await value.queryBindings()
    expect(value.bindings?.rows).toEqual([]);expect(calls('Base_NavigationInfo')).toHaveLength(1)
  })
  it.each(['missing','cycle','hidden','wrong-app'] as const)('rejects %s without publishing a partial binding view',async kind=>{
    navigation(kind==='missing'?[leaf]:kind==='cycle'?[{...parent,prowid:'LEAF'},leaf]:[parent,leaf],
      [{...leaf,...kind==='wrong-app'?{SysId:'OTHER'}:kind==='hidden'?{lingma_sys_params:{h:['prowid']}}:{}}])
    const value=await selected();await expect(value.queryBindings()).rejects.toThrow();expect(value.bindings).toBeUndefined()
  })
  it('rejects incomplete page counts instead of treating a truncated ancestor list as complete',async()=>{
    navigation();const execute=executeQuery.getMockImplementation()!
    executeQuery.mockImplementation(async(view:DataView,...args:unknown[])=>view.viewId==='catalogBindingAncestors'?context(view,[parent,leaf],{count:false}):execute(view,...args))
    const value=await selected();await expect(value.queryBindings()).rejects.toThrow('总数');expect(value.bindings).toBeUndefined()
  })
  it('does not publish delayed bindings after close',async()=>{
    navigation();const execute=executeQuery.getMockImplementation()!,value=await selected()
    let release!:(result:DataSpaceQueryContext)=>void,pendingView!:DataView
    executeQuery.mockImplementation(async(view:DataView,...args:unknown[])=>view.viewId==='catalogBindings'
      ?new Promise(resolve=>{release=resolve;pendingView=view}):execute(view,...args))
    const pending=value.queryBindings();await flushPromises();const response=context(pendingView,[leaf]);value.closeBindings();release(response)
    await expect(pending).rejects.toThrow();expect(value.bindings).toBeUndefined()
  })
  it('invalidates paths when the catalog selection or query row changes',async()=>{
    navigation();const value=await selected();await value.queryBindings();await value.view.refresh()
    expect(()=>value.bindingPath('LEAF')).toThrow('失效')
  })
  it('delegates API information to the existing formal session and always releases it',async()=>{
    const session={loadMetadataViews:vi.fn(),readApiInfo:vi.fn(async()=>'{"DataSetId":"TARGET"}'),dispose:vi.fn()}
    openDesign.mockResolvedValue(session);const value=await selected()
    expect(await value.readApiInfo()).toBe('{"DataSetId":"TARGET"}');expect(openDesign).toHaveBeenCalledWith('TARGET')
    expect(session.loadMetadataViews).toHaveBeenCalledWith(['Base_DataModel_Field']);expect(session.dispose).toHaveBeenCalledOnce()
    session.readApiInfo.mockRejectedValue(Error('Definition unavailable'));await expect(value.readApiInfo()).rejects.toThrow('Definition unavailable')
    expect(session.dispose).toHaveBeenCalledTimes(2)
  })
  it('rejects delayed API text after target changes and releases its original session',async()=>{
    let release!:(text:string)=>void
    const session={loadMetadataViews:vi.fn(),readApiInfo:vi.fn(()=>new Promise<string>(resolve=>{release=resolve})),dispose:vi.fn()}
    openDesign.mockResolvedValue(session);const value=await selected(),pending=value.readApiInfo();await flushPromises()
    value.view.setSelectedRows([]);release('obsolete');await expect(pending).rejects.toThrow('目标已变化');expect(session.dispose).toHaveBeenCalledOnce()
  })
})

describe('catalog page entry',()=>{
  it('offers original row actions on the bound row without a prior selection',async()=>{
    const {wrapper,router}=await page(),row=wrapper.get('tbody tr')
    const design=row.findAll('button').find(item=>item.text()==='设计')
    expect(design).toBeDefined();expect(design!.attributes('disabled')).toBeUndefined()
    const before=router.currentRoute.value.fullPath
    await design!.trigger('click');await flushPromises();expect(router.currentRoute.value.fullPath).toBe(before)
    await vi.waitFor(()=>expect(openDesign).toHaveBeenCalledWith('TARGET'),{timeout:20000})
  })
  it('targets the clicked row rather than a different selected row',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_DataSet'
      ?[defaults['Base_DataSet']![0]!,{...defaults['Base_DataSet']![0],rowid:'SECOND',Name:'Second'}]:defaults[view.tableName]??[]))
    const {wrapper,router}=await page(),rows=wrapper.findAll('tbody tr');await rows[0]!.trigger('click');await flushPromises()
    await rows[1]!.findAll('button').find(item=>item.text()==='设计')!.trigger('click');await flushPromises()
    await vi.waitFor(()=>expect(openDesign).toHaveBeenCalledWith('SECOND'),{timeout:20000});expect(openDesign).not.toHaveBeenCalledWith('TARGET')
    void router
  })
  it('closes a delayed binding query without keeping the list busy or publishing its late error',async()=>{
    const execute=executeQuery.getMockImplementation()!
    let release!:(result:DataSpaceQueryContext)=>void,pendingView!:DataView
    executeQuery.mockImplementation(async(view:DataView,...args:unknown[])=>view.viewId==='catalogBindings'
      ?new Promise(resolve=>{release=resolve;pendingView=view}):execute(view,...args))
    const {wrapper}=await page();await button(wrapper,'查询绑定').trigger('click');await flushPromises()
    const response=context(pendingView,[]);await button(wrapper,'关闭').trigger('click');await flushPromises()
    expect(wrapper.getComponent(RendererTable).element.parentElement?.getAttribute('inert')).toBeNull();release(response);await flushPromises()
    expect(wrapper.text()).not.toContain('目标已变化');expect(wrapper.text()).not.toContain('正在查询绑定')
  })
  it('creates through standard bound fields and consumes the saved query result',async()=>{
    const server=writable(),{wrapper}=await page();await button(wrapper,'新增').trigger('click');await flushPromises()
    const form=wrapper.getComponent(RendererForm);expect(form.props('dataViewKey')).toBe('SCENE@Base_DataSet@catalog')
    const name=form.findAllComponents(FieldText).find(item=>item.props('field')==='Name')!
    expect(name.props('modelValue')).toBeUndefined();await name.get('input').setValue('From form')
    form.getComponent(FieldSelect).getComponent(ElSelect).vm.$emit('update:modelValue','APP');await flushPromises()
    await button(wrapper,'确定').trigger('click');await flushPromises()
    expect(server.save).toHaveBeenCalledTimes(1);expect(wrapper.findComponent(RendererForm).exists()).toBe(false)
    expect(wrapper.text()).toContain('From form');expect(wrapper.text()).toContain('数据空间已保存')
  })
  it('blocks resubmission after an unknown write and offers a read-only reconciliation action',async()=>{
    const server=writable(),{wrapper}=await page();await wrapper.get('tbody tr').trigger('click');await flushPromises()
    await button(wrapper,'编辑').trigger('click');await flushPromises()
    await wrapper.getComponent(RendererForm).findAllComponents(FieldText).find(item=>item.props('field')==='Name')!.get('input').setValue('Applied once')
    server.onWrite(()=>{throw Error('Unknown write')});await button(wrapper,'确定').trigger('click');await flushPromises()
    expect(wrapper.text()).toContain('保存结果尚未确认');expect(wrapper.findAll('button').some(item=>item.text()==='确定')).toBe(false)
    await button(wrapper,'核验保存结果').trigger('click');await flushPromises()
    expect(server.writes).toBe(1);expect(wrapper.text()).toContain('Applied once')
  })
  it('renders navigation paths from a bound standard table and releases the views on close',async()=>{
    const leaf={rowid:'NODE',SysId:'APP',prowid:'000000',FunName:'Bound feature',name:'node',NavigationUrl:'/bound'}
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_NavigationInfo'?[leaf]:defaults[view.tableName]??[]))
    const {wrapper}=await page();await wrapper.get('tbody tr').trigger('click');await flushPromises()
    await button(wrapper,'查询绑定').trigger('click');await flushPromises()
    expect(wrapper.findAllComponents(RendererTable).map(table=>table.props('dataViewKey'))).toContain('SCENE@Base_NavigationInfo@catalogBindings')
    expect(wrapper.text()).toContain('Bound feature');expect(wrapper.text()).toContain('/bound')
    await button(wrapper,'关闭').trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('Bound feature')
  })
  it('copies only the information returned by the formal session',async()=>{
    const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{...navigator,clipboard:{writeText}})
    const session={loadMetadataViews:vi.fn(),readApiInfo:vi.fn(async()=>'formal API information'),dispose:vi.fn()};openDesign.mockResolvedValue(session)
    const {wrapper}=await page();await wrapper.get('tbody tr').trigger('click');await flushPromises()
    await button(wrapper,'复制API').trigger('click');await flushPromises()
    expect(writeText).toHaveBeenCalledWith('formal API information');expect(session.dispose).toHaveBeenCalledOnce();expect(wrapper.text()).toContain('已复制')
  })
  it('opens the original catalog row in a standard bound edit form and cancels without saving',async()=>{
    writable()
    const {wrapper}=await page();await wrapper.get('tbody tr').trigger('click');await flushPromises()
    await button(wrapper,'编辑').trigger('click');await flushPromises()
    const text=wrapper.findAllComponents(FieldText).find(field=>field.props('field')==='Name'&&!field.props('readonly')&&!field.props('filterAlternatives'))!
    expect(text.exists()).toBe(true)
    expect(text.props('modelValue')).toBeUndefined()
    await text.get('input').setValue('Changed');await flushPromises()
    await button(wrapper,'取消').trigger('click');await flushPromises()
    expect(wrapper.text()).toContain('Directory item');expect(wrapper.text()).not.toContain('Changed')
  })
  it('does not publish delayed application results after the formal route space changes',async()=>{
    let release!:(value:DataSpaceQueryContext)=>void,oldView!:DataView
    const pending=new Promise<DataSpaceQueryContext>(resolve=>{release=resolve})
    executeQuery.mockImplementation(async(view:DataView)=>{
      if(view.dataSet?.scenarioId==='SCENE'&&view.tableName==='Base_AppSystemList'){oldView=view;return pending}
      return context(view,view.tableName==='Base_AppSystemList'?[{rowid:'APP',AppDesc:'Current application'}]:defaults[view.tableName]??[])
    })
    const {wrapper,router}=await page()
    const stale=context(oldView,[{rowid:'APP',AppDesc:'Obsolete application'}])
    await router.push('/t/TENANT/app-a/second');await flushPromises();release(stale);await flushPromises()
    expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe('OTHER@Base_DataSet@catalog')
    expect(wrapper.text()).toContain('Current application');expect(wrapper.text()).not.toContain('Obsolete application')
  })
  it('binds standard components to the formal route space and opens the designer in a dialog with the selected target only',async()=>{
    const {wrapper,router}=await page();expect(loadScenario).toHaveBeenCalledWith({projectId:'app-a',scenarioId:'SCENE'})
    expect(wrapper.getComponent(RendererTable).props('dataViewKey')).toBe('SCENE@Base_DataSet@catalog')
    expect(wrapper.text()).toContain('Creator');expect(wrapper.text()).toContain('Application');expect(button(wrapper,'编辑').attributes('disabled')).toBeDefined()
    const before=router.currentRoute.value.fullPath
    await wrapper.get('tbody tr').trigger('click');await flushPromises();await button(wrapper,'设计').trigger('click');await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(before)
    await vi.waitFor(()=>expect(openDesign).toHaveBeenCalledWith('TARGET'),{timeout:20000})
    expect(openDesign).not.toHaveBeenCalledWith('UNTRUSTED')
  })
  it('retains standard OR/application filters across paging and resets them',async()=>{
    const {wrapper}=await page();await wrapper.get('input[placeholder="搜索名称或 ID"]').setValue(' FIND ');await flushPromises()
    wrapper.findAllComponents(FieldSelect).find(item=>item.props('field')==='sysid')!.getComponent(ElSelect).vm.$emit('update:modelValue','APP');await flushPromises()
    await button(wrapper,'查询').trigger('click');await flushPromises()
    expect(last().filter).toEqual({logic:'and',filters:[{logic:'or',filters:[{field:'Name',operator:'contains',value:'FIND'},
      {field:'rowid',operator:'eq',value:'FIND'}]},{field:'sysid',operator:'eq',value:'APP'}]})
    await wrapper.get('.btn-next').trigger('click');await flushPromises();expect(last().page).toBe(2);expect(last().filter).toBeDefined()
    await button(wrapper,'重置').trigger('click');await button(wrapper,'查询').trigger('click');await flushPromises();expect(last().filter).toBeUndefined()
  })
  it('does not expose hidden/masked fields, permission keys or unresolved creator IDs',async()=>{
    executeQuery.mockImplementation(async(view:DataView)=>context(view,view.tableName==='Base_DataSet'?[
      {rowid:'ROW',Name:'VISIBLE',description:'SECRET',sysid:'HIDDEN-APP',createuser:'UNKNOWN',lingma_sys_params:{m:['description'],h:['sysid']}},
      {rowid:'SECRET-ID',Name:'NO-DESIGN',createuser:'HIDDEN-USER',lingma_sys_params:{h:['rowid','createuser']}},
    ]:[]))
    const {wrapper}=await page();expect(wrapper.text()).toContain('未解析用户');expect(wrapper.text()).toContain('有 1 位创建人当前无法解析')
    expect(wrapper.html()).not.toMatch(/SECRET-ID|HIDDEN-APP|HIDDEN-USER|UNKNOWN|SECRET/)
    const hidden=wrapper.findAll('tbody tr')[1]!;await hidden.trigger('click');await flushPromises()
    expect(hidden.findAll('button').find(item=>item.text()==='设计')!.attributes('disabled')).toBeDefined()
  })
  it('retries failed application options independently of the list',async()=>{
    let attempts=0;executeQuery.mockImplementation(async(view:DataView)=>{if(view.tableName==='Base_AppSystemList'&&++attempts===1)throw new Error('Options unavailable')
      return context(view,defaults[view.tableName]??[])})
    const {wrapper}=await page();expect(wrapper.text()).toContain('Options unavailable');expect(wrapper.text()).toContain('Directory item')
    await button(wrapper,'重试应用选项').trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('Options unavailable')
    expect(attempts).toBe(2);expect(calls('Base_DataSet')).toHaveLength(1)
  })
  it('reports missing route metadata without falling back to URL query',async()=>{
    const {wrapper}=await page('');expect(wrapper.text()).toContain('缺少正式蓝图场景');expect(loadScenario).not.toHaveBeenCalled()
  })
  it('reports missing formal pagedata rather than a successful empty result',async()=>{
    loadScenario.mockRejectedValue(new Error('SCENARIO_VIEW_FILE_MISSING'));const {wrapper}=await page()
    expect(wrapper.text()).toContain('SCENARIO_VIEW_FILE_MISSING');expect(executeQuery).not.toHaveBeenCalled()
  })
})
