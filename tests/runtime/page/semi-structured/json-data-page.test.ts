import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {flushPromises,mount,config,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {FieldJson,FieldText,JsonTreeEditor,RendererTable,Spark,registerAllRenderers,PAGE_SERVICE,useSparkComponent,type PageServiceCapability,type PageSelectedFile,type PageBrowseFilesOptions} from '@spark-appworks/spark-component'
import {LowcodeJsonData} from '@/lowcode/resources/semi-structured/json-data/resource'
import {LowcodeDataSpaceSourceCatalog} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import JsonPage from '@/views/features/data-platform/semi-structured/json-data/ui/json-data-page.vue'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
const SCENE='FFDEF2AED3E19A38C0FCDDC748CF939B'
const text=readFileSync('config/pages/semi-structured/json-data/pagedata.json','utf8')
const state=vi.hoisted(()=>({picked:[] as PageSelectedFile[],browseCalls:[] as PageBrowseFilesOptions[],http:undefined as unknown as ApiBackend,runtime:undefined as unknown as DataSpaceRuntimeApi,files:new Map<string,string>(),reads:[] as string[],uploads:[] as string[],lose:false,dirty:[] as Array<{isDirty:boolean}>}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{isDirty:boolean})=>state.dirty.push(source)}))
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return state.http},lowcodeDesignFileUpload:{uploadTextVersion:async(input:{fileName:string;text:string})=>{if(state.files.has(input.fileName))throw new Error('File exists');state.files.set(input.fileName,input.text);state.uploads.push(input.fileName);if(state.lose){state.lose=false;throw new Error('response lost')}return {}},uploadWorkingText:async(input:{fileName:string;text:string})=>{state.files.set(input.fileName,input.text);state.uploads.push(input.fileName);if(state.lose){state.lose=false;throw new Error('response lost')}return {}}},createLowcodeProjectGateways:()=>({scenarioViews:{readText:async(id:string)=>id===SCENE?text:null}}),lowcodeApi:{readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),design:{readTextFile:async(input:{fileName:string})=>{state.reads.push(input.fileName);const value=state.files.get(input.fileName);if(value===undefined)throw new LowcodeApiError(404,'文件不存在');return value}},dataSpace:{get runtime(){return state.runtime},design:{readSpaceDefinition:async({dataSpaceId}:{dataSpaceId:string})=>({dataSpaceId,name:'JSON数据'}),readModelBatch:async()=>buildFormalModels({Base_JsonData:['rowid','name','description','path','createuser','createtime'],Base_UserInfo:['ID','ROWID','UserName']}).map(model=>({...model,id:SCENE+(model.metaName==='Base_JsonData'?'p000':'p001'),fields:model.fields.map(field=>({...field,modelId:SCENE+(model.metaName==='Base_JsonData'?'p000':'p001')}))})),readRelations:async()=>[]}}}}))
const wrappers:VueWrapper[]=[],original={...config.global.stubs}
beforeEach(()=>{
 state.picked=[];state.browseCalls=[];state.http=new ApiBackend();state.http.records={Base_JsonData:[{rowid:'J1',name:'样例JSON',path:'/NewApp/data.json'},{rowid:'J2',name:'另一份JSON',path:null}],Base_UserInfo:[]};state.files=new Map([['data.json','{"flag":false,"nested":[[1,null],{}]}']]);state.reads=[];state.uploads=[];state.lose=false;state.dirty=[]
 state.runtime=new DataSpaceRuntimeApi({http:state.http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})});registerAllRenderers();const stubs={...original};for(const name of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])Reflect.deleteProperty(stubs,name);config.global.stubs=stubs
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());config.global.stubs=original})
async function open(){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/json',component:JsonPage,meta:{blueprintScenarioId:SCENE}},{path:'/other',component:{template:'<div>other</div>'}}]});await router.push('/json');await router.isReady()
 const wrapper=mount(defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'json-page-test-host'});const service:PageServiceCapability={copyText:async()=>{},showMessage:()=>{},showConfirm:async()=>true,showPrompt:async()=>null,showAlert:async()=>{},showDialog:async()=> 'cancel',selectEntities:async()=>[],browseFiles:async options=>{state.browseCalls.push(options??{});return state.picked},uploadFiles:async()=>{throw new Error('Direct host upload is forbidden in this JSON flow')},showLoading:()=>{},navigate:()=>{}};sparkProvide(PAGE_SERVICE,service);return()=>h(RouterView)}}),{attachTo:document.body,global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
 const click=async(label:string)=>{const button=wrapper.findAll('button').find(b=>b.text()===label&&b.attributes('disabled')===undefined);expect(button,label).toBeDefined();await button!.trigger('click');await flushPromises()}
 const choose=async(index=0)=>{await vi.waitFor(()=>expect(wrapper.findComponent(RendererTable).exists()).toBe(true));await wrapper.getComponent(RendererTable).findAll('tbody tr')[index]!.trigger('click');await flushPromises();await click('内容编辑')}
 const edit=async(value:string)=>{wrapper.getComponent(FieldJson).getComponent(JsonTreeEditor).vm.$emit('update:modelValue',value);await flushPromises()}
 return {wrapper,router,click,choose,edit}
}
function documentValue(wrapper:VueWrapper):unknown{const value=wrapper.getComponent(FieldJson).getComponent(JsonTreeEditor).props('modelValue');if(typeof value!=='string')throw new Error('JSON editor text is absent');return JSON.parse(value)}
it('displays a failed catalog query once through the standard table with metadata hidden',async()=>{
 state.http.interceptors.request.use({onRequest:request=>{const body=request.data as {Table?:Array<{Name?:string}>}|undefined;if(request.url==='/api/DataOperation/GetData'&&body?.Table?.[0]?.Name==='Base_JsonData')throw new Error('catalog query denied');return request}})
 const f=await open();const errors=f.wrapper.findAll('[role="alert"]').filter(item=>item.text().includes('catalog query denied'));expect(errors).toHaveLength(1);expect(f.wrapper.find('[data-testid="data-view-meta"]').exists()).toBe(false)
})
describe('JSON document page on the formal DataSet',()=>{
 it('loads files only after selecting a record and binds the actual document rather than wire tree rows',async()=>{
  const f=await open();expect(state.reads).toEqual([]);await f.choose()
  await vi.waitFor(()=>expect(f.wrapper.findComponent(FieldJson).exists()).toBe(true))
  expect(f.wrapper.getComponent(FieldJson).props('dataViewKey')).toBe(`${SCENE}@JsonDocumentFile@document-J1`)
  expect(documentValue(f.wrapper)).toEqual({flag:false,nested:[[1,null],{}]})
  await f.edit('{"flag":false,"nested":[[1,null],{}],"new":0}');await f.click('保存内容')
  expect(JSON.parse(state.files.get('data.json')!)).toEqual({flag:false,nested:[[1,null],{}],new:0});expect(state.http.saves).toEqual([])
 })
 it('cancels native edits and protects closing or leaving until cancellation',async()=>{
  const f=await open();await f.choose();await f.edit('{"changed":1}');await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/json')
  await f.click('取消修改');expect(state.dirty[0]?.isDirty).toBe(false);expect(state.uploads).toEqual([])
  await f.click('关闭');await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
 })
 it('reports a missing file and disables save without fabricating an empty document',async()=>{
  const f=await open();await f.choose(1);await vi.waitFor(()=>expect(f.wrapper.text()).toContain('文件不存在'))
  expect(f.wrapper.findComponent(FieldJson).exists()).toBe(false);expect(f.wrapper.findAll('button').find(b=>b.text()==='保存内容')?.attributes('disabled')).toBeDefined();expect(state.uploads).toEqual([])
 })
 it('verifies an unknown raw file write without replaying it',async()=>{
  const f=await open();await f.choose();await f.edit('{"saved":true}');state.lose=true;await f.click('保存内容');expect(state.uploads).toHaveLength(1)
  await f.click('核验内容保存结果');expect(state.uploads).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
 })
 it('uses the real metadata fallback filename and preserves an array root',async()=>{
  state.files.set('J2.json','[false,[],null]');const f=await open();await f.choose(1)
  await vi.waitFor(()=>expect(f.wrapper.findComponent(FieldJson).exists()).toBe(true))
  expect(state.reads).toContain('J2.json');expect(documentValue(f.wrapper)).toEqual([false,[],null])
 })
})

