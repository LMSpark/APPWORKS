import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'
import DevDataSetDesigner from '@/views/app/dev-system/DevDataSetDesigner.vue'
import DevPreviewTab from '@/views/app/dev-system/DevPreviewTab.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ScenarioDefinitionResource, type ProjectWorkspace} from '@spark-appworks/spark-project-model'
import metadataConfig from '../../../config/pages/data-platform/data-space-design/pagedata.json'

const { httpGet, httpPost, httpPut, httpRequestFull, httpClearCache, httpInterceptors, readModels, previewLoad } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  readModels: vi.fn(),
  previewLoad: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpRequestFull: vi.fn(),
  httpClearCache: vi.fn(),
  httpInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

// This consumer fixture supplies C; the metadata chain suite verifies the production loader against formal records.
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime', () => ({
  loadScenarioDataSet: previewLoad,
  loadLowcodeScenarioDefinitions: async (workspace: ProjectWorkspace, scenarioId: string, assertCurrent: () => void) => {
    const models = await readModels() ?? [{id: 'orders-model', metaName: 'Orders'}]
    const definitions = Object.fromEntries(Object.entries(metadataConfig.tables).filter(([, table]) => 'resourceId' in table && table.resourceId.startsWith('pagedata:')))
    const dataSet = DataSet.fromJson({scenarioId: metadataConfig.scenarioId, tables: {...definitions, Base_DataModel: {
      resourceType: 'static-data', columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, {name: 'Name', type: 'string'}, {name: 'dataSetId', type: 'string'}],
      views: {default: {autoLoad: false, rows: models.map((model: {id: string; metaName: string}) => ({rowid: model.id, Name: model.metaName, dataSetId: scenarioId}))}},
    }}})
    const resource = new ScenarioDefinitionResource({workspace, metadataScenarioId: metadataConfig.scenarioId,
      targetScenarioId: scenarioId, assertCurrent, validate: async () => {}})
    for (const name of Object.keys(definitions)) {
      const table = dataSet.getTable(name)!
      for (const view of table.viewList) {
        view.queryContext = {...view.queryContext, dataSpaceId: scenarioId}
        view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
      }
    }
    return dataSet
  },
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
    requestFull: httpRequestFull,
    clearCache: httpClearCache,
    interceptors: httpInterceptors,
  },
  lowcodeRequestHeaders: () => ({}),
  readLowcodePrincipal: () => null,
  lowcodeApi: {
    readRequestScope:()=>({token:'scope',headers:{'X-AppId':'homepage'}}),
    dataSpace:{design:{readModels}},
    platform: {
      listApplications: async () => [],
    },
  },
  createLowcodeProjectGateways: () => ({
    pageFiles: {
      saveFileContent: async (pageId: string, fileName: string, content: string) => {await httpPut(`designfile:homepage/${pageId}/${fileName}`, {content})},
      readPageFile: async (command: { pageId: string; fileName: string }) => {
        const response = await httpGet(`designfile:homepage/${command.pageId}/${command.fileName}`)
        return String(response?.content ?? '')
      },
    },
    blueprint: {
      loadRoot: async () => ({ nodeId:'homepage_root',parentNodeId:'',projectId:'homepage',kind:'module',capability:{name:'Test Project'},source:{},children:[] }),
    },
    scenarioViews: {readScope:()=> 'scope',readText:async(scenarioId:string)=>{const content=(await httpGet(`scenario:${scenarioId}`)).content;return content === null ? null : String(content)},writeText:async(scenarioId:string,text:string)=>{await httpPut(`scenario:${scenarioId}`,{content:text})}},
    projectReferences: {
      listProjects: async () => [],
      loadProjectBlueprint: async () => ({ title: 'Test Project', children: [] }),
    },
  }),
}))

