import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DataViewFilterCodec,type DataSet} from '@spark-appworks/spark-data'
import {DataViewFilterLocal} from '../../../../packages/spark-data/src/query/filter/data-view-filter-local'
import {DataSpaceRuntimeApi,type DataSpaceDesignApi,ApiInterfaceDesign} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase,type HttpResponse,type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {Spark, registerAllRenderers, RendererForm, RendererTable} from '@spark-appworks/spark-component'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'
import ApiInterfacePage from '@/views/features/integration/api-management/ui/api-interface-list-page.vue'
const service=vi.hoisted(()=>({readRequestScope:vi.fn(),readSpaceDefinition:vi.fn(),readModelBatch:vi.fn()}))
let http:InterfaceHttp,runtime:DataSpaceRuntimeApi
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return http},lowcodeApi:{readRequestScope:service.readRequestScope,dataSpace:{design:service,get runtime(){return runtime}}}}))
type Row=Record<string,unknown>
const fields:Record<string,string[]>={
  Base_DataServiceInterface:['rowid','ProviderID','Name','AccountName','ContentType','request','LinkUrl','Desc','paramType','GetParamStr','FormDataParam','BodyParamJsonStr','resultPath','requiresAuth','RequestType','PathStr'],
  Base_InterfaceProvider:['rowid','Name'],Base_InterfaceProvider_Account:['rowid','ProviderID','UserName','Password'],
  Base_Interface_PublicParam:['rowid','providerId','paramName','desc'],_Base_ParamList:['parid','pid','parname','pardesc','parzdtype','testvalue'],
  Base_InterfaceApi_Headers:['rowid','interfaceId','ParamName','ParamDesc','ValueFun'],Base_TblField:['rowid','tblid','enname','cnname','DataTypeName'],
  ContentType:['rowid','val','txt'],request:['rowid','val','txt'],'接口参数类型':['rowid','val','txt'],ParamType:['rowid','val','txt'],
}
const models=Object.entries(fields).map(([name,names])=>({id:`${name}-model`,name,metaName:name,sourceType:'table',sourceId:'DB',sourceName:name,primaryKey:name==='_Base_ParamList'?'parid':'rowid',businessMain:false,raw:{},
  fields:names.map((field,order)=>({id:field,modelId:`${name}-model`,name:field,canonicalName:field,primaryKey:field===(name==='_Base_ParamList'?'parid':'rowid'),description:field,type:field==='requiresAuth'?'int':'string',output:true,computed:false,order,orderType:'',raw:{}})),
})) satisfies Array<Awaited<ReturnType<DataSpaceDesignApi['readModel']>>>
class InterfaceHttp extends HttpClientBase {
  rows:Record<string,Row[]>={
    Base_InterfaceProvider:[{rowid:'P1',Name:'Provider'}],Base_InterfaceProvider_Account:[{rowid:'A1',ProviderID:'P1',UserName:'account'},{rowid:'A2',ProviderID:'P2',UserName:'other'}],
    Base_DataServiceInterface:[{rowid:'I1',ProviderID:'P1',Name:'orders',request:'3',paramType:'JSON',LinkUrl:'/orders/{id}',RequestType:'legacy',PathStr:'legacy raw',GetParamStr:'{}'},
      {rowid:'I2',ProviderID:'P1',Name:'other',request:'3',paramType:'JSON',LinkUrl:'/other'},{rowid:'I3',ProviderID:'P2',Name:'private'}],
    Base_Interface_PublicParam:[{rowid:'R1',providerId:'P1',paramName:'token',desc:'Token'}],
    _Base_ParamList:[{parid:'Q1',pid:'I1',parname:'id',pardesc:'ID',parzdtype:'string',testvalue:'business value'}],
    Base_InterfaceApi_Headers:[{rowid:'H1',interfaceId:'I1',ParamName:'X-Id',ValueFun:'{"Type":"GetInputParam","ParamName":"id"}'}],
    Base_TblField:[{rowid:'F1',tblid:'I1',enname:'orderId',cnname:'订单号',DataTypeName:'字符串'}],
    ContentType:[{rowid:'C1',val:'application/json',txt:'JSON'}],request:[{rowid:'M1',val:'3',txt:'GET'},{rowid:'M2',val:'1',txt:'POST'}],
    '接口参数类型':[{rowid:'T1',val:'JSON',txt:'JSON'},{rowid:'T2',val:'FormData',txt:'FormData'}],ParamType:[{rowid:'PT',val:'string',txt:'字符串'}],
  }
  reads:RequestConfig[]=[];saves:RequestConfig[]=[];denied:string[]=[];failAfterWrite=false
  ignoreChildScope=false
  afterRead?:()=>void
  protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
    let result:unknown
    if(request.url==='/api/DataOperation/GetData'){
      this.reads.push(request)
      const table=(request.data as {Table:Array<{Name:string;Filter?:unknown;Fields:Array<{Name:string}>}>}).Table[0]!
      let rows=this.rows[table.Name]??[]
      if(table.Filter&&!(this.ignoreChildScope&&table.Name==='_Base_ParamList')){const filter=new DataViewFilterLocal(DataViewFilterCodec.decode(table.Filter));rows=rows.filter(row=>filter.matches(row))}
      result={primaryKeyField:table.Name==='_Base_ParamList'?'parid':'rowid',allowAdd:true,lingma_sys_key:'tk',data:{Items:rows.map(row=>({...Object.fromEntries(table.Fields.map(f=>[f.Name,row[f.Name]])),lingma_sys_key:'rk',lingma_sys_params:{r:[],e:(fields[table.Name]??[]).filter(f=>!this.denied.includes(f)),h:[],m:[],d:true}})),Count:rows.length}}
      this.afterRead?.()
    }else if(request.url==='/api/DataOperation/BatchTableOperateRequestByCRUD'){
      this.saves.push(request);const added:Record<string,Row[]>[]=[],changed:Record<string,Row[]>[]=[],deleted:Record<string,Row[]>[]=[]
      for(const group of request.data as Array<{TableName:string;CrudModel:{Added:Row[];Changed:Row[];Deleted:Row[]}}>){
        expect(['Base_DataServiceInterface','_Base_ParamList','Base_InterfaceApi_Headers']).toContain(group.TableName)
        const pk=group.TableName==='_Base_ParamList'?'parid':'rowid'
        for(const [kind,out]of [['Added',added],['Changed',changed]]as const){const saved=group.CrudModel[kind].map(raw=>{const row={...raw};delete row['lingma_sys_key'];delete row['lingma_sys_params'];if(kind==='Added')this.rows[group.TableName]!.push(row);else Object.assign(this.rows[group.TableName]!.find(r=>r[pk]===row[pk])!,row);return row});if(saved.length)out.push({[group.TableName]:saved})}
        if(group.CrudModel.Deleted.length){const ids=group.CrudModel.Deleted.map(r=>r[pk]);this.rows[group.TableName]=this.rows[group.TableName]!.filter(r=>!ids.includes(r[pk]));deleted.push({[group.TableName]:group.CrudModel.Deleted})}
      }
      if(this.failAfterWrite)throw Error('receipt unknown')
      result={maplistadd:added,maplistedit:changed,maplistdelete:deleted}
    }else throw Error(`Unexpected ${request.url}`)
    return {data:{Code:200,Result:result},status:200,statusText:'OK',headers:{}}
  }
}
const sets:DataSet[]=[]
const wrappers:VueWrapper[]=[], originalStubs={...config.global.stubs}
beforeEach(()=>{
  http=new InterfaceHttp();service.readRequestScope.mockReturnValue({token:'scope',headers:{'X-AppId':'APP'}})
  runtime=new DataSpaceRuntimeApi({http,readScope:service.readRequestScope})
  service.readSpaceDefinition.mockImplementation(({dataSpaceId}:{dataSpaceId:string})=>Promise.resolve({dataSpaceId,name:'API',raw:{}}))
  service.readModelBatch.mockImplementation(({metaNames}:{metaNames:string[]})=>Promise.resolve(models.filter(m=>metaNames.includes(m.metaName))))
  registerAllRenderers()
  const stubs={...originalStubs}; for(const key of ['el-button','el-table','el-table-column','SparkComponentRenderer','spark-component-renderer'])delete stubs[key]
  config.global.stubs=stubs
  vi.stubGlobal('ResizeObserver',class{observe(){} unobserve(){} disconnect(){}})
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());sets.splice(0).forEach(s=>s.destroy());vi.restoreAllMocks();vi.unstubAllGlobals();config.global.stubs=originalStubs})
async function open(){const dataSet=await LowcodeApiProvider.loadInterfaces(),context=await LowcodeApiProvider.loadInterfaceContext();sets.push(dataSet,context);const owner=new ApiInterfaceDesign({dataSet,context,providerId:'P1'});await owner.load();await owner.select('I1');return{owner,dataSet,context}}
describe('interface design formal persistence',()=>{
  it('rejects foreign child definitions and duplicate input names',async()=>{
    const {owner}=await open();http.ignoreChildScope=true
    await expect(owner.select('I2')).rejects.toThrow('范围')
    http.ignoreChildScope=false;await owner.load(true);await owner.select('I1');await owner.add('parameters')
    const id=owner.parameters.getPkKey(owner.parameters.currentRow!)!
    owner.parameters.updateEditingValue(id,'parname','id');owner.parameters.updateEditingValue(id,'parzdtype','string')
    await expect(owner.save('parameters')).rejects.toThrow('重复');expect(http.saves).toHaveLength(0)
  })
  it('rejects changed drafts during asynchronous validation and cross-application saves',async()=>{
    const {owner}=await open();owner.interfaces.updateEditingValue('I1','Name','checked')
    http.afterRead=()=>{owner.interfaces.updateEditingValue('I1','Name','changed')}
    await expect(owner.save('definition')).rejects.toThrow('校验期间');expect(http.saves).toHaveLength(0)
    delete http.afterRead;service.readRequestScope.mockReturnValue({token:'other',headers:{'X-AppId':'OTHER'}})
    await expect(owner.save('definition')).rejects.toThrow();expect(http.saves).toHaveLength(0)
  })
  it('uses the actual standard-component page to select, edit, save and cancel an independent definition',async()=>{
    const component=defineComponent({setup:()=>()=>h(ApiInterfacePage,{providerId:'P1'})})
    const router=createRouter({history:createMemoryHistory(),routes:[]})
    const dynamic=createDynamicRouter({router,pageComponent:component,componentMap:{'/interface':component},loadNavigation:async()=>({id:'root',title:'Root',childPlacement:'header',items:[{id:'interfaces',title:'接口',path:'/interface',itemKind:'system-page',blueprintScenarioId:LowcodeApiProvider.interfaceScenarioId}]})})
    await dynamic.registerRoutes();await router.push('/interface');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
    const table=wrapper.findComponent(RendererTable)
    await table.findAll('.el-table__body-wrapper tbody tr')[0]!.trigger('click');await flushPromises()
    const item=(label:string)=>wrapper.findComponent(RendererForm).findAll('.el-form-item').find(e=>e.find('label').text()===label)!
    expect(wrapper.text()).toContain('接口定义');expect(wrapper.text()).not.toContain('测试值')
    await item('接口名称').get('input').setValue('changed_name');await flushPromises()
    await table.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
    expect(wrapper.text()).toContain('修改');expect((item('接口名称').get('input').element as HTMLInputElement).value).toBe('changed_name')
    await wrapper.findAll('button').find(b=>b.text()==='保存接口定义')!.trigger('click');await flushPromises()
    expect(http.rows['Base_DataServiceInterface']![0]?.['Name']).toBe('changed_name')
    await item('接口名称').get('input').setValue('cancel_me');await flushPromises()
    await wrapper.findAll('button').find(b=>b.text()==='放弃修改并重读')!.trigger('click');await flushPromises()
    expect(http.rows['Base_DataServiceInterface']![0]?.['Name']).toBe('changed_name')
    expect(JSON.stringify(http.saves)).not.toMatch(/Password|testvalue|PathStr|RequestType/)
  })
  it('scopes the catalog and children with native cascades and omits account values and test data',async()=>{
    const {owner}=await open();expect(owner.interfaces.rows.map(r=>r['rowid'])).toEqual(['I1','I2']);expect(owner.parameters.rows.map(r=>r['parid'])).toEqual(['Q1'])
    expect(JSON.stringify(http.reads)).not.toMatch(/Password|testvalue|callApi/)
    await owner.select('I2');expect(owner.parameters.rows).toHaveLength(0);expect(owner.headers.rows).toHaveLength(0)
  })
  it('saves actual runtime fields and preserves old fields and another section draft',async()=>{
    const {owner}=await open();owner.interfaces.updateEditingValue('I1','paramType','FormData');owner.interfaces.updateEditingValue('I1','FormDataParam','{"id":"{\\"Type\\":\\"GetInputParam\\",\\"ParamName\\":\\"id\\"}"}')
    owner.parameters.updateEditingValue('Q1','pardesc','unsaved description');await owner.save('definition')
    expect(http.rows['Base_DataServiceInterface']![0]).toMatchObject({paramType:'FormData',RequestType:'legacy',PathStr:'legacy raw'})
    expect(http.rows['_Base_ParamList']![0]?.['pardesc']).toBe('ID');expect(owner.parameters.hasEditingChanges()).toBe(true)
    expect((await open()).owner.interfaces.rows[0]?.['FormDataParam']).toContain('GetInputParam')
  })
  it('validates new function references and permissions and blocks target changes with drafts',async()=>{
    const {owner}=await open();owner.headers.updateEditingValue('H1','ValueFun','{"Type":"GetInputParam","ParamName":"missing"}')
    await expect(owner.save('headers')).rejects.toThrow();await expect(owner.select('I2')).rejects.toThrow('修改');owner.discard()
    http.denied=['Name'];await owner.load(true);await owner.select('I1');owner.interfaces.updateEditingValue('I1','Name','denied');await expect(owner.save('definition')).rejects.toThrow();expect(http.saves).toHaveLength(0)
  })
  it('creates and rereads a new interface before allowing persisted input definitions',async()=>{
    const {owner}=await open();await owner.addInterface();const id=owner.interfaces.getPkKey(owner.interfaces.currentRow!)!
    await expect(owner.add('parameters')).rejects.toThrow('先保存')
    for(const [key,value]of Object.entries({Name:'new_api',LinkUrl:'/new',request:'3',paramType:'JSON'}))owner.interfaces.updateEditingValue(id,key,value)
    await owner.save('definition');await owner.add('parameters');const pid=owner.parameters.getPkKey(owner.parameters.currentRow!)!
    owner.parameters.updateEditingValue(pid,'parname','input');owner.parameters.updateEditingValue(pid,'parzdtype','string');await owner.save('parameters')
    expect(http.rows['_Base_ParamList']!.find(r=>r['parname']==='input')?.['pid']).toBe(id)
    expect(JSON.stringify(http.saves)).not.toContain('testvalue')
  })
  it('keeps a failed receipt uncertain until explicit reread',async()=>{
    const {owner}=await open();owner.headers.updateEditingValue('H1','ParamName','X-New');http.failAfterWrite=true
    await expect(owner.save('headers')).rejects.toThrow();await expect(owner.save('headers')).rejects.toThrow('核验');expect(http.saves).toHaveLength(1)
    await owner.load(true);await owner.select('I1');expect(owner.headers.rows[0]?.['ParamName']).toBe('X-New')
  })
})