it('edits metadata through standard table fields, cancels and saves only the catalog view',async()=>{
 const f=await open();const input=()=>f.wrapper.getComponent(RendererTable).findAll('input').find(item=>item.element.value==='样例JSON'||item.element.value==='改名')
 expect(input(),'metadata name editor').toBeDefined();await input()!.setValue('改名');await flushPromises()
 await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/json');await f.click('取消目录修改');expect(input()?.element.value).toBe('样例JSON');expect(state.http.saves).toEqual([])
 await input()!.setValue('改名');await flushPromises();await f.click('保存目录');expect(state.http.saves).toHaveLength(1);expect(state.http.records['Base_JsonData']?.[0]?.['name']).toBe('改名');expect(state.uploads).toEqual([]);expect(state.reads).toEqual([])
})

it('keeps catalog edits out of an open content operation',async()=>{
 const f=await open();await f.choose();const input=f.wrapper.getComponent(RendererTable).findAll('input').find(item=>item.element.value==='样例JSON');expect(input?.attributes('disabled')).toBeDefined()
 await f.edit('{"contentOnly":true}');await f.click('保存内容');expect(state.http.saves).toEqual([]);expect(state.http.records['Base_JsonData']?.[0]?.['name']).toBe('样例JSON')
})
it('verifies an unknown catalog save without replaying the database write or touching a file',async()=>{
 const f=await open();const input=f.wrapper.getComponent(RendererTable).findAll('input').find(item=>item.element.value==='样例JSON');expect(input).toBeDefined();await input!.setValue('改名');await flushPromises();state.http.failAfterWrite=true;await f.click('保存目录');expect(state.http.saves).toHaveLength(1)
 const cancel=f.wrapper.findAll('button').find(b=>b.text()==='取消目录修改');expect(cancel?.attributes('disabled')).toBeDefined();await f.click('核验目录保存结果');expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false);expect(state.uploads).toEqual([])
})

