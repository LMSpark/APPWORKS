import {afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises,config,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {createMemoryHistory,createRouter} from 'vue-router'
import type {SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {Spark,SparkPageRenderer,SparkComponentRenderer,registerAllRenderers,RendererTable,RendererButton,FieldJson} from '@spark-appworks/spark-component'
import Pane from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-pane.vue'
import {createSingleExportLayout,readSingleExportLayout} from '@/platform-adapters/resources/semi-structured/excel-import/layout/definition'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
import rules from '@/views/features/data-platform/semi-structured/excel-import/ui/design-tool/rule.json'
import script from '@/views/features/data-platform/semi-structured/excel-import/ui/design-tool/script.js?raw'
import style from '@/views/features/data-platform/semi-structured/excel-import/ui/design-tool/style.css?raw'
const cleanups:Array<()=>void>=[],originalStubs={...config.global.stubs}
afterEach(()=>{cleanups.splice(0).reverse().forEach(dispose=>dispose());config.global.stubs=originalStubs})
async function fixture(existing=false,duplicate=false){
 const layout=createSingleExportLayout('数据库一@table_one','数据库一@table_three')
 const nodes=[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'主表',relatedappid:'A1',table:'数据库一@table_one',exportType:'default',sorted:'',sheet_layout_json:existing?JSON.stringify(layout):''},{rowid:'C2',schemeid:'E1',pid:'C1',sheetName:'明细',relatedappid:'A1',table:'数据库一@table_three',exportType:'default',sorted:'',sheet_layout_json:''}]
 if(duplicate)nodes.push({...nodes[1]!,rowid:'C3',sheetName:'重复来源'})
 const tool=new PageTool({pageId:'layout-pane'})
 const regions=['excel-layout-controls','excel-layout-document']
 tool.hydrateFileText('rule.json',JSON.stringify(rules.filter(node=>regions.includes(node.id))))
 tool.hydrateFileText('script.js',script)
 tool.hydrateFileText('style.css',style)
 tool.markLoaded()
 const f=await excelDesignRuntime({Base_ImportData_Config:nodes,Base_ImportData_Field:[],Base_Import_Transform_Rule:[]},'E1','C1',tool)
 const http=new ApiBackend();http.records=sourceRecords();const source=await createSourceDataSet(http)
 const page=new PageRuntime({tool,scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source})
 await page.load()
 for(const table of Object.values(f.ds.tables))for(const view of Object.values(table.views))view.autoLoad=false
 const pane=shallowRef<InstanceType<typeof Pane>>()
 const host={runtime:page,assertCurrent:()=>{},async invoke(command:string):Promise<unknown>{
  if(command==='excel.design.connect')return {layout:()=>pane.value?.state(),layoutDocument:()=>pane.value}
  if(command==='excel.design.createLayout')await pane.value?.create()
  if(command==='excel.design.clearLayout')await pane.value?.clear()
  if(command==='excel.design.diagnoseLayout')await pane.value?.diagnose()
  return undefined
 }}
 registerAllRenderers();const stubs={...originalStubs};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key];config.global.stubs=stubs
 let wrapper:VueWrapper|undefined
 const start=async(beforeChange?:()=>void)=>{
  const routeSnapshot={path:'/',fullPath:'/',name:null,params:{},query:{},hash:''}
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}}]})
  await router.push('/')
  wrapper=mount(defineComponent({setup(){return()=>h(SparkPageRenderer,{pageRuntime:page,routeSnapshot,host},{
   content:({children}:{children:SparkNode[]})=>h(Pane,{ref:pane,...(beforeChange?{beforeChange}:{}),dataViewKey:`${EXCEL_DESIGN}@Base_ImportData_Config@default`},{
    'layout-controls':()=>children[0]?h(SparkComponentRenderer,{config:children[0]}):null,
    'layout-document':()=>children[1]?h(SparkComponentRenderer,{config:children[1]}):null,
   }),
  })}}),{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin(),router]}})
  await flushPromises()
  f.nodes.setCurrentRowById('C1')
  await flushPromises()
  return wrapper
 }
 cleanups.push(()=>{wrapper?.unmount();page.dispose();f.runtime.dispose()})
 const choose=async()=>{const table=wrapper!.findComponent(RendererTable);await vi.waitFor(()=>expect(table.findAll('tbody tr').length).toBeGreaterThan(0));await table.get('tbody tr').trigger('click');await flushPromises();await vi.waitFor(()=>expect(wrapper!.findAllComponents(RendererButton).find(button=>button.props('label')==='创建单组导出版式')?.props('disabled')).toBe(false));await wrapper!.findAllComponents(RendererButton).find(button=>button.props('label')==='创建单组导出版式')!.get('button').trigger('click');await flushPromises()}
 return {...f,source,start,choose,get wrapper(){return wrapper!}}
}
describe('bound single layout pane source identity',()=>{
 it('locks the layout on a failed detail query and releases it when the original view recovers',async()=>{
  const f=await fixture(true),details=f.ds.getView('Base_ImportData_Config','layoutChildren')!
  const refresh=vi.spyOn(details,'refresh').mockRejectedValue(new Error('明细查询暂时失败'))
  const fields=()=>f.wrapper.findAllComponents(FieldJson).filter(field=>field.props('mode')==='rows')
  await f.start()
  await vi.waitFor(()=>{
   expect(f.wrapper.text()).toContain('明细查询暂时失败')
   expect(fields()).toHaveLength(3)
   expect(fields().every(field=>field.props('readonly')===true)).toBe(true)
  })
  refresh.mockRestore()
  f.nodes.setCurrentRow(null)
  f.nodes.setCurrentRowById('C1')
  await vi.waitFor(()=>{
   expect(f.wrapper.text()).not.toContain('明细查询暂时失败')
   expect(fields()).toHaveLength(3)
   expect(fields().every(field=>field.props('readonly')===false)).toBe(true)
  })
  expect(f.http.saves).toEqual([])
 })
 it('preserves a newer layout edit made by the host before applying a layout command',async()=>{
  const f=await fixture()
  await f.start(()=>{f.nodes.updateEditingValue('C1','sheet_layout_json','{"newer":true}')})
  await f.choose()
  expect(f.nodes.getEditingRow('C1')?.['sheet_layout_json']).toBe('{"newer":true}')
  expect(f.http.saves).toEqual([])
 })
 it('rejects two direct details with the same persisted route before creating a draft',async()=>{
  const f=await fixture(false,true);await f.start();await f.choose()
  expect(f.wrapper.text()).toContain('明细物理路由不唯一');expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toEqual([])
 })
 it('rejects a newer detail snapshot instead of writing the old route selected by its matching ID',async()=>{
  const f=await fixture();f.http.records['Base_ImportData_Config']!.find(row=>row['rowid']==='C2')!['table']='数据库二@table_two'
  await f.start();await f.choose()
  expect(f.wrapper.text()).toContain('正式快照不一致');expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toEqual([])
 })
 it('restores both field directories after canceling a root-only source draft',async()=>{
  const f=await fixture(true);await f.start()
  const fields=()=>f.wrapper.findAllComponents(FieldJson).filter(field=>field.props('mode')==='rows')
  await vi.waitFor(()=>{expect(fields()).toHaveLength(3);expect(fields().every(field=>field.props('readonly')===false)).toBe(true)})
  f.nodes.updateEditingValue('C1','table','数据库二@table_two');await flushPromises()
  expect(fields().every(field=>field.props('readonly')===true)).toBe(true)
  f.nodes.discardEditingRows(['C1']);await flushPromises()
  await vi.waitFor(()=>{expect(fields()).toHaveLength(3);expect(fields().every(field=>field.props('readonly')===false)).toBe(true)})
  expect(readSingleExportLayout(f.nodes.getEditingRow('C1')?.['sheet_layout_json'])?.detailTable['table']).toBe('数据库一@table_three');expect(f.http.saves).toEqual([])
 })
})