import { createDevStateWithConfigPages, ensureDevStateActivePageLoaded, isolateAppProjectWorkspaceForTest } from './dev-state-test-fixture'
import type { ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
const fixtureText=(pageSize:number)=>JSON.stringify({scenarioId:'scene',tables:{Orders:{modelBinding:{modelId:'orders-model',modelName:'Orders'},views:{default:{pageSize},detail:{}}}}})
function sceneNode():ProjectBlueprintTreeNodeData{return {nodeId:'orders-page-node',parentNodeId:'homepage_root',projectId:'homepage',kind:'page',capability:{name:'Orders'},navigation:{title:'Orders',target:'cfg:orders-page',order:0,publishInMenu:true,showChildren:true,beginGroup:false},dataSpace:{scenarioId:'scene',models:[{metaName:'Orders'}]},source:{}}}
describe('tool and shared scenario editing owners',()=>{
 it('loads definitions only when the selected data workspace is actually opened', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  expect(state.scenarioDefinitionDocument.value).toBeNull()
  expect(readModels).not.toHaveBeenCalled()
  const wrapper=shallowMount(DevDataSetDesigner,{props:{state}})
  try {await flushPromises();expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene')}
  finally {wrapper.unmount()}
 })
 it('rejects changed history, wrong targets and intervening manual edits before restore writes', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const preview=vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))
  await expect(state.restoreScenarioVersion(0,fixtureText(51))).rejects.toThrow('PREVIEW_CHANGED')
  const wrong=fixtureText(50).replace('scene','other')
  preview.mockResolvedValueOnce(wrong)
  await expect(state.restoreScenarioVersion(0,wrong)).rejects.toThrow('当前场景')
  expect(state.pageDataDirty.value).toBe(false)
  let release!: (text:string)=>void
  const waiting=new Promise<string>(resolve=>{release=resolve})
  preview.mockReturnValueOnce(waiting)
  const restoring=state.restoreScenarioVersion(0,fixtureText(50))
  const rejection=expect(restoring).rejects.toThrow('UNSAVED')
  await state.writeScenarioViewText(fixtureText(66))
  release(fixtureText(50));await rejection
  expect(JSON.parse(state.scenarioDefinitionDocument.value!.getText()).tables.Orders.views.default.pageSize).toBe(66)
  await expect(state.restoreScenarioVersion(0,fixtureText(50))).rejects.toThrow('UNSAVED')
  expect(httpPut).not.toHaveBeenCalled()
 })
 it('previews the shared DataView draft while the storage owner remains unchanged', async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  await state.writeScenarioViewText(fixtureText(92))
  const runtimeData=DataSet.fromJson({scenarioId:'scene',tables:{}})
  previewLoad.mockResolvedValue({dataSet:runtimeData})
  const wrapper=shallowMount(DevPreviewTab,{props:{state}})
  try {
    await flushPromises()
    expect(previewLoad).toHaveBeenCalledOnce()
    expect(previewLoad.mock.calls[0]?.[0].config.toJSON().tables.Orders.views.default.pageSize).toBe(92)
    expect(JSON.parse(state.editor.getScenarioViews('scene')!.getText()).tables.Orders.views.default.pageSize).toBe(20)
    expect(state.pageDataDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  } finally {wrapper.unmount()}
  expect(runtimeData.destroyed).toBe(true)
  expect(state.scenarioDefinitionDocument.value?.dataSet.destroyed).toBe(false)
 })
 it('binds text editing and standard undo/save controls to the same definition views', async()=>{
  let remote=fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const JsonEditor=defineComponent({props:['modelValue','readOnly'],emits:['update:modelValue'],
    template:'<textarea :value="modelValue" :disabled="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />'})
  const wrapper=mount(DevDataSetDesigner,{props:{state},global:{stubs:{SparkJsonEditor:JsonEditor}}})
  const button=(label:string)=>wrapper.findAll('button').find(item=>item.text()===label)!
  try {
    await wrapper.get('textarea').setValue(fixtureText(77));await flushPromises()
    expect(state.pageDataDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
    await button('撤销').trigger('click');await flushPromises()
    expect(state.pageDataDirty.value).toBe(false)
    expect(JSON.parse(wrapper.get('textarea').element.value).tables.Orders.views.default.pageSize).toBe(20)
    await wrapper.get('textarea').setValue('{');await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
    expect(button('保存场景视图').attributes('disabled')).toBeDefined()
    await wrapper.get('textarea').setValue(fixtureText(88));await flushPromises()
    await button('保存场景视图').trigger('click');await flushPromises()
    expect(JSON.parse(remote).tables.Orders.views.default.pageSize).toBe(88)
    expect(state.pageDataDirty.value).toBe(false)
  } finally {wrapper.unmount()}
 })
 it('keeps the standard save action available to verify a lost receipt without discarding the draft', async()=>{
  let remote=fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content;throw new Error('response lost')})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const wrapper=mount(DevDataSetDesigner,{props:{state},global:{stubs:{SparkJsonEditor:true}}})
  const button=()=>wrapper.get('[data-test="scene-save"]')
  try {
   await state.writeScenarioViewText(fixtureText(77));await flushPromises()
   await button().trigger('click');await flushPromises()
   expect(wrapper.get('[role="alert"]').text()).toContain('response lost')
   expect(state.pageDataDirty.value).toBe(true)
   expect(button().text()).toBe('核验场景提交')
   expect(wrapper.get('[role="status"]').text()).toContain('新修改保留到下一次保存')
   expect(button().attributes('disabled')).toBeUndefined()
   await button().trigger('click');await flushPromises()
   expect(state.pageDataDirty.value).toBe(false)
   expect(httpPut).toHaveBeenCalledOnce()
   expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  } finally {wrapper.unmount()}
 })
 it('reports confirmed tool files and unknown definitions from the real shared workspace save, preserving later edits', async()=>{
  const remote=new Map([['scenario:scene',fixtureText(20)]])
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  httpGet.mockImplementation(async(url:string)=>({content:remote.get(url)??''}))
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{
    remote.set(url,payload.content)
    if(url==='scenario:scene'){await gate;throw new Error('response lost')}
  })
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const page=state.project.getActivePage()!
  state.project.markBlueprintClean('node')
  page.setFileText('script.js','console.log("first")')
  await state.writeScenarioViewText(fixtureText(77))
  const saving=state.saveAll()
  await vi.waitFor(()=>expect(httpPut.mock.calls.some(call=>call[0]==='scenario:scene')).toBe(true))
  expect(state.allSaving.value).toBe(true)
  await state.saveAll();expect(httpPut).toHaveBeenCalledTimes(2)
  const document=state.scenarioDefinitionDocument.value!, view=document.dataSet.getView('DataViewDefinition')!
  const row=view.rows.find(item=>item['viewId']==='default')!
  view.updateEditingValue(view.getPkKey(row)!,'pageSize',88)
  release();await saving
  expect(state.allSaving.value).toBe(false)
  expect(page.isDirty()).toBe(false)
  expect(state.statusMessages.value.some(item=>item.text==='工具工作文件本轮提交已确认')).toBe(true)
  expect(state.statusMessages.value[0]?.text).toContain('场景定义保存未完成')
  expect(state.pageDataDirty.value).toBe(true)
  await state.saveAll()
  expect(httpPut).toHaveBeenCalledTimes(2)
  expect(state.statusMessages.value[0]?.text).toBe('本轮提交已确认，仍有新修改待保存')
  expect(view.getEditingRow(view.getPkKey(row)!)?.['pageSize']).toBe(88)
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{remote.set(url,payload.content)})
  await state.saveAll()
  expect(httpPut).toHaveBeenCalledTimes(3)
  expect(JSON.parse(remote.get('scenario:scene')!).tables.Orders.views.default.pageSize).toBe(88)
  expect(state.pageDataDirty.value).toBe(false)
  expect(state.statusMessages.value[0]?.text).toBe('全部保存已确认')
 })
 it.each(['save','cancel'] as const)('lets the undispatched scene draft %s while a tool receipt is unknown', async action=>{
  const remote=new Map([['scenario:scene',fixtureText(20)]])
  httpGet.mockImplementation(async(url:string)=>({content:remote.get(url)??''}))
  httpPut.mockImplementation(async(url:string,payload:{content:string})=>{
   remote.set(url,payload.content)
   if(url.endsWith('script.js'))throw new Error('tool receipt lost')
  })
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  state.project.markBlueprintClean('node')
  state.project.writePageFile({fileName:'script.js',text:'submitted'})
  await state.writeScenarioViewText(fixtureText(77))
  const wrapper=mount(DevDataSetDesigner,{props:{state},global:{stubs:{SparkJsonEditor:true}}})
  try {
   await state.saveAll();await flushPromises()
   expect(httpPut).toHaveBeenCalledOnce()
   expect(state.statusMessages.value[0]?.text).toContain('后续场景定义尚未提交')
   expect(state.statusMessages.value[0]?.text).toContain('再次保存先核验原工具提交')
   const label=action==='save'?'保存场景视图':'撤销'
   const button=wrapper.findAll('button').find(item=>item.text()===label)!
   expect(button.attributes('disabled')).toBeUndefined()
   await button.trigger('click');await flushPromises()
   expect(state.pageDataDirty.value).toBe(false)
   expect(JSON.parse(remote.get('scenario:scene')!).tables.Orders.views.default.pageSize).toBe(action==='save'?77:20)
   await state.saveAll()
   expect(httpPut.mock.calls.filter(call=>String(call[0]).endsWith('script.js'))).toHaveLength(1)
   expect(state.hasAnyDirty.value).toBe(false)
   expect(state.statusMessages.value[0]?.text).toBe('全部保存已确认')
  } finally {wrapper.unmount()}
 })
 it('opens vue scene planning without loading a tool and explicitly creates from formal models',async()=>{
  let remote:string|null=null
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  readModels.mockResolvedValue([{id:'REAL-ID',metaName:'RealOrders'}])
  const state=createDevStateWithConfigPages([], '')
  const node=sceneNode();if(node.navigation)node.navigation.target='vue:/features/orders'
  state.project.replaceBlueprintChildren([node]);await state.selectNode(node);await state.loadSelectedScenarioViews()
  expect(httpGet.mock.calls.every(call=>String(call[0]) === 'scenario:scene')).toBe(true)
  expect(state.pageDataError.value).toBeNull()
  expect(state.scenarioDefinitionDocument.value?.isPersisted).toBe(false)
  await state.createSelectedScenarioViews()
  expect(JSON.parse(state.scenarioDefinitionDocument.value!.getText())).toEqual({scenarioId:'scene',tables:{RealOrders:{modelBinding:{modelId:'REAL-ID',modelName:'RealOrders'},views:{default:{}}}},viewCascades:[]})
  expect(state.hasAnyDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  await state.saveScenarioViewText();expect(state.pageDataDirty.value).toBe(false)
 })
 it('does not fabricate a draft when the backend has no formal models',async()=>{
  httpGet.mockResolvedValue({content:null});readModels.mockResolvedValue([])
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  await expect(state.createSelectedScenarioViews()).rejects.toThrow('没有正式模型')
  expect(state.scenarioDefinitionDocument.value?.isPersisted).toBe(false);expect(httpPut).not.toHaveBeenCalled()
 })

 it('mounts the shared scene designer in the data stage and locks rebinding for unsaved scenes',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const Slot=defineComponent({template:'<div><slot /></div>'})
  const Button=defineComponent({props:['disabled'],template:'<button :disabled="disabled"><slot /></button>'})
  const Input=defineComponent({props:['disabled'],template:'<input :disabled="disabled" />'})
  const wrapper=shallowMount(DataPlanningPane,{props:{form:{formKey:'scene'},state,saving:false},global:{stubs:{ElForm:Slot,ElFormItem:Slot,ElButton:Button,ElInput:Input}}})
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(true)
  expect(wrapper.findComponent(DevDataSetDesigner).props('state')).toBe(state)
  await state.writeScenarioViewText(fixtureText(50));await wrapper.vm.$nextTick()
  expect(wrapper.find('input').attributes()).toHaveProperty('disabled')
  expect(wrapper.find('button').attributes()).toHaveProperty('disabled')
  await wrapper.setProps({form:{formKey:'different'}})
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(false)
  wrapper.unmount()
 })
 it('previews an actual scene snapshot before restoring and blocks dirty versions',async()=>{
  let remote = fixtureText(20)
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  const list=vi.spyOn(state.editor,'listScenarioVersions').mockResolvedValue([{version:0,fileName:'0__pagedata.json',lastModified:null}])
  const preview=vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))
  const Button=defineComponent({props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'})
  const wrapper=shallowMount(DevDataSetDesigner,{props:{state},global:{stubs:{ElButton:Button,ElAlert:true,ElInput:true,ElEmpty:true}}})
  await wrapper.get('[data-test="scene-history"]').trigger('click');await vi.waitFor(()=>expect(wrapper.find('[data-test="scene-preview"]').exists()).toBe(true))
  expect(list).toHaveBeenCalled()
  await wrapper.get('[data-test="scene-preview"]').trigger('click');await vi.waitFor(()=>expect(wrapper.find('[data-test="scene-restore"]').exists()).toBe(true))
  expect(httpPut).not.toHaveBeenCalled()
  await wrapper.get('[data-test="scene-restore"]').trigger('click');await vi.waitFor(()=>expect(JSON.parse(remote).tables.Orders.views.default.pageSize).toBe(50))
  expect(httpPut).toHaveBeenCalledOnce()
  expect(preview).toHaveBeenCalledTimes(2)
  await state.writeScenarioViewText(fixtureText(70));await wrapper.vm.$nextTick()
  expect(wrapper.get('[data-test="scene-snapshot"]').attributes()).toHaveProperty('disabled')
  wrapper.unmount()
 })
 it('discards a late scene history after the panel is closed',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  let release:((value: {version:number;fileName:string;lastModified:null}[])=>void)|undefined
  const pending=new Promise<{version:number;fileName:string;lastModified:null}[]>(resolve=>{release=resolve})
  vi.spyOn(state.editor,'listScenarioVersions').mockReturnValue(pending)
  const Button=defineComponent({props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'})
  const wrapper=shallowMount(DevDataSetDesigner,{props:{state},global:{stubs:{ElButton:Button,ElAlert:true,ElInput:true,ElEmpty:true}}})
  await wrapper.get('[data-test="scene-history"]').trigger('click')
  await wrapper.get('[data-test="scene-history-close"]').trigger('click')
  release?.([{version:4,fileName:'4__pagedata.json',lastModified:null}]);await pending;await wrapper.vm.$nextTick()
  expect(wrapper.find('[data-test="scene-preview"]').exists()).toBe(false)
  wrapper.unmount()
 })
 it('rejects a late scene version list after changing the selected node',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  let release:((value:[])=>void)|undefined
  const pending=new Promise<[]>(resolve=>{release=resolve})
  vi.spyOn(state.editor,'listScenarioVersions').mockReturnValue(pending)
  const listing=state.listScenarioVersions()
  const rejected=expect(listing).rejects.toThrow('目标已切换')
  state.project.selectNode(null)
  release?.([]);await rejected
 })
 it('still loads a scene when a cfg tool load fails',async()=>{
  httpGet.mockImplementation(async(url:string)=>{if(!url.startsWith('scenario:'))throw new Error('tool file missing');return {content:fixtureText(20)}})
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews()
  expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene')
  expect(state.statusMessages.value.some(item=>item.text.includes('工具 orders-page 文件加载失败'))).toBe(true)
 })
 beforeEach(()=>{isolateAppProjectWorkspaceForTest();localStorage.clear();httpGet.mockReset();httpPut.mockReset();httpGet.mockResolvedValue({content:''});readModels.mockReset();previewLoad.mockReset()})
 afterEach(()=>{vi.useRealTimers()})
 it('loads exactly three tool files and retains clean undo baselines',async()=>{const state=createDevStateWithConfigPages();httpGet.mockImplementation(async()=>({content:''}));await ensureDevStateActivePageLoaded(state);await ensureDevStateActivePageLoaded(state);expect(httpGet.mock.calls).toHaveLength(3);expect(httpGet.mock.calls.map(call=>String(call[0]))).not.toContainEqual(expect.stringContaining('pagedata.json'));state.project.writePageFile({fileName:'script.js',text:'A'});expect(state.project.undoPageFile('script.js')).toBe(true);expect(state.project.readDirtyProjection().dirtyFiles.has('script.js')).toBe(false)})
 it('loads scene views through the scene gateway and undoes to a clean shared baseline',async()=>{let remote=fixtureText(20);httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}));httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content});const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews();expect(state.scenarioDefinitionDocument.value?.scenarioId).toBe('scene');await state.writeScenarioViewText(fixtureText(50));expect(state.pageDataDirty.value).toBe(true);expect(await state.scenarioDefinitionDocument.value?.undo()).toBe(true);state.scenarioDefinitionRevision.value++;expect(state.pageDataDirty.value).toBe(false);await state.writeScenarioViewText(fixtureText(70));await state.saveScenarioViewText();expect(JSON.parse(remote)).toEqual(JSON.parse(fixtureText(70)));expect(state.pageDataDirty.value).toBe(false);expect(state.project.readDirtyProjection().dirtyFiles).not.toContain('pagedata.json')})
 it('rejects model structure edits and preserves the last valid scene document',async()=>{httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}));const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());await state.loadSelectedScenarioViews();const previous=state.scenarioDefinitionDocument.value?.getText();await expect(state.writeScenarioViewText(JSON.stringify({scenarioId:'scene',tables:{Orders:{columns:[],views:{default:{}}}}}))).rejects.toThrow();expect(state.scenarioDefinitionDocument.value?.getText()).toBe(previous);expect(state.pageDataDirty.value).toBe(false)})
})