async function setNewName(wrapper:VueWrapper,name:string){const field=wrapper.findAllComponents(FieldText).find(item=>item.props('field')==='name'&&item.props('dataViewKey')===`${SCENE}@Base_JsonData@default`);expect(field,'new catalog name field').toBeDefined();await field!.get('input').setValue(name);await flushPromises()}
it('creates JSON through native file and catalog views, file first, with both records readable afterwards',async()=>{
 const opening=vi.spyOn(LowcodeJsonData,'loadCatalog');const f=await open();const loaded=opening.mock.results[0];opening.mockRestore();if(loaded?.type!=='return')throw new Error('Formal catalog load did not return');const instance=await loaded.value;await f.click('新增');await setNewName(f.wrapper,'  新增JSON  ');await f.edit('{"new":[false,null,[]]}');state.http.beforeSave=async()=>{expect(state.uploads).toHaveLength(1)};await f.click('创建JSON')
 expect(state.http.saves).toHaveLength(1);const added=state.http.saves[0]!.added[0];expect(added?.['name']).toBe('新增JSON');expect(state.files.get(`${String(added?.['rowid'])}.json`)).toBe('{"new":[false,null,[]]}');expect(state.dirty[0]?.isDirty).toBe(false)
 const catalog=instance.getView('Base_JsonData')!;await catalog.refresh();const row=catalog.rows.find(item=>item['rowid']===added?.['rowid']);if(!row)throw new Error('Created catalog record missing on reread');expect(LowcodeDataSpaceSourceCatalog.source('json',catalog,row)).toMatchObject({id:added?.['rowid'],name:'新增JSON',type:'json'})
})
it('cancels a new JSON before either source is written',async()=>{
 const f=await open();await f.click('新增');await setNewName(f.wrapper,'cancel');await f.edit('{"cancel":true}');await f.click('取消新增');expect(state.http.saves).toEqual([]);expect(state.uploads).toEqual([]);expect(state.http.records['Base_JsonData']).toHaveLength(2);expect(state.dirty[0]?.isDirty).toBe(false);await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
})
it('holds the created file while catalog result is unknown, then verifies without replaying either write',async()=>{
 const f=await open();await f.click('新增');await setNewName(f.wrapper,'unknown');state.http.failAfterWrite=true;await f.click('创建JSON');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toHaveLength(1);await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/json');expect(f.wrapper.findAll('button').find(b=>b.text()==='取消新增')?.attributes('disabled')).toBeDefined()
 await f.click('核验目录保存结果');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty,f.wrapper.text()).toBe(false)
})
it('verifies an unknown new file before saving metadata and never uploads it twice',async()=>{
 const f=await open();await f.click('新增');await setNewName(f.wrapper,'file unknown');state.lose=true;await f.click('创建JSON');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toEqual([]);expect(f.wrapper.findAll('button').find(b=>b.text()==='取消新增')?.attributes('disabled')).toBeDefined()
 await f.click('核验内容保存结果');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
})
it('keeps a confirmed file after metadata fails before write, verifies absence, and retries only metadata',async()=>{
 const f=await open();await f.click('新增');await setNewName(f.wrapper,'retry metadata');state.http.beforeSave=async()=>{delete state.http.beforeSave;throw new Error('no database receipt')};await f.click('创建JSON');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toEqual([])
 await f.click('核验目录保存结果');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(true)
 await f.click('创建JSON');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
})

