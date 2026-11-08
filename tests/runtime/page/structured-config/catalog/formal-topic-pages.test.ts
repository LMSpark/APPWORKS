import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView} from 'vue-router'
import {defineComponent,h} from 'vue'
import ElementPlus from 'element-plus'
import {RendererTable, RendererDialog, RendererButton, RendererForm, RendererFilter, RendererFilterExpression, FieldText, FieldSelect, FieldRadio, FieldCheckboxGroup, Spark, registerAllRenderers,PAGE_SERVICE,useSparkComponent,type PageServiceCapability} from '@spark-appworks/spark-component'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import Workflow from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue'
import WorkflowTrigger from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog.vue'
vi.mock('@/views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page.vue',()=>({default:{name:'WorkflowEditorStub',props:['rowid'],data:()=>({hasPending:false,busy:false,unconfirmed:false}),methods:{discardChanges(this:{hasPending:boolean}){this.hasPending=false;return true}},template:'<div>workflow-editor</div>'}}))
import Excel from '@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import Pdf from '@/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue'
import {WORKFLOW, EXCEL, PDF, topicModels, topicTexts} from './formal-topic.fixture'
import type {HttpResponse,RequestConfig} from '@spark-appworks/spark-utils'
vi.mock('@/views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page.vue', () => ({default: {name:'ExcelEditorStub',props:['schemeRowid'],template:'<div data-excel-editor>{{schemeRowid}}</div>'}}))
vi.mock('@spark-appworks/spark-app', async () => {
  const {NativePageRuntimeSession} = await import('../../../../../packages/spark-app/src/router/native-page-runtime-session')
  return {NativePageRuntimeSession, useSystemPageDirtySource: () => {}}
})
const state = vi.hoisted(() => ({http: undefined as unknown as ApiBackend, runtime: undefined as unknown as DataSpaceRuntimeApi,appId:'D99A1DCE9894698799101EFD70F8FC76'}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  get lowcodeHttp() {return state.http}, lowcodeDesignFileUpload: async () => {throw new Error('unexpected upload')},
  createLowcodeProjectGateways: () => ({scenarioViews: {readText: async (id: string) => topicTexts[id] ?? null}}),
  lowcodeApi: {readRequestScope: () => ({token: `scope:${state.appId}`, headers: {'X-AppId': state.appId,'tenant-id':'tenant'}}), dataSpace: {
    get runtime() {return state.runtime}, design: {
      readSpaceDefinition: async ({dataSpaceId}: {dataSpaceId: string}) => ({dataSpaceId, name: 'formal topic'}),
      readModelBatch: async ({dataSpaceId, metaNames}: {dataSpaceId: string; metaNames: string[]}) => topicModels(dataSpaceId).filter(model => metaNames.includes(model.metaName)),
      readRelations: async () => [],
    },
  }},
}))
const original = {...config.global.stubs}, wrappers: VueWrapper[] = []
class TopicBackend extends ApiBackend{
 allocations=0
 templateRequests:RequestConfig[]=[]
 allocationBody:unknown={Code:200,Result:'EXCEL-NEW'}
 conflictCode=false
 protected override async executeRequest(request:RequestConfig):Promise<HttpResponse<unknown>>{
  if(request.url==='/api/File/UploadFile'){this.templateRequests.push(request);return{data:{Code:200,Result:[{state:'success',filePath:'/tenant/xlsxtemp/actual.xlsx'}]},status:200,statusText:'OK',headers:{}}}
  if(request.url==='/api/File/DownFile'){this.templateRequests.push(request);return{data:new Uint8Array([0,255]).buffer,status:200,statusText:'OK',headers:{}}}
  if(request.url.startsWith('/api/Codeing/GetCodeString/')){this.allocations++;if(this.conflictCode){const id=request.url.split('/').at(-2),row=this.records['Base_Import_solution']?.find(row=>row['rowid']===id);if(row)row['coding']='EXTERNAL'}return{data:this.allocationBody,status:200,statusText:'OK',headers:{}}}
  return super.executeRequest(request)
 }
}
beforeEach(() => {
  state.appId='D99A1DCE9894698799101EFD70F8FC76'
  state.http = new TopicBackend(); state.http.primaryKeys['Base_FileInspectConfig'] = 'id'
  state.http.primaryKeys['_base_dbInfo']='Id'
  state.http.records = {
    Base_WorkflowDefinition: [{rowid: 'W1', name: '入库流程', workflow_key: 'INBOUND', description: '正式流程', status: '1'}],
    workflowStatus: [{rowid: 'STATUS1', val: '1', txt: '已启用', ordIdx: 1}],
    Base_Import_solution: [{rowid: 'E1', coding: 'EXCEL1', solutionName: '订单导入', description: '正式方案', dataSetId: 'S1', createuser: 'U1'}],
    Base_DataSet: [{rowid: 'S1', Name: '订单空间'}], Base_UserInfo: [{ID: 'USER1', ROWID: 'U1', UserName: '张三'}],
    Base_FileInspectConfig: [{id: 'P1', name: '发票规则', description: '正式PDF规则', enabled: 1}],
  }
  state.runtime = new DataSpaceRuntimeApi({http: state.http, readScope: () => ({token: `scope:${state.appId}`, headers: {'X-AppId': state.appId,'tenant-id':'tenant'}})})
  registerAllRenderers()
  const stubs = {...original}; for (const key of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[key]
  config.global.stubs = stubs
})
afterEach(() => {wrappers.splice(0).forEach(wrapper => wrapper.unmount()); config.global.stubs = original})
describe('formal topic catalog pages', () => {
  it('hosts the PDF catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).not.toContain('new PageRuntime')
  })
  it('hosts the Excel catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).not.toContain('new PageRuntime')
  })
  it('hosts the workflow catalog runtime through the shared native session', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/views/features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue'), 'utf8')
    expect(source).toContain('new NativePageRuntimeSession')
    expect(source).toContain('session.isCurrent(current)')
    expect(source).not.toContain('new PageRuntime')
  })
  it.each(['copy','failure','hidden','stale'] as const)('copies the clicked formal Excel row key through the page service: %s',async mode=>{
    state.http.records['Base_Import_solution']!.push({rowid:'E2',coding:'OTHER-CODE',solutionName:'另一个方案'})
    if(mode==='hidden')state.http.hiddenFields['Base_Import_solution']=['rowid']
    const copy=vi.fn(async(_value:string)=>{if(mode==='failure')throw Error('clipboard rejected')}),message=vi.fn()
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Excel,meta:{blueprintScenarioId:EXCEL}}]});await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'excel-key-host'});const service:PageServiceCapability={copyText:copy,showMessage:message,showConfirm:async()=>true,showPrompt:async()=>null,showAlert:async()=>{},showDialog:async()=>'cancel',selectEntities:async()=>[],browseFiles:async()=>[],uploadFiles:async()=>{throw Error('unexpected upload')},showLoading:()=>{},navigate:()=>{}};sparkProvide(PAGE_SERVICE,service);return()=>h(RouterView)}}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('另一个方案'));const table=wrapper.getComponent(RendererTable),rows=table.findAll('tbody tr');await rows[0]!.trigger('click');await flushPromises()
    const reads=state.http.reads.length,button=rows[1]!.findAll('button').find(item=>item.text()==='复制KEY');expect(button).toBeDefined();if(mode==='stale')state.appId='SWITCHED';await button!.trigger('click');await flushPromises()
    if(mode==='hidden'){expect(copy).not.toHaveBeenCalled();expect(wrapper.text()).toContain('方案KEY不可读')}
    else if(mode==='stale'){expect(copy).not.toHaveBeenCalled();expect(message).not.toHaveBeenCalled();expect(wrapper.findAll('[data-view-error]')).toHaveLength(2);expect(wrapper.findAll('[data-aggregate-error]')).toHaveLength(0)}
    else{expect(copy).toHaveBeenCalledWith('E2');if(mode==='failure'){expect(wrapper.text()).toContain('复制失败');expect(message).not.toHaveBeenCalled()}else expect(message).toHaveBeenCalledWith('已复制 KEY：E2','success')}
    expect(state.http.saves).toEqual([]);expect(state.http.reads).toHaveLength(reads);expect((state.http as TopicBackend).templateRequests).toEqual([])
  })
  it.each(['cancel','upload'] as const)('uses standard Excel template buttons through %s',async mode=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Excel,meta:{blueprintScenarioId:EXCEL}}]});await router.push('/catalog');await router.isReady()
    const file=new File([new Uint8Array([0,255])],'chosen.xlsx'),browse=vi.fn(async()=>[{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,file}]),upload=vi.fn(async()=>{throw Error('page upload forbidden')})
    const wrapper=mount(defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'excel-template-host'});const service:PageServiceCapability={copyText:async()=>{},showMessage:()=>{},showConfirm:async()=>true,showPrompt:async()=>null,showAlert:async()=>{},showDialog:async()=>'cancel',selectEntities:async()=>[],browseFiles:browse,uploadFiles:upload,showLoading:()=>{},navigate:()=>{}};sparkProvide(PAGE_SERVICE,service);return()=>h(RouterView)}}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await vi.waitFor(()=>expect(wrapper.text()).toContain('订单导入'))
    const click=async(label:string)=>{const button=wrapper.findAll('button').find(item=>item.text()===label);expect(button,label).toBeDefined();await button!.trigger('click');await flushPromises()}
    await click('编辑');await click('选择模板');expect(browse).toHaveBeenCalledWith({title:'选择Excel模板',accept:'.xls,.xlsx',multiple:false});expect(wrapper.text()).toContain('chosen.xlsx');expect(upload).not.toHaveBeenCalled();expect(state.http.saves).toEqual([])
    if(mode==='cancel'){await click('取消选择');expect(wrapper.text()).not.toContain('chosen.xlsx');expect(state.http.saves).toEqual([]);await click('取消修改');expect((state.http as TopicBackend).templateRequests).toEqual([])}
    else{await click('确认上传模板');await vi.waitFor(()=>expect(wrapper.text()).toContain('已保存'));expect(state.http.saves).toHaveLength(1);expect(state.http.saves[0]).toMatchObject({changed:[{rowid:'E1',templatePath:'/tenant/xlsxtemp/actual.xlsx'}]});await click('关闭');expect((state.http as TopicBackend).templateRequests).toHaveLength(2)}
    expect(wrapper.findComponent(RendererForm).exists()).toBe(false);await click('编辑');expect(wrapper.getComponent(RendererForm).props('contextRowId')).toBe('E1');expect(wrapper.text()).not.toContain('chosen.xlsx')
  })
  it.each(['cancel','save','unknown-code','conflict-end','read-failure-end'] as const)('creates an Excel scheme through the standard pinned form with %s',async outcome=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Excel,meta:{blueprintScenarioId:EXCEL}},{path:'/other',component:{template:'<div>other</div>'}}]});await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await vi.waitFor(()=>expect(wrapper.text()).toContain('订单导入'))
    const click=async(label:string)=>{const button=wrapper.findAll('button').find(item=>item.text()===label);expect(button,label).toBeDefined();await button!.trigger('click');await flushPromises()}
    await click('新增方案');const form=wrapper.getComponent(RendererForm),id=form.props('contextRowId');expect(id).toBeTruthy();expect(id).not.toBe('E1')
    const name=form.findAllComponents(FieldText).find(field=>field.props('field')==='solutionName')!;await name.get('input').setValue('新增目录方案');await flushPromises()
    if(outcome==='cancel'){await click('取消修改');expect(state.http.saves).toHaveLength(0);expect((state.http as TopicBackend).allocations).toBe(0);expect(wrapper.findComponent(RendererForm).exists()).toBe(false)}
    else{if(outcome==='unknown-code')(state.http as TopicBackend).allocationBody={Code:500,Message:'unknown'};if(outcome==='conflict-end')(state.http as TopicBackend).conflictCode=true;if(outcome==='read-failure-end')state.http.beforeDefinitionRead=async table=>{if(table==='Base_Import_solution'&&state.http.saves.length)throw Error('offline')};await click('保存方案')
      if(outcome==='unknown-code'){expect(wrapper.findComponent(RendererForm).exists()).toBe(true);expect(wrapper.findAll('button').find(button=>button.text()==='取消修改')?.attributes('disabled')).toBeDefined();await click('核验保存结果');expect(state.http.saves).toHaveLength(1);await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')}
      else if(outcome==='conflict-end'){expect(wrapper.text()).toContain('冲突');await click('保留方案并结束');expect(wrapper.findComponent(RendererForm).exists()).toBe(false);expect(state.http.saves).toHaveLength(1);expect(state.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)?.['coding']).toBe('EXTERNAL');await router.push('/other');expect(router.currentRoute.value.path).toBe('/other')}
      else if(outcome==='read-failure-end'){const reads=state.http.reads.length;await click('保留方案并结束');expect(wrapper.findComponent(RendererForm).exists()).toBe(false);expect(state.http.reads).toHaveLength(reads);expect(state.http.saves).toHaveLength(1);expect((state.http as TopicBackend).allocations).toBe(0);await router.push('/other');expect(router.currentRoute.value.path).toBe('/other')}
      else{expect(wrapper.findComponent(RendererForm).exists()).toBe(false);expect(state.http.saves).toHaveLength(2);expect(state.http.records['Base_Import_solution']!.find(row=>row['rowid']===id)).toMatchObject({solutionName:'新增目录方案',coding:'EXCEL-NEW'})}
      expect((state.http as TopicBackend).allocations).toBe(outcome==='read-failure-end'?0:1)
    }
  })
  it.each(['cancel','save','unknown'] as const)('edits the original Excel scheme through its native row with %s',async outcome=>{
    state.http.records['Base_Import_solution']!.push({rowid:'E2',coding:'KEEP2',solutionName:'另一个方案',description:'keep',dataSetId:'S1'})
    state.http.records['Base_Import_solution']![0]!['templatePath']='keep-template.xlsx'
    const loading=vi.spyOn(LowcodeExcelImport,'loadCatalog'),router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Excel,meta:{blueprintScenarioId:EXCEL}},{path:'/other',component:{template:'<div>other</div>'}}]});await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await vi.waitFor(()=>expect(wrapper.text()).toContain('订单导入'));const loaded=loading.mock.results[0];loading.mockRestore();if(loaded?.type!=='return')throw Error('Catalog load missing');const ds=await loaded.value
    const row=wrapper.getComponent(RendererTable).findAll('tbody tr')[0]!;const edit=row.findAll('button').find(button=>button.text()==='编辑');expect(edit,'row edit action').toBeDefined();await edit!.trigger('click');await flushPromises()
    const form=wrapper.getComponent(RendererForm);expect(form.props('contextRowId')).toBe('E1');ds.getView('Base_Import_solution')!.setCurrentRowById('E2');await flushPromises()
    const name=form.findAllComponents(FieldText).find(field=>field.props('field')==='solutionName')!;await name.get('input').setValue('  修改后的方案  ');await flushPromises();await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')
    const click=async(label:string)=>{const button=wrapper.findAll('button').find(item=>item.text()===label);expect(button,label).toBeDefined();await button!.trigger('click');await flushPromises()}
    if(outcome==='cancel'){await click('取消修改');expect(state.http.saves).toEqual([]);expect(state.http.records['Base_Import_solution']![0]?.['solutionName']).toBe('订单导入')}
    else{if(outcome==='unknown')state.http.failAfterWrite=true;await click('保存方案');expect(state.http.saves).toHaveLength(1);if(outcome==='unknown'){expect(wrapper.findAll('button').find(button=>button.text()==='取消修改')?.attributes('disabled')).toBeDefined();await click('核验保存结果');expect(state.http.saves).toHaveLength(1)}expect(state.http.records['Base_Import_solution']![0]).toMatchObject({rowid:'E1',solutionName:'修改后的方案',coding:'EXCEL1',templatePath:'keep-template.xlsx'});expect(state.http.records['Base_Import_solution']![1]?.['solutionName']).toBe('另一个方案')}
    expect(wrapper.findComponent(RendererForm).exists()).toBe(false)
  })
  it.each(['cancel','save'])('binds trigger conditions to the original definition and guards unapplied input before %s',async outcome=>{
    const originalFilter=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'Count',operator:'eq',value:0}))
    Object.assign(state.http.records['Base_WorkflowDefinition']![0]!,{version:'1',tblid:'T1',tblName:'Orders',filter:originalFilter})
    state.http.records['Base_TblField']=[{rowid:'F1',tblid:'T1',enname:'Count',cnname:'数量',DataType:'INT'},{rowid:'OTHER',tblid:'T2',enname:'HiddenOther',cnname:'其他表',DataType:'VARCHAR'}]
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    const click=async(label:string)=>{const b=wrapper.findAllComponents(RendererButton).find(b=>b.props('label')===label)!;b.vm.$emit('click');await flushPromises()}
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises();await click('编辑定义')
    await vi.waitFor(()=>expect(wrapper.findComponent(RendererFilterExpression).exists()).toBe(true))
    const filter=wrapper.getComponent(RendererFilterExpression)
    await vi.waitFor(()=>expect(filter.props('readonly')).toBe(false))
    expect(filter.props('dataViewKey')).toBe(`${WORKFLOW}@Base_WorkflowDefinition@edit`)
    expect(filter.props('columns')).toEqual([{name:'Count',label:'数量',type:'int'}])
    const editor=filter.getComponent({name:'FilterExpressionEditor'})
    editor.props('onEditingChange')(true);await flushPromises()
    expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(wrapper.findAllComponents(RendererButton).find(b=>b.props('label')==='选择触发表')!.props('disabled')).toBe(true)
    await click('保存定义');expect(state.http.saves).toEqual([]);expect(wrapper.text()).toContain('请先应用或取消触发条件编辑')
    await click('取消定义修改');expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(false)
    filter.getComponent({name:'FilterExpressionEditor'}).vm.$emit('update:modelValue',{field:'Count',operator:'eq',value:2});await flushPromises()
    if(outcome==='cancel'){await click('取消定义修改');expect(state.http.saves).toEqual([]);expect(state.http.records['Base_WorkflowDefinition']![0]!['filter']).toBe(originalFilter)}
    else{
      await click('保存定义');expect(state.http.saves).toHaveLength(1)
      const stored=state.http.records['Base_WorkflowDefinition']![0]!['filter'];expect(typeof stored).toBe('string')
      expect(DataViewFilterCodec.parseStored(typeof stored==='string'?stored:undefined)?.toJSON()).toEqual({field:'Count',operator:'eq',value:2})
      expect(state.http.saves[0]?.table).toBe('Base_WorkflowDefinition')
    }
  })
  it.each(['save','cancel'])('edits trigger type and Cron through standard bound fields and %s',async outcome=>{
    Object.assign(state.http.records['Base_WorkflowDefinition']![0]!,{version:'1',activeType:'table',timeExp:'original-expression',tblid:'KEEP_TABLE',filter:'keep-filter',tableOperate:'add,edit'})
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(Workflow,{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    const click=async(label:string)=>{const b=wrapper.findAllComponents(RendererButton).find(b=>b.props('label')===label)!;expect(b.props('disabled')).not.toBe(true);b.vm.$emit('click');await flushPromises()}
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises();await click('编辑定义')
    await vi.waitFor(()=>expect(wrapper.findComponent(RendererForm).exists()).toBe(true))
    const form=wrapper.getComponent(RendererForm),radio=form.getComponent(FieldRadio)
    expect(radio.props('field')).toBe('activeType')
    await radio.findAllComponents({name:'ElRadio'}).find(r=>r.props('value')==='time')!.get('input').setValue(true)
    const cron=form.findAllComponents(FieldText).find(f=>f.props('field')==='timeExp')!
    await cron.get('input').setValue('0 0 9 * * ?');await flushPromises()
    const operations=form.getComponent(FieldCheckboxGroup)
    expect(operations.props('field')).toBe('tableOperate');expect(operations.props('valueMode')).toBe('separated-string')
    const checkboxes=operations.findAllComponents({name:'ElCheckbox'})
    expect(checkboxes.find(c=>c.props('label')==='add')!.get('input').element.checked).toBe(true)
    expect(checkboxes.find(c=>c.props('label')==='edit')!.get('input').element.checked).toBe(true)
    await checkboxes.find(c=>c.props('label')==='delete')!.get('input').setValue(true);await flushPromises()
    expect(state.http.saves).toEqual([])
    if(outcome==='cancel'){
      await click('取消定义修改');expect(cron.get('input').element.value).toBe('original-expression');expect(state.http.saves).toEqual([])
      expect(operations.findAllComponents({name:'ElCheckbox'}).find(c=>c.props('label')==='delete')!.get('input').element.checked).toBe(false)
    }else{
      await click('保存定义');expect(state.http.saves).toHaveLength(1)
      expect(state.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid:'W1',activeType:'time',timeExp:'0 0 9 * * ?',tableOperate:'add,edit,delete'})])
    }
    expect(state.http.records['Base_WorkflowDefinition']![0]).toMatchObject({tblid:'KEEP_TABLE',filter:'keep-filter',tableOperate:outcome==='cancel'?'add,edit':'add,edit,delete'})
  })
  it.each(['cancel-picker','confirm-cancel','confirm-save','search-empty'])('uses the real trigger selector with %s through the original definition view',async outcome=>{
    Object.assign(state.http.records['Base_WorkflowDefinition']![0]!,{version:'1',dbName:'old_db',tblName:'OldTable',tblid:'OLD',filter:'old-filter'})
    state.http.records['_base_dbInfo']=[{Id:'D1',Name:'physical_db',Remark:'显示备注'},{Id:'D2',Name:'other_db'}]
    state.http.records['_Base_TblList']=[{rowid:'T1',dbid:'D1',tblname:'Orders',tbldesc:'订单'},{rowid:'T2',dbid:'D2',tblname:'Other',tbldesc:'其他'}]
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.getComponent(RendererTable).text()).toContain('入库流程'))
    const click=async(label:string)=>{const b=wrapper.findAllComponents(RendererButton).find(b=>b.props('label')===label)!;expect(b,label).toBeDefined();expect(b.props('disabled')).not.toBe(true);b.vm.$emit('click');await flushPromises()}
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises();await click('触发表…')
    await vi.waitFor(()=>expect(wrapper.findComponent(WorkflowTrigger).exists()).toBe(true))
    const picker=wrapper.getComponent(WorkflowTrigger)
    await vi.waitFor(()=>expect(picker.findComponent(FieldSelect).exists()).toBe(true))
    const database=picker.getComponent(FieldSelect)
    expect(database.props('dataMember')).toBe('value');expect(database.props('dataViewKey')).toBe(`${WORKFLOW}@_base_dbInfo@default`)
    await database.get('.el-select__wrapper').trigger('click');await flushPromises()
    await database.findAllComponents({name:'ElOption'}).find(option=>option.props('label')==='physical_db')!.trigger('click');await flushPromises()
    const table=picker.getComponent(RendererTable)
    await vi.waitFor(()=>expect(table.text()).toContain('Orders'));expect(table.text()).not.toContain('Other')
    await table.get('tbody tr').trigger('click');await flushPromises()
    if(outcome==='search-empty'){
      const filters=picker.getComponent(RendererFilter);filters.vm.filterModel['tblname']='Other';await filters.vm.search();await flushPromises()
      expect(table.text()).not.toContain('Orders');expect(table.text()).not.toContain('Other')
      expect(picker.findAllComponents(RendererButton).find(b=>b.props('label')==='确认触发表')!.props('disabled')).toBe(true)
    }
    const cancelled=outcome==='cancel-picker'||outcome==='search-empty'
    if(cancelled)await click('取消选择');else await click('确认触发表')
    expect(wrapper.findComponent(WorkflowTrigger).exists()).toBe(false);expect(state.http.saves).toEqual([])
    const form=wrapper.getComponent(RendererForm),targetName=()=>form.findAllComponents(FieldText).find(field=>field.props('field')==='tblName')!.get('input').element.value
    expect(targetName()).toBe(cancelled?'OldTable':'Orders')
    if(outcome==='confirm-save'){
      await click('保存定义');expect(state.http.saves.map(save=>save.table)).toEqual(['Base_WorkflowDefinition'])
      expect(state.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid:'W1',dbName:'physical_db',tblName:'Orders',tblid:'T1',filter:''})])
    }else{await click('取消定义修改');expect(targetName()).toBe('OldTable');expect(state.http.saves).toEqual([])}
  })
  it.each(['confirmed','lost-receipt','invalid-name','scope-changed','catalog-refresh-failed','status-selection'])('edits and cancels an existing definition with %s without touching other definitions',async outcome=>{
    state.http.records['Base_WorkflowDefinition']![0]!['version']='1'
    state.http.records['Base_WorkflowDefinition']![0]!['status']=2
    state.http.records['workflowStatus']=[{rowid:'STATUS1',val:1,txt:'已启用',ordIdx:1},{rowid:'STATUS2',val:2,txt:'停用',ordIdx:2}]
    state.http.records['Base_WorkflowDefinition']!.push({rowid:'W2',name:'另一个流程',workflow_key:'KEEP',status:'1',version:'1'})
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}},{path:'/other',component:{template:'<div>other</div>'}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(defineComponent({setup:()=>()=>h(RouterView)}),{attachTo:document.body,global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    const click=async(label:string)=>{const button=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label);expect(button,label).toBeDefined();expect(button!.props('disabled')).not.toBe(true);button!.vm.$emit('click');await flushPromises()}
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises();await click('编辑定义')
    await vi.waitFor(()=>expect(wrapper.getComponent(RendererDialog).props('title')).toBe('映射信息设置'))
    await vi.waitFor(()=>expect(wrapper.findComponent(RendererForm).exists()).toBe(true))
    const field=()=>wrapper.getComponent(RendererForm).findAllComponents(FieldText).find(item=>item.props('field')==='name')!
    await field().get('input').setValue('待取消');await flushPromises()
    await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')
    await click('取消定义修改')
    expect(field().get('input').element.value).toBe('入库流程');expect(state.http.saves).toEqual([])
    await field().get('input').setValue(outcome==='invalid-name'?'   ':'正式修改');await flushPromises()
    if(outcome==='status-selection'){
      const status=wrapper.getComponent(RendererForm).getComponent(FieldSelect)
      await status.get('.el-select__wrapper').trigger('click');await flushPromises()
      const option=status.findAllComponents({name:'ElOption'}).find(item=>item.props('label')==='已启用')!
      expect(option).toBeDefined();await option.trigger('click');await flushPromises()
    }
    if(outcome==='lost-receipt')state.http.failAfterWrite=true
    if(outcome==='scope-changed')state.appId='OTHER_APP'
    if(outcome==='catalog-refresh-failed')state.http.beforeSave=async()=>{vi.spyOn(state.runtime,'executeQuery').mockRejectedValueOnce(Error('目录读取失败'))}
    await click('保存定义')
    if(outcome==='scope-changed'){expect(state.http.saves).toEqual([]);return}
    if(outcome==='invalid-name'){
      expect(state.http.saves).toEqual([]);await click('取消定义修改');expect(field().get('input').element.value).toBe('入库流程');return
    }
    if(outcome==='catalog-refresh-failed'){
      expect(wrapper.text()).toContain('定义保存已确认，目录刷新失败')
      expect(state.http.saves).toHaveLength(1);await click('保存定义');expect(state.http.saves).toHaveLength(1)
    }
    if(outcome==='lost-receipt'){
      expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
      expect(wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='取消定义修改')!.props('disabled')).toBe(true)
      await router.push('/other');expect(router.currentRoute.value.path).toBe('/catalog')
      await click('核验定义保存结果')
    }
    expect(state.http.saves).toHaveLength(1)
    expect(state.http.saves[0]?.changed).toEqual([expect.objectContaining({rowid:'W1',name:'正式修改'})])
    expect(state.http.records['Base_WorkflowDefinition']!.find(row=>row['rowid']==='W2')?.['name']).toBe('另一个流程')
    expect(state.http.records['Base_WorkflowDefinition']!.find(row=>row['rowid']==='W1')?.['status']).toBe(outcome==='status-selection'?'1':2)
    expect(wrapper.getComponent(RendererTable).text()).toContain('正式修改')
  })
  it('does not open a nonexistent workflow or allocate a random identity for unsupported creation',async()=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(Workflow,{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    await wrapper.findAll('button').find(button=>button.text()==='新增工作流')!.trigger('click');await flushPromises()
    expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(false)
    expect(wrapper.text()).toContain('业务编码生成能力尚未确认')
    expect(state.http.saves).toEqual([])
  })
  it.each(['dirty','busy','unknown'])('guards the workflow dialog while %s and permits only a safe explicit discard',async kind=>{
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/catalog',component:Workflow,meta:{blueprintScenarioId:WORKFLOW}}]})
    await router.push('/catalog');await router.isReady()
    const wrapper=mount(Workflow,{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
    await vi.waitFor(()=>expect(wrapper.text()).toContain('入库流程'))
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click');await flushPromises()
    await wrapper.findAll('button').find(button=>button.text()==='打开设计')!.trigger('click');await flushPromises()
    const editor=wrapper.getComponent({name:'WorkflowEditorStub'})
    await editor.setData({hasPending:kind!=='busy',busy:kind==='busy',unconfirmed:kind==='unknown'})
    expect(wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue',false);await flushPromises()
    expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(true)
    const discard=wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='放弃修改并关闭')
    if(kind==='dirty'){
      expect(discard?.props('disabled')).toBe(false);discard!.vm.$emit('click');await flushPromises()
      expect(wrapper.findComponent({name:'WorkflowEditorStub'}).exists()).toBe(false)
    }else if(kind==='unknown')expect(discard?.props('disabled')).toBe(true)
    expect(state.http.saves).toEqual([])
  })
  it.each([
    [Workflow, WORKFLOW, '入库流程', 'workflowId', 'W1', 'Base_WorkflowDefinition'],
    [Excel, EXCEL, '订单导入', 'importConfigId', 'E1', 'Base_Import_solution'],
    [Pdf, PDF, '发票规则', 'ruleId', 'P1', 'Base_FileInspectConfig'],
  ] as const)('renders formal records and passes the original identity downstream for %s', async (page, scenarioId, title, parameter, identity, metaName) => {
    const router = createRouter({history: createMemoryHistory(), routes: [{path: '/catalog', component: page, meta: {blueprintScenarioId: scenarioId}}]})
    await router.push('/catalog'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(page, {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}}); wrappers.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain(title))
    if (scenarioId === EXCEL) await vi.waitFor(() => expect(wrapper.text()).toContain('订单空间'))
    if (scenarioId === WORKFLOW) await vi.waitFor(() => expect(wrapper.text()).toContain('已启用'))
    const open = () => wrapper.findAll('button').find(button => button.text() === '打开设计')!
    expect(open().attributes('disabled')).toBeDefined()
    await wrapper.getComponent(RendererTable).get('tbody tr').trigger('click'); await flushPromises()
    await open().trigger('click'); await flushPromises()
    if (scenarioId === EXCEL || scenarioId === WORKFLOW) {
      expect(push).not.toHaveBeenCalled()
      if(scenarioId===EXCEL)expect(wrapper.getComponent({name:'ExcelEditorStub'}).props('schemeRowid')).toBe(identity)
      else expect(wrapper.getComponent({name:'WorkflowEditorStub'}).props('rowid')).toBe(identity)
      expect(router.currentRoute.value.path).toBe('/catalog')
    } else expect(push).toHaveBeenCalledWith(expect.objectContaining({query: {[parameter]: identity}}))
    expect(state.http.reads.some(read => read.table === metaName)).toBe(true)
    if (scenarioId !== EXCEL) expect(state.http.reads.some(read => read.table === 'Base_UserInfo')).toBe(false)
    expect(state.http.saves).toEqual([])
  })
})
