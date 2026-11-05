import {afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises,config,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark,PAGE_RUNTIME,useSparkComponent,registerAllRenderers,RendererTable,RendererButton,FieldJson} from '@spark-appworks/spark-component'
import Pane from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-sheet-layout-pane.vue'
import {createSingleExportLayout,readSingleExportLayout} from '@/lowcode/resources/semi-structured/excel-import/layout/definition'
import {excelDesignRuntime,EXCEL_DESIGN} from '../excel-import-design.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'
import {createSourceDataSet,sourceRecords,SOURCE_SCENE} from '../../../structured-config/data-code/source-picker/fixture'
const cleanups:Array<()=>void>=[],originalStubs={...config.global.stubs}
afterEach(()=>{cleanups.splice(0).reverse().forEach(dispose=>dispose());config.global.stubs=originalStubs})
async function fixture(existing=false,duplicate=false){
 const layout=createSingleExportLayout('数据库一@table_one','数据库一@table_three')
 const nodes=[{rowid:'C1',schemeid:'E1',pid:'E1',sheetName:'主表',relatedappid:'A1',table:'数据库一@table_one',exportType:'default',sorted:'',sheet_layout_json:existing?JSON.stringify(layout):''},{rowid:'C2',schemeid:'E1',pid:'C1',sheetName:'明细',relatedappid:'A1',table:'数据库一@table_three',exportType:'default',sorted:'',sheet_layout_json:''}]
 if(duplicate)nodes.push({...nodes[1]!,rowid:'C3',sheetName:'重复来源'})
 const f=await excelDesignRuntime({Base_ImportData_Config:nodes,Base_ImportData_Field:[],Base_Import_Transform_Rule:[]}),http=new ApiBackend();http.records=sourceRecords();const source=await createSourceDataSet(http)
 const page=new PageRuntime({pageId:'layout-pane',scenarioIds:[EXCEL_DESIGN,SOURCE_SCENE],deferredScenarioIds:[SOURCE_SCENE],scenarioInputs:{[EXCEL_DESIGN]:{importConfigId:'E1'}},loadScenario:async id=>id===EXCEL_DESIGN?f.ds:source});await page.load();f.nodes.setCurrentRowById('C1')
 registerAllRenderers();const stubs={...originalStubs};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key];config.global.stubs=stubs
 let wrapper:VueWrapper|undefined
 const start=async()=>{wrapper=mount(defineComponent({setup(){useSparkComponent({type:'test-layout-host'}).sparkProvide(PAGE_RUNTIME,page);return()=>h(Pane,{dataViewKey:`${EXCEL_DESIGN}@Base_ImportData_Config@default`})}}),{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin()]}});await flushPromises();return wrapper}
 cleanups.push(()=>{wrapper?.unmount();page.dispose();f.runtime.dispose()})
 const choose=async()=>{const table=wrapper!.findComponent(RendererTable);await vi.waitFor(()=>expect(table.findAll('tbody tr').length).toBeGreaterThan(0));await table.get('tbody tr').trigger('click');await flushPromises();await vi.waitFor(()=>expect(wrapper!.findAllComponents(RendererButton).find(button=>button.props('label')==='创建单组导出版式')?.props('disabled')).toBe(false));await wrapper!.findAllComponents(RendererButton).find(button=>button.props('label')==='创建单组导出版式')!.get('button').trigger('click');await flushPromises()}
 return {...f,source,start,choose,get wrapper(){return wrapper!}}
}
describe('bound single layout pane source identity',()=>{
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