it('does not create a file when the catalog has no usable source name',async()=>{
 const f=await open();await f.click('新增');await f.click('创建JSON');expect(state.uploads).toEqual([]);expect(state.http.saves).toEqual([]);expect(f.wrapper.text()).toContain('不能为空')
})
it('rejects whitespace-only names through the native catalog column rule',async()=>{
 const f=await open();const input=f.wrapper.getComponent(RendererTable).findAll('input').find(item=>item.element.value==='样例JSON');expect(input).toBeDefined();await input!.setValue('   ');await flushPromises();await f.click('保存目录');expect(state.http.saves).toEqual([]);expect(f.wrapper.text()).toContain('不能为空')
})

function pickJson(name:string,text:string,read?:()=>Promise<string>){const file=new File([text],name,{type:'application/json'});Object.defineProperty(file,'text',{value:read??(async()=>text)});state.picked=[{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,file}]}
it('imports a chosen JSON through the same file-first native creation flow',async()=>{
 const f=await open();const raw='{"items":[false,null,[]],"unicode":"中文"}';pickJson('导入.json',raw);state.http.beforeSave=async()=>{expect(state.uploads).toHaveLength(1)};await f.click('导入JSON');expect(state.browseCalls).toEqual([{title:'导入JSON',accept:'.json,application/json',multiple:false}]);expect(state.http.saves).toHaveLength(1);const added=state.http.saves[0]!.added[0];expect(added?.['name']).toBe('导入.json');expect(added?.['description']).toBe('导入.json');expect(state.files.get(`${String(added?.['rowid'])}.json`)).toBe(raw);expect(state.dirty[0]?.isDirty).toBe(false)
})
it('rejects invalid imported JSON before creating any native drafts or persistence',async()=>{
 const f=await open();pickJson('bad.json','not JSON');await f.click('导入JSON');expect(state.http.saves).toEqual([]);expect(state.uploads).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false);expect(f.wrapper.findComponent(FieldJson).exists()).toBe(false);expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
})
it('cancels file picking without drafts or writes',async()=>{
 const f=await open();await f.click('导入JSON');expect(state.browseCalls).toHaveLength(1);expect(state.http.saves).toEqual([]);expect(state.uploads).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false);await f.router.push('/other');expect(f.router.currentRoute.value.path).toBe('/other')
})
it('holds an uncertain import and verifies its file once before creating the catalog record',async()=>{
 const f=await open();pickJson('unknown.json','{"imported":true}');state.lose=true;await f.click('导入JSON');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toEqual([]);await f.click('核验内容保存结果');expect(state.uploads).toHaveLength(1);expect(state.http.saves).toHaveLength(1);expect(state.dirty[0]?.isDirty).toBe(false)
})
it('reports local file read failure without creating resources',async()=>{
 const f=await open();pickJson('unreadable.json','{}',async()=>{throw new Error('File read failed')});await f.click('导入JSON');expect(state.http.saves).toEqual([]);expect(state.uploads).toEqual([]);expect(state.dirty[0]?.isDirty).toBe(false);expect(f.wrapper.text()).toContain('File read failed')
})
it('ignores a late imported file after the navigation scenario changes',async()=>{
 let complete:((text:string)=>void)|undefined;const pending=new Promise<string>(resolve=>{complete=resolve});const f=await open();pickJson('late.json','{}',()=>pending);await f.click('导入JSON');expect(state.dirty[0]?.isDirty).toBe(true)
 f.router.currentRoute.value={...f.router.currentRoute.value,meta:{blueprintScenarioId:'OTHER'}};await flushPromises();complete?.('{}');await flushPromises();expect(state.http.saves).toEqual([]);expect(state.uploads).toEqual([]);expect(f.wrapper.text()).toContain('JSON目录场景身份不匹配');expect(state.dirty[0]?.isDirty).toBe(false)
})
it('preserves an imported array root and nested primitive values',async()=>{
 const f=await open();const raw='[false,null,[0],{"x":[]}]';pickJson('array.json',raw);await f.click('导入JSON');const added=state.http.saves[0]?.added[0];expect(added).toBeDefined();expect(state.files.get(`${String(added?.['rowid'])}.json`)).toBe(raw);expect(state.dirty[0]?.isDirty).toBe(false)
})
