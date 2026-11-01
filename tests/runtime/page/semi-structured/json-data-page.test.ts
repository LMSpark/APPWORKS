import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {flushPromises,mount,config,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import VXETable from 'vxe-table'
import {DataSpaceRuntimeApi,LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {FieldJson,JsonTreeEditor,RendererTable,Spark,registerAllRenderers} from '@spark-appworks/spark-component'
import JsonPage from '@/views/features/data-platform/semi-structured/json-data/ui/json-data-page.vue'
import {ApiBackend} from '../api-provider/api-provider.fixture'
import {buildFormalModels} from '../structured-config/catalog/structured-config-catalog.fixture'
const SCENE='FFDEF2AED3E19A38C0FCDDC748CF939B'
const text=readFileSync('config/pages/semi-structured/json-data/pagedata.json','utf8')
const state=vi.hoisted(()=>({http:undefined as unknown as ApiBackend,runtime:undefined as unknown as DataSpaceRuntimeApi,files:new Map<string,string>(),reads:[] as string[],uploads:[] as string[],lose:false,dirty:[] as Array<{isDirty:boolean}>}))
vi.mock('@spark-appworks/spark-app',()=>({useSystemPageDirtySource:(source:{isDirty:boolean})=>state.dirty.push(source)}))
vi.mock('@/lowcode/lowcode-runtime',()=>({get lowcodeHttp(){return state.http},lowcodeDesignFileUpload:{uploadWorkingText:async(input:{fileName:string;text:string})=>{state.files.set(input.fileName,input.text);state.uploads.push(input.fileName);if(state.lose){state.lose=false;throw new Error('response lost')}return {}}},createLowcodeProjectGateways:()=>({scenarioViews:{readText:async(id:string)=>id===SCENE?text:null}}),lowcodeApi:{readRequestScope:()=>({token:'scope',headers:{'X-AppId':'APP'}}),design:{readTextFile:async(input:{fileName:string})=>{state.reads.push(input.fileName);const value=state.files.get(input.fileName);if(value===undefined)throw new LowcodeApiError(404,'文件不存在');return value}},dataSpace:{get runtime(){return state.runtime},design:{readSpaceDefinition:async({dataSpaceId}:{dataSpaceId:string})=>({dataSpaceId,name:'JSON数据'}),readModelBatch:async()=>buildFormalModels({Base_JsonData:['rowid','name','description','path','createuser','createtime'],Base_UserInfo:['ID','ROWID','UserName']}).map(model=>({...model,id:SCENE+(model.metaName==='Base_JsonData'?'p000':'p001'),fields:model.fields.map(field=>({...field,modelId:SCENE+(model.metaName==='Base_JsonData'?'p000':'p001')}))})),readRelations:async()=>[]}}}}))
const wrappers:VueWrapper[]=[],original={...config.global.stubs}
beforeEach(()=>{
 state.http=new ApiBackend();state.http.records={Base_JsonData:[{rowid:'J1',name:'样例JSON',path:'/NewApp/data.json'},{rowid:'J2',name:'另一份JSON',path:null}],Base_UserInfo:[]};state.files=new Map([['data.json','{"flag":false,"nested":[[1,null],{}]}']]);state.reads=[];state.uploads=[];state.lose=false;state.dirty=[]
 state.runtime=new DataSpaceRuntimeApi({http:state.http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})});registerAllRenderers();const stubs={...original};for(const name of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])Reflect.deleteProperty(stubs,name);config.global.stubs=stubs
})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());config.global.stubs=original})
async function open(){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/json',component:JsonPage,meta:{blueprintScenarioId:SCENE}},{path:'/other',component:{template:'<div>other</div>'}}]});await router.push('/json');await router.isReady()
 const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,VXETable,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
 const click=async(label:string)=>{const button=wrapper.findAll('button').find(b=>b.text()===label);expect(button,label).toBeDefined();await button!.trigger('click');await flushPromises()}
 const choose=async(index=0)=>{await vi.waitFor(()=>expect(wrapper.findComponent(RendererTable).exists()).toBe(true));await wrapper.getComponent(RendererTable).findAll('tbody tr')[index]!.trigger('click');await flushPromises();await click('内容编辑')}
 const edit=async(value:string)=>{wrapper.getComponent(FieldJson).getComponent(JsonTreeEditor).vm.$emit('update:modelValue',value);await flushPromises()}
 return {wrapper,router,click,choose,edit}
}
function documentValue(wrapper:VueWrapper):unknown{const value=wrapper.getComponent(FieldJson).getComponent(JsonTreeEditor).props('modelValue');if(typeof value!=='string')throw new Error('JSON editor text is absent');return JSON.parse(value)}
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
