import { shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'
import DevDataSetDesigner from '@/views/app/dev-system/DevDataSetDesigner.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpGet, httpPost, httpPut, httpRequestFull, httpClearCache, httpInterceptors, readModels } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  readModels: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpRequestFull: vi.fn(),
  httpClearCache: vi.fn(),
  httpInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
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
    readRequestScope:()=>({token:'scope'}),
    dataSpace:{design:{readModels}},
    platform: {
      listApplications: async () => [],
    },
  },
  createLowcodeProjectGateways: () => ({
    pageFiles: {
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
 it('opens vue scene planning without loading a tool and explicitly creates from formal models',async()=>{
  let remote:string|null=null
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}))
  httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content})
  readModels.mockResolvedValue([{id:'REAL-ID',metaName:'RealOrders'}])
  const state=createDevStateWithConfigPages([], '')
  const node=sceneNode();if(node.navigation)node.navigation.target='vue:/features/orders'
  state.project.replaceBlueprintChildren([node]);await state.selectNode(node)
  expect(httpGet.mock.calls.map(call=>String(call[0]))).toEqual(['scenario:scene'])
  expect(state.pageDataError.value).toContain('FILE_MISSING')
  expect(state.scenarioViewFile.value).toBeNull()
  await state.createSelectedScenarioViews()
  expect(state.scenarioViewFile.value?.value.toJSON()).toEqual({scenarioId:'scene',tables:{RealOrders:{modelBinding:{modelId:'REAL-ID',modelName:'RealOrders'},views:{default:{}}}},viewCascades:[]})
  expect(state.hasAnyDirty.value).toBe(true);expect(httpPut).not.toHaveBeenCalled()
  await state.saveScenarioViewText();expect(state.pageDataDirty.value).toBe(false)
 })
 it('does not fabricate a draft when the backend has no formal models',async()=>{
  httpGet.mockResolvedValue({content:null});readModels.mockResolvedValue([])
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  await expect(state.createSelectedScenarioViews()).rejects.toThrow('没有正式模型')
  expect(state.scenarioViewFile.value).toBeNull();expect(httpPut).not.toHaveBeenCalled()
 })

 it('mounts the shared scene designer in the data stage and locks rebinding for unsaved scenes',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  const Slot=defineComponent({template:'<div><slot /></div>'})
  const Button=defineComponent({props:['disabled'],template:'<button :disabled="disabled"><slot /></button>'})
  const Input=defineComponent({props:['disabled'],template:'<input :disabled="disabled" />'})
  const wrapper=shallowMount(DataPlanningPane,{props:{form:{formKey:'scene'},state,saving:false},global:{stubs:{ElForm:Slot,ElFormItem:Slot,ElButton:Button,ElInput:Input}}})
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(true)
  expect(wrapper.findComponent(DevDataSetDesigner).props('state')).toBe(state)
  state.writeScenarioViewText(fixtureText(50));await wrapper.vm.$nextTick()
  expect(wrapper.find('input').attributes()).toHaveProperty('disabled')
  expect(wrapper.find('button').attributes()).toHaveProperty('disabled')
  await wrapper.setProps({form:{formKey:'different'}})
  expect(wrapper.findComponent(DevDataSetDesigner).exists()).toBe(false)
  wrapper.unmount()
 })
 it('previews an actual scene snapshot before restoring and blocks dirty versions',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  const list=vi.spyOn(state.editor,'listScenarioVersions').mockResolvedValue([{version:0,fileName:'0__pagedata.json',lastModified:null}])
  const preview=vi.spyOn(state.editor,'previewScenarioVersion').mockResolvedValue(fixtureText(50))
  const restore=vi.spyOn(state.editor,'restoreScenarioVersion').mockResolvedValue()
  const Button=defineComponent({props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'})
  const wrapper=shallowMount(DevDataSetDesigner,{props:{state},global:{stubs:{ElButton:Button,ElAlert:true,ElInput:true,ElEmpty:true}}})
  await wrapper.get('[data-test="scene-history"]').trigger('click');await vi.waitFor(()=>expect(list).toHaveBeenCalled())
  await wrapper.get('[data-test="scene-preview"]').trigger('click');await vi.waitFor(()=>expect(preview).toHaveBeenCalled())
  expect(restore).not.toHaveBeenCalled()
  await wrapper.get('[data-test="scene-restore"]').trigger('click');await vi.waitFor(()=>expect(restore).toHaveBeenCalledWith({scenarioId:'scene',version:0,previewText:fixtureText(50)}))
  state.writeScenarioViewText(fixtureText(70));await wrapper.vm.$nextTick()
  expect(wrapper.get('[data-test="scene-snapshot"]').attributes()).toHaveProperty('disabled')
  wrapper.unmount()
 })
 it('discards a late scene history after the panel is closed',async()=>{
  httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}))
  const state=createDevStateWithConfigPages([], '')
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
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
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
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
  state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode())
  expect(state.scenarioViewFile.value?.scenarioId).toBe('scene')
  expect(state.statusMessages.value.some(item=>item.text.includes('工具 orders-page 文件加载失败'))).toBe(true)
 })
 beforeEach(()=>{isolateAppProjectWorkspaceForTest();localStorage.clear();httpGet.mockReset();httpPut.mockReset();httpGet.mockResolvedValue({content:''});readModels.mockReset()})
 afterEach(()=>{vi.useRealTimers()})
 it('loads exactly three tool files and retains clean undo baselines',async()=>{const state=createDevStateWithConfigPages();httpGet.mockImplementation(async()=>({content:''}));await ensureDevStateActivePageLoaded(state);await ensureDevStateActivePageLoaded(state);expect(httpGet.mock.calls).toHaveLength(3);expect(httpGet.mock.calls.map(call=>String(call[0]))).not.toContainEqual(expect.stringContaining('pagedata.json'));state.project.writePageFile({fileName:'script.js',text:'A'});expect(state.project.undoPageFile('script.js')).toBe(true);expect(state.project.readDirtyProjection().dirtyFiles.has('script.js')).toBe(false)})
 it('loads scene views through the scene gateway and undoes to a clean shared baseline',async()=>{let remote=fixtureText(20);httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?remote:''}));httpPut.mockImplementation(async(_url:string,payload:{content:string})=>{remote=payload.content});const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());expect(state.scenarioViewFile.value?.scenarioId).toBe('scene');state.writeScenarioViewText(fixtureText(50));expect(state.pageDataDirty.value).toBe(true);expect(state.scenarioViewFile.value?.undo()).toBe(true);state.scenarioViewRevision.value++;expect(state.pageDataDirty.value).toBe(false);state.writeScenarioViewText(fixtureText(70));await state.saveScenarioViewText();expect(remote).toBe(fixtureText(70));expect(state.pageDataDirty.value).toBe(false);expect(state.project.readDirtyProjection().dirtyFiles).not.toContain('pagedata.json')})
 it('rejects model structure edits and preserves the last valid scene document',async()=>{httpGet.mockImplementation(async(url:string)=>({content:url.startsWith('scenario:')?fixtureText(20):''}));const state=createDevStateWithConfigPages();state.project.replaceBlueprintChildren([sceneNode()]);await state.selectNode(sceneNode());const previous=state.scenarioViewFile.value?.getText();expect(()=>state.writeScenarioViewText(JSON.stringify({scenarioId:'scene',tables:{Orders:{columns:[],views:{default:{}}}}}))).toThrow();expect(state.scenarioViewFile.value?.getText()).toBe(previous);expect(state.pageDataDirty.value).toBe(false)})
})
