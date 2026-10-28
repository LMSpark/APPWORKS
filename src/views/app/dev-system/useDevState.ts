/**
 * @module app:views/app/dev-system/useDevState
 * 职责：提供 DevSystem 的 useDevState 能力，围绕 EditableProjectOption 等公开契约支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/useDevState。
 */
/**
 * DevSystem — 当前编辑 scope 的项目蓝图设计器状态。
 *
 * 本质：经 `ProjectBlueprint` 领域实例编辑 `{ tenantId, projectId }` 指向的项目模型。
 * 它可以是当前运行项目，也可以是被委托编辑的其他租户项目。
 *
 * - `workspace` = `getAppProjectBlueprintWorkspace(scope)`；领域真源在 `workspace.project`
 * - `project` = `workspace.project`（ProjectBlueprint；API、事件、revision、projection）
 * - 项目蓝图树 / 节点表单 / dirty：经模型 API + 显式投影 API 到 Vue ref
 * - 配置页内容：写入走 `project.writePageFile()`，保存/版本走 ProjectWorkspace
 * - 本模块只编排：Vue ref、localStorage 活动页、autoSave、SSE、状态消息
 */
import { ref, shallowRef, reactive, computed, getCurrentScope, nextTick, onScopeDispose } from 'vue'
import { createAiRunAdapter, createAiToolApprovalBridge } from '@spark-appworks/spark-app'
import type { AiRunTimelineEvent } from '@spark-appworks/spark-app'
import type { AiToolApprovalRequest } from '@spark-appworks/spark-app'
import * as ProjectBlueprintDomain from '@spark-appworks/spark-project-model'

import type { ToolApprovalDisplayItem } from '@spark-appworks/spark-component'
import {
  runPageDesignAiSession,
  type PageDesignAiRunOptions,
} from '@/services/page-design/page-design-ai-runner'
import { runProjectPlanningAiSession } from '@/services/project-planning/project-planning-ai-runner'
import {
  isProjectPlanningDocumentFile,
  uploadProjectPlanningAttachment,
} from '@/services/project-planning/project-planning-attachments'
import { getAppProjectBlueprintWorkspace } from '@/services/project/project-shell'
import type { ProjectWorkspaceScope } from '@/services/project/project-shell'
import { reloadAndSyncNavigation } from '@/services/project/project-shell'
import type {DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import { lowcodeApi, readLowcodePrincipal, createPageToolFilesIo } from '@/lowcode/lowcode-runtime'
import { APPLICATION_CATALOG_PROJECT_ID } from '@/services/tenant-scope'
import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import { BlueprintWorkspaceDataView, type BlueprintNodeFormData } from '@/services/project/blueprint-workspace-dataview'
import {PageToolFilesDataView,createChildPageWithFiles,assertRecoveredChildPermission} from '@/lowcode/resources/shared/page-tool-files-command'
import type {PageToolRestoreInput,PageToolSnapshotInput,PageToolSnapshotResult} from '@/lowcode/resources/shared/page-tool-files-command'

const {
  isConfigFilesPageSurface,
  isConfigNodeKind,
  findNodeById,
  findPageNodeByPageId,
  findNodeLocation,
  resolvePageNodePageId,
  normalizePageIdFromPath,
  PAGE_TOOL_FILE_NAMES,
} = ProjectBlueprintDomain
const DATA_SPACE_CATALOG_SCENARIO_ID = getBuiltinScenarioResource('dataSpaceCatalog').scenarioId

function createLiveTargetProxy<T extends object>(readTarget: () => T): T {
  const initial = readTarget()
  return new Proxy(initial, {
    get(_target, property) {
      const target = readTarget()
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      const boundValue: unknown = value.bind(target)
      return boundValue
    },
    set(_target, property, value) {
      return Reflect.set(readTarget(), property, value)
    },
    deleteProperty(_target, property) {
      return Reflect.deleteProperty(readTarget(), property)
    },
    has(_target, property) {
      return property in readTarget()
    },
    ownKeys() {
      return Reflect.ownKeys(readTarget())
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(readTarget(), property)
      if (!descriptor) return undefined
      return { ...descriptor, configurable: true }
    },
  })
}

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

/** Status Message 的语义模型。 */
export type StatusMessage = {
    /** 展示文本。 */
text: string
    /** 类型标识。 */
type: 'success' | 'warning' | 'error' | 'info'
    /** time 字段。 */
time: string}

/** Dev Context Config 的配置结构。 */
export type DevContextConfig = {
    /** 占位提示文本。 */
placeholder: string
    /** default Value 字段。 */
defaultValue: string
    /** param Name 名称。 */
paramName: string}

/** Dev Workspace Tab 的语义模型。 */
export type DevWorkspaceTab = 'props' | 'preview' | ProjectBlueprintDomain.PageToolFileName

/** DataView-backed page areas register the same dirty/save owner with the DevSystem shell. */
export type ExternalDataViewSession = Readonly<{
  isDirty: () => boolean
  hasUnconfirmedSave?: () => boolean
  save: () => Promise<void>
  moveBlueprintNode?: (nodeId: string, parentId: string | null, index: number) => Promise<void>
  treeProjection?: () => ProjectBlueprintDomain.ProjectBlueprintTreeData
  hasTreeProjection?: () => boolean
  childCreateActionState?: (parentNodeId:string) => 'enabled'|'hidden'|'disabled'|'unknown'
}>
type PendingPageBindingCreate={pageId:string;parentId:string;nodeId:string;projectId:string;title:string;icon:string;stage:'files'|'blueprint'|'compensate'|'done'}
type PendingMountedPageDelete={pageId:string;customPath:string;nodeId:string;projectId:string;parentNodeId:string;title:string;stage:'blueprint'|'files'}
type DevSystemOwnerBundle={key:string;workspace:ProjectBlueprintDomain.ProjectWorkspace;scopeFingerprint:string;leaseGeneration:number;runtime:PageRuntime;blueprint:BlueprintWorkspaceDataView;files:PageToolFilesDataView;assertCurrent:(()=>void)|undefined;pendingMountedPageDelete:PendingMountedPageDelete|undefined;pendingPageBindingCreate:PendingPageBindingCreate|undefined}
const devSystemOwnerBundles=new WeakMap<ProjectBlueprintDomain.ProjectWorkspace,Map<string,DevSystemOwnerBundle>>()
let devSystemLeaseGeneration=0
function devSystemOwnerKey(scope:ProjectWorkspaceScope):string{return JSON.stringify([scope.tenantId,scope.projectId])}
async function fingerprintRequestScope(token:string):Promise<string>{
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')
}
function getDevSystemOwnerBundle(workspace:ProjectBlueprintDomain.ProjectWorkspace,key:string):DevSystemOwnerBundle|undefined{return devSystemOwnerBundles.get(workspace)?.get(key)}
function setDevSystemOwnerBundle(bundle:DevSystemOwnerBundle):void{let byScope=devSystemOwnerBundles.get(bundle.workspace);if(!byScope){byScope=new Map();devSystemOwnerBundles.set(bundle.workspace,byScope)}byScope.set(bundle.key,bundle)}
function deleteDevSystemOwnerBundle(workspace:ProjectBlueprintDomain.ProjectWorkspace,key:string):void{const byScope=devSystemOwnerBundles.get(workspace);byScope?.delete(key);if(byScope?.size===0)devSystemOwnerBundles.delete(workspace)}

// ═══════════════════════════════════════════════════════════
// 共享状态工厂
// ═══════════════════════════════════════════════════════════

export function useDevState() {
  const initialPrincipal = readLowcodePrincipal()
  const initialScope: ProjectWorkspaceScope = {
    tenantId: initialPrincipal?.enterpriseName ?? 'platform',
    projectId: initialPrincipal?.applicationId ?? APPLICATION_CATALOG_PROJECT_ID,
  }
  const activeEditScope = ref<ProjectWorkspaceScope>(initialScope)
  const currentEditor = shallowRef<ProjectBlueprintDomain.ProjectWorkspace>(getAppProjectBlueprintWorkspace(initialScope))
  const editor = createLiveTargetProxy<ProjectBlueprintDomain.ProjectWorkspace>(() => currentEditor.value)
  const project = createLiveTargetProxy<ProjectBlueprintDomain.ProjectBlueprint>(() => currentEditor.value.project)
  const tenantId = computed(() => activeEditScope.value.tenantId)
  const projectId = computed(() => activeEditScope.value.projectId)
  const projectPicker = reactive({
    tenantId: initialScope.tenantId,
    projectId: initialScope.projectId,
  })
  const externalDataViewRevision = ref(0)
  const externalDataViewSessions = new Set<ExternalDataViewSession>()
  const blueprintWorkspaceDataView = shallowRef<BlueprintWorkspaceDataView>()
  const blueprintPageRuntime = shallowRef<PageRuntime>()
  let pageToolFilesDataView:PageToolFilesDataView|undefined
  let pendingMountedPageDelete:PendingMountedPageDelete|undefined
  let pendingPageBindingCreate:PendingPageBindingCreate|undefined
  let activeOwnerBundle:DevSystemOwnerBundle|undefined
  let ownerLeaseGeneration=0
  let ownerScopeToken:string|undefined
  let blueprintWorkspaceLoad: Promise<BlueprintWorkspaceDataView> | undefined
  let blueprintWorkspaceLoadRevision=0
  let unregisterBlueprintWorkspaceSession:(()=>void)|undefined
  const assertOwnerBundleCurrent=(bundle:DevSystemOwnerBundle):void=>{
    if(activeOwnerBundle!==bundle||bundle.leaseGeneration!==ownerLeaseGeneration||bundle.assertCurrent===undefined)throw new Error('DevSystem DataView owner 当前未被同项目工作区持有')
    if(ownerScopeToken===undefined||lowcodeApi.readRequestScope().token!==ownerScopeToken)throw new Error('DevSystem owner 认证请求作用域已变化')
    bundle.assertCurrent()
  }
  function releaseBlueprintWorkspaceDataView():void{
    blueprintWorkspaceLoadRevision++
    unregisterBlueprintWorkspaceSession?.();unregisterBlueprintWorkspaceSession=undefined
    const bundle=activeOwnerBundle
    if(bundle?.leaseGeneration===ownerLeaseGeneration){
      bundle.pendingMountedPageDelete=pendingMountedPageDelete
      bundle.pendingPageBindingCreate=pendingPageBindingCreate
      const pending=!!pendingMountedPageDelete||!!pendingPageBindingCreate||bundle.blueprint.hasPendingBlueprintCommand
        ||bundle.blueprint.isBusy||bundle.blueprint.dirty||bundle.files.dirty||bundle.files.hasUnconfirmedSave||bundle.files.hasPendingFileSave||bundle.files.hasPendingRestoreDelivery
      bundle.assertCurrent=undefined
      ownerScopeToken=undefined
      if(!pending){deleteDevSystemOwnerBundle(bundle.workspace,bundle.key);bundle.blueprint.dispose();bundle.runtime.dispose()}
    }else if(!bundle){
      blueprintWorkspaceDataView.value?.dispose()
      blueprintPageRuntime.value?.dispose()
    }
    ownerScopeToken=undefined
    activeOwnerBundle=undefined
    blueprintWorkspaceDataView.value=undefined
    pageToolFilesDataView=undefined
    blueprintPageRuntime.value=undefined
    blueprintWorkspaceLoad=undefined
    externalDataViewRevision.value++
  }
  async function loadBlueprintWorkspaceDataView():Promise<BlueprintWorkspaceDataView>{
    const projectKey=projectId.value,workspace=currentEditor.value
    if(blueprintWorkspaceDataView.value?.projectId===projectKey){if(activeOwnerBundle)assertOwnerBundleCurrent(activeOwnerBundle);return blueprintWorkspaceDataView.value}
    const bundleKey=devSystemOwnerKey(activeEditScope.value)
    const scopeToken=lowcodeApi.readRequestScope().token
    const parked=getDevSystemOwnerBundle(workspace,bundleKey)
    if(parked){
      if(parked.assertCurrent!==undefined)throw new Error('DEV_SYSTEM_OWNER_LEASE_ACTIVE: 同项目 DataView owner 仍由另一 SPA scope 持有')
      const fingerprint=await fingerprintRequestScope(scopeToken)
      if(parked.scopeFingerprint!==fingerprint)throw new Error('DEV_SYSTEM_OWNER_AUTH_SCOPE: 同项目存在另一认证上下文的待处理 owner；拒绝交叉续接')
      if(devSystemOwnerBundles.get(workspace)?.get(bundleKey)!==parked||lowcodeApi.readRequestScope().token!==scopeToken)throw new Error('DEV_SYSTEM_OWNER_AUTH_SCOPE: owner 核验期间认证上下文或租约已变化')
      if(parked.blueprint.projectId!==projectKey||parked.runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)!==parked.blueprint.dataSet)throw new Error('DEV_SYSTEM_OWNER_IDENTITY: parked owner 不属于当前项目或运行时')
      const tenantKey=activeEditScope.value.tenantId
      const guard=()=>{if(activeEditScope.value.tenantId!==tenantKey||projectId.value!==projectKey||currentEditor.value!==workspace||lowcodeApi.readRequestScope().token!==scopeToken)throw new Error('DevSystem owner lease 已失效')}
      parked.leaseGeneration=++devSystemLeaseGeneration
      ownerLeaseGeneration=parked.leaseGeneration
      ownerScopeToken=scopeToken
      parked.assertCurrent=guard
      parked.blueprint.rebindScope(()=>assertOwnerBundleCurrent(parked))
      parked.files.rebindScope({assertCurrent:()=>assertOwnerBundleCurrent(parked),assertPendingFileSavePage:(page:ProjectBlueprintDomain.PageTool,_fileName:string,requireActive:boolean)=>{
        if(workspace.project.findPageTool(page.pageId)!==page||requireActive&&workspace.project.getActivePage()!==page)throw new Error('PAGE_TOOL_FILE_SAVE_STALE: 原文件提交所属页面身份已变化')
      }})
      activeOwnerBundle=parked
      pendingMountedPageDelete=parked.pendingMountedPageDelete
      pendingPageBindingCreate=parked.pendingPageBindingCreate
      blueprintPageRuntime.value=parked.runtime
      blueprintWorkspaceDataView.value=parked.blueprint
      pageToolFilesDataView=parked.files
      const session=parked.blueprint,fileOwner=parked.files
      const external:ExternalDataViewSession={isDirty:()=>session.dirty||fileOwner.dirty,hasUnconfirmedSave:()=>session.hasPendingBlueprintCommand||fileOwner.hasUnconfirmedSave||fileOwner.hasPendingFileSave,save:async()=>{
        assertOwnerBundleCurrent(parked)
        if(pendingMountedPageDelete){await completePendingMountedPageDelete();return}
        if(pendingPageBindingCreate){await resumePendingPageBindingCreate();return}
        if(fileOwner.hasPendingFileSave){await fileOwner.savePageFiles();refreshBlueprintTreeProjection();return}
        if(fileOwner.dirty||fileOwner.hasUnconfirmedSave){if(!fileOwner.hasPendingPageDelete||fileOwner.hasPendingNonDeleteCommand)throw new Error('PAGE_TOOL_CHILD_CREATE_PENDING: 文件命令属于子节点创建流程；请通过原新增子节点入口核验并继续创建导航行');await fileOwner.save();refreshBlueprintTreeProjection();return}
        await session.save();await fileOwner.save();refreshBlueprintTreeProjection()},
        moveBlueprintNode:(id,parent,index)=>session.moveNode(id,parent,index),treeProjection:()=>session.treeProjection(),hasTreeProjection:()=>session.hasTreeProjection,
        childCreateActionState:id=>session.childCreateActionState(id)}
      unregisterBlueprintWorkspaceSession=registerExternalDataViewSession(external)
      return session
    }
    if(blueprintWorkspaceLoad)return blueprintWorkspaceLoad
    const revision=++blueprintWorkspaceLoadRevision
    let loadScopeToken=scopeToken
    const loading=(async()=>{
      const runtime=new PageRuntime({pageId:'dev-system-blueprint-workspace',scenarioIds:[LOWCODE_APPLICATION_CATALOG_FORM_KEY,DATA_SPACE_CATALOG_SCENARIO_ID,LowcodeDictionary.editorScenarioId],mainScenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,
        loadScenario:async scenarioId=>{
          const assertCurrent=()=>{if(revision!==blueprintWorkspaceLoadRevision||projectId.value!==projectKey||currentEditor.value!==workspace||lowcodeApi.readRequestScope().token!==loadScopeToken)throw new Error('蓝图 DataView 项目或认证作用域已切换')}
          assertCurrent()
          if(scenarioId===LOWCODE_APPLICATION_CATALOG_FORM_KEY)return loadLowcodeRuntimeScenario({projectId:projectKey,scenarioId})
          if(scenarioId===DATA_SPACE_CATALOG_SCENARIO_ID)return loadLowcodeRuntimeScenario({projectId:projectKey,scenarioId})
          if(scenarioId===LowcodeDictionary.editorScenarioId)return (await LowcodeDictionary.loadEditor()).dataSet
          throw new Error(`蓝图运行时未声明场景 ${scenarioId}`)
        }})
      try{await runtime.load()}catch(error){loadScopeToken='';runtime.dispose();throw error}
      loadScopeToken=''
      const dataSet=runtime.getDataSet(LOWCODE_APPLICATION_CATALOG_FORM_KEY)
      if(!dataSet){runtime.dispose();throw new Error('蓝图运行时缺少正式目录DataSet')}
      if(revision!==blueprintWorkspaceLoadRevision||projectId.value!==projectKey||currentEditor.value!==workspace||lowcodeApi.readRequestScope().token!==scopeToken){runtime.dispose();throw new Error('蓝图 DataView 项目或认证作用域已切换')}
      const scopeFingerprint=await fingerprintRequestScope(scopeToken)
      if(revision!==blueprintWorkspaceLoadRevision||projectId.value!==projectKey||currentEditor.value!==workspace||lowcodeApi.readRequestScope().token!==scopeToken){runtime.dispose();throw new Error('蓝图 DataView 项目或认证作用域已切换')}
      let session:BlueprintWorkspaceDataView
      try{
        const tenantKey=activeEditScope.value.tenantId
        let assertLease:()=>void=()=>{throw new Error('DevSystem DataView owner 尚未取得活动租约')}
        session=new BlueprintWorkspaceDataView(dataSet,projectKey,()=>assertLease())
        const files=new PageToolFilesDataView(dataSet,projectKey,createPageToolFilesIo(projectKey),()=>assertLease())
        const bundle:DevSystemOwnerBundle={key:bundleKey,workspace,scopeFingerprint,leaseGeneration:++devSystemLeaseGeneration,runtime,blueprint:session,files,
          assertCurrent:undefined,pendingMountedPageDelete:undefined,pendingPageBindingCreate:undefined}
        ownerLeaseGeneration=bundle.leaseGeneration
        ownerScopeToken=scopeToken
        assertLease=()=>assertOwnerBundleCurrent(bundle)
        bundle.assertCurrent=()=>{if(activeEditScope.value.tenantId!==tenantKey||projectId.value!==projectKey||currentEditor.value!==workspace)throw new Error('DevSystem DataView scope 已失效')}
        activeOwnerBundle=bundle
        setDevSystemOwnerBundle(bundle)
        pageToolFilesDataView=files
      }catch(error){runtime.dispose();throw error}
      const fileOwner=pageToolFilesDataView
      blueprintPageRuntime.value=runtime;blueprintWorkspaceDataView.value=session
      const external:ExternalDataViewSession={isDirty:()=>session.dirty||fileOwner.dirty,hasUnconfirmedSave:()=>session.hasPendingBlueprintCommand||fileOwner.hasUnconfirmedSave||fileOwner.hasPendingFileSave,save:async()=>{
        if(pendingMountedPageDelete){await completePendingMountedPageDelete();return}
        if(pendingPageBindingCreate){await resumePendingPageBindingCreate();return}
        if(fileOwner.hasPendingFileSave){await fileOwner.savePageFiles();refreshBlueprintTreeProjection();return}
        if(fileOwner.dirty||fileOwner.hasUnconfirmedSave){
          if(!fileOwner.hasPendingPageDelete||fileOwner.hasPendingNonDeleteCommand)throw new Error('PAGE_TOOL_CHILD_CREATE_PENDING: 文件命令属于子节点创建流程；请通过原新增子节点入口核验并继续创建导航行')
          await fileOwner.save();refreshBlueprintTreeProjection();return
        }
        await session.save();await fileOwner.save();refreshBlueprintTreeProjection()},
        moveBlueprintNode:(id,parent,index)=>session.moveNode(id,parent,index),treeProjection:()=>session.treeProjection(),hasTreeProjection:()=>session.hasTreeProjection,
        childCreateActionState:id=>session.childCreateActionState(id)}
      unregisterBlueprintWorkspaceSession=registerExternalDataViewSession(external)
      return session
    })().finally(()=>{if(blueprintWorkspaceLoad===loading)blueprintWorkspaceLoad=undefined})
    blueprintWorkspaceLoad=loading
    return loading
  }
  async function loadNavigationDictionaryOptions():Promise<void>{
    const runtime=blueprintPageRuntime.value
    if(!runtime?.isLoaded)throw new Error('导航字典候选所需 PAGE_RUNTIME 未就绪')
    const projectKey=projectId.value,revision=blueprintWorkspaceLoadRevision
    const scenarioId=LowcodeDictionary.editorScenarioId
    for(const [viewId,typeId,expected] of [
      ['NavigationShowType_Content','6AC2214E0E68E3D0C642A23F7224B666',['0','1']],
      ['Navigationposition','5BFAFA09FE5D58B02F9994D6712B7098',['Left','Center','Right']],
    ] as const){
      const view=runtime.resolveView(`${scenarioId}@_Base_DictData@${viewId}`)
      if(!view)throw new Error(`导航字典视图缺失 ${viewId}`)
      if(view.rows.length===0){await view.refresh();if(blueprintPageRuntime.value!==runtime||runtime.destroyed||projectId.value!==projectKey||blueprintWorkspaceLoadRevision!==revision||view.destroyed)throw new Error('导航字典候选查询已因项目切换失效');if(view.loadingError)throw view.loadingError}
      const rows=view.rows
      if(rows.length!==expected.length||rows.some(row=>row['typeid']!==typeId||['typeid','val','txt'].some(field=>view.fieldAccess(row,field).read!=='visible')))throw new Error(`导航字典 ${viewId} 返回候选不完整或字段不可读`)
      const values=rows.map(row=>String(row['val']))
      if(expected.some(value=>!values.includes(value)))throw new Error(`导航字典 ${viewId} 候选值不符合正式映射`)
    }
  }
  /**
   * 通过当前蓝图运行 DataSet 中的 file 命令视图创建并回读工具快照。
   * @param input 当前页面、文件路径、文件原文与异步作用域守卫。
   * @returns 文件 owner 已确认的快照编号及文件名。
   */
  async function createPageToolSnapshot(input:PageToolSnapshotInput):Promise<PageToolSnapshotResult>{
    await loadBlueprintWorkspaceDataView()
    const owner=pageToolFilesDataView
    if(!owner)throw new Error('PAGE_TOOL_SNAPSHOT_DATAVIEW_REQUIRED: 工具文件DataView尚未装配')
    return owner.createSnapshot(input)
  }
  async function restorePageToolVersion(input:Omit<PageToolRestoreInput,'baselineText'>&Readonly<{projectId:string}>):Promise<string>{
    const workspace=currentEditor.value,scope=currentScopeKey(),owner=await loadBlueprintWorkspaceDataView(),fileOwner=pageToolFilesDataView
    const page=workspace.project.findPageTool(input.pageId)
    if(input.projectId!==projectId.value||input.customPath!==`${input.projectId}/${input.pageId}`
      ||fileOwner?.ownerDataSet!==owner.dataSet||page?.isLoaded!==true||workspace.project.getActivePage()!==page) {
      throw new Error('PAGE_TOOL_RESTORE_OWNER: 活跃项目、页面或文件命令DataView身份不匹配')
    }
    if(page.getDirtyFileNames().includes(input.fileName)
      ||workspace.unconfirmedPageFiles.some(target=>target.pageId===input.pageId&&target.fileName===input.fileName)
      ||fileOwner.hasUnconfirmedPageFile(input.pageId,input.fileName)) {
      throw new Error('PAGE_TOOL_RESTORE_LOCAL_PENDING: 文件有未保存或未确认修改')
    }
    const baselineText=page.getSavedFileText(input.fileName)
    if(page.getFileText(input.fileName)!==baselineText)throw new Error('PAGE_TOOL_RESTORE_LOCAL_PENDING: 当前文件与保存基线不一致')
    const assertCurrent=()=>{
      input.assertCurrent()
      if(currentEditor.value!==workspace||currentScopeKey()!==scope||projectId.value!==input.projectId
        ||workspace.project.findPageTool(input.pageId)!==page||workspace.project.getActivePage()!==page) {
        throw new Error('PAGE_TOOL_RESTORE_STALE: 工作区、页面或本地文件目标已改变')
      }
    }
    const text=await fileOwner.restoreVersion({...input,baselineText,assertCurrent})
    assertCurrent()
    if(page.getFileText(input.fileName)!==baselineText||page.getSavedFileText(input.fileName)!==baselineText) {
      fileOwner.acknowledgeRestoreDelivery(input.pageId,input.fileName,input.version)
      throw new Error('PAGE_TOOL_RESTORE_REMOTE_CONFIRMED_LOCAL_CHANGED: 远端恢复已确认，本地新修改已保留')
    }
    page.hydrateFileText(input.fileName,text)
    workspace.project.markPageFileChanged(input.pageId,input.fileName)
    fileOwner.acknowledgeRestoreDelivery(input.pageId,input.fileName,input.version)
    return text
  }
  async function savePageToolFile(input:{pageId:string;fileName:ProjectBlueprintDomain.PageToolFileName;submittedText?:string;requireActive?:boolean}):Promise<void>{
    const {pageId,fileName,submittedText,requireActive=true}=input
    const workspace=currentEditor.value,scope=currentScopeKey(),owner=await loadBlueprintWorkspaceDataView(),fileOwner=pageToolFilesDataView
    const page=workspace.project.findPageTool(pageId)
    if(fileOwner?.ownerDataSet!==owner.dataSet||page?.isLoaded!==true||(requireActive&&workspace.project.getActivePage()!==page))throw new Error('PAGE_TOOL_FILE_SAVE_OWNER: 活跃 PageToolFilesDataView、DataSet 或页面身份不匹配')
    const text=submittedText??page.getFileText(fileName),revision=workspace.project.revision
    await fileOwner.savePageFile({page,fileName,text,revision,requireActive,assertCurrent:()=>{
      if(currentEditor.value!==workspace||currentScopeKey()!==scope||workspace.project.findPageTool(pageId)!==page||requireActive&&workspace.project.getActivePage()!==page)throw new Error('PAGE_TOOL_FILE_SAVE_STALE: 工作区、页面或owner已切换')
    }})
    workspace.project.markPageFileChanged(pageId,fileName)
  }
  function registerExternalDataViewSession(session: ExternalDataViewSession): () => void {
    externalDataViewSessions.add(session)
    externalDataViewRevision.value++
    return () => {externalDataViewSessions.delete(session); externalDataViewRevision.value++}
  }
  function notifyExternalDataViewChanged(): void {externalDataViewRevision.value++}
  async function completePendingMountedPageDelete():Promise<void>{
    const pending=pendingMountedPageDelete
    if(!pending)return
    if(projectId.value!==pending.projectId)throw new Error('MOUNTED_PAGE_DELETE_SCOPE: 项目身份已切换')
    let blueprintDeleted=pending.stage==='files'
    try{
      if(pending.stage==='blueprint'){
        const owner=await loadBlueprintWorkspaceDataView()
        const fileOwner=pageToolFilesDataView
        if(!fileOwner)throw new Error('PAGE_TOOL_FILE_DELETE_OWNER: 文件命令 DataView 尚未装配')
        await fileOwner.preflightDeletePageFiles(pending.pageId,pending.customPath)
        await owner.removeLeafNode(pending.nodeId,pending.projectId,pending.parentNodeId)
        pending.stage='files';blueprintDeleted=true
        refreshBlueprintTreeProjection();externalDataViewRevision.value++
      }
      const fileOwner=pageToolFilesDataView
      if(!fileOwner)throw new Error('PAGE_TOOL_FILE_DELETE_OWNER: 文件命令 DataView 尚未装配')
      await fileOwner.deletePageFiles(pending.pageId,pending.customPath)
      project.closePageDesign(pending.pageId);project.markPageLoadedChanged(pending.pageId,false)
      if(selectedNode.value?.nodeId===pending.nodeId){project.selectNode(null);clearActivePageContext()}
      bumpPageCache(pending.pageId,'__deleted')
      pendingMountedPageDelete=undefined
      void syncRuntimeNavigationIfDefaultProject()
      addStatus(`已删除 ${pending.title}`,'info')
    }catch(error){
      if(blueprintDeleted)throw new Error(`MOUNTED_PAGE_FILE_DELETE_PARTIAL: 蓝图节点已删除，文件清理待确认：${String(error)}`)
      throw error
    }
  }
  async function resumePendingPageBindingCreate():Promise<void>{
    const pending=pendingPageBindingCreate
    if(!pending)return
    if(projectId.value!==pending.projectId||currentEditor.value.project.projectId!==pending.projectId)throw new Error('PAGE_BINDING_SCOPE: 项目身份已切换')
    const fileOwner=pageToolFilesDataView
    if(!fileOwner)throw new Error('PAGE_TOOL_FILE_OWNER: 文件命令 DataView 尚未装配')
    if(pending.stage==='compensate'){
      await fileOwner.compensateCreate(pending.pageId,pending.parentId)
      pendingPageBindingCreate=undefined
      addStatus(`工具 ${pending.pageId} 蓝图绑定失败，默认页面文件已按原补偿命令清理`,'warning')
      return
    }
    const scope=currentScopeKey(),workspace=currentEditor.value
    const assertTarget=()=>{if(currentScopeKey()!==scope||currentEditor.value!==workspace
      ||selectedNode.value?.nodeId!==pending.nodeId)throw new Error('工具创建期间原项目或节点目标已切换')}
    assertTarget()
    if(pending.stage==='files'){
      await fileOwner.create(pending.parentId,pending.pageId);assertTarget()
      pending.stage='blueprint'
    }
    const owner=await loadBlueprintWorkspaceDataView();assertTarget()
    if(owner.projectId!==pending.projectId||owner.nodeId!==pending.nodeId)throw new Error('PAGE_BINDING_IDENTITY: 蓝图 DataView 目标身份不匹配')
    try{
      if(owner.hasUnconfirmedSave){await owner.saveSelectedNode();assertTarget()}
      else{
        if(owner.dirty)throw new Error('蓝图 DataView 有待保存修改，请先完成保存或取消')
        const before=owner.nodeData()
        const navigation={...(before.navigation??{order:0}),title:pending.title,target:`cfg:${pending.pageId}`,icon:pending.icon,
          publishInMenu:true,showChildren:true,beginGroup:false}
        const next:BlueprintNodeFormData={...before,kind:'page',navigation}
        owner.preflightNodeData(next);owner.updateNodeData(next)
        blueprintDraftRevision.value++;externalDataViewRevision.value++
        await owner.saveSelectedNode();assertTarget()
      }
    }catch(error){
      if(owner.hasUnconfirmedSave)throw error
      if(owner.dirty)owner.cancel()
      pending.stage='compensate'
      try{await fileOwner.compensateCreate(pending.pageId,pending.parentId);pendingPageBindingCreate=undefined}
      catch(cleanupError){throw new Error(`PAGE_BINDING_COMPENSATION_PENDING: ${String(error)}; ${String(cleanupError)}`)}
      throw error
    }
    pending.stage='done'
    pendingPageBindingCreate=undefined
    refreshBlueprintTreeProjection();notifyExternalDataViewChanged()
    if(isDefaultUserProjectScope())await reloadAndSyncNavigation()
    handlePathChange(`/${pending.pageId}`);bumpPageCache(pending.pageId,'__created')
    await editor.selectPage(pending.pageId);assertTarget()
    persistActivePageId(pending.pageId)
    addStatus(`工具 ${pending.pageId} 的导航绑定已通过 Base_NavigationInfo DataView 保存`,'success')
  }
  async function moveBlueprintNodeInDataView(nodeId: string, parentId: string | null, index: number): Promise<void> {
    if (blueprintDirty.value) throw new Error('节点基本信息有未保存草稿，请先保存或取消后再移动树节点')
    const owners = [...externalDataViewSessions].filter(session => session.moveBlueprintNode)
    const owner=owners[0]
    if (owners.length !== 1 || !owner?.moveBlueprintNode) throw new Error('BLUEPRINT_TREE_DATAVIEW_REQUIRED: 当前项目必须恰有一个树行 DataView owner')
    await owner.moveBlueprintNode(nodeId, parentId, index)
    refreshBlueprintTreeProjection(owner)
    notifyExternalDataViewChanged()
  }
  async function loadBlueprintTreeFromDataView():Promise<ProjectBlueprintDomain.ProjectBlueprintTreeData>{
    const scope=currentScopeKey(),workspace=currentEditor.value
    const owner=await loadBlueprintWorkspaceDataView()
    const tree=await owner.loadProjectTree()
    if(currentScopeKey()!==scope||currentEditor.value!==workspace)throw new Error('蓝图 DataView 树结果所属项目已切换')
    if(blueprintDirty.value)throw new Error('节点基本信息有未保存草稿，不能用 DataView 首载覆盖')
    workspace.ingestBlueprintTree(tree,{selectedNodeId:workspace.project.session.session.selectedNodeId})
    projectRevision.value=workspace.project.revision
    blueprintTreeUnavailableScope.value=''
    return tree
  }
  function refreshBlueprintTreeProjection(session?: ExternalDataViewSession): void {
    // ingestBlueprintTree marks the ProjectBlueprint draft clean. Never let a
    // DataView projection erase the independent node-basic-info draft.
    if (blueprintDirty.value) return
    const owner=session??[...externalDataViewSessions].find(candidate=>candidate.treeProjection)
    if(!owner)throw new Error('BLUEPRINT_TREE_DATAVIEW_REQUIRED: 没有可读取树投影的 DataView owner')
    if(!owner.treeProjection||owner.hasTreeProjection?.()===false)return
    currentEditor.value.ingestBlueprintTree(owner.treeProjection(),{selectedNodeId:project.session.session.selectedNodeId})
    projectRevision.value=project.revision
  }
  function hasExternalDataViewChanges(): boolean {
    void externalDataViewRevision.value
    return [...externalDataViewSessions].some(session => session.isDirty() || session.hasUnconfirmedSave?.() === true)
  }
  function childCreateActionState(parentNodeId:string):'enabled'|'hidden'|'disabled'|'unknown'{
    void externalDataViewRevision.value
    const owners=[...externalDataViewSessions].filter(session=>session.childCreateActionState)
    if(owners.length!==1)return 'unknown'
    const owner=owners[0]
    if(!owner?.childCreateActionState)return 'unknown'
    try{return owner.childCreateActionState(parentNodeId)}catch{return 'unknown'}
  }
  const pageFileNames = PAGE_TOOL_FILE_NAMES

  // ── 项目蓝图树（ProjectBlueprint 投影，非独立真源）──
  const blueprintLoading = ref(false)
  const blueprintSaving = ref(false)
  const blueprintDraftRevision = ref(0)
  const projectRevision = ref(project.revision)
  const loadedBlueprintScopeKeys = new Set<string>()
  const blueprintTreeLoadFlights = new Map<string,Promise<void>>()
  const blueprintTreeUnavailableScope = ref('')
  let blueprintLoadRevision=0

  function currentScopeKey(): string {
    return `${activeEditScope.value.tenantId}:${activeEditScope.value.projectId}`
  }

  function isDefaultUserProjectScope(): boolean {
    const principal = readLowcodePrincipal()
    const runtimeScope = principal === null
      ? initialScope
      : { tenantId: principal.enterpriseName, projectId: principal.applicationId ?? APPLICATION_CATALOG_PROJECT_ID }
    return activeEditScope.value.tenantId === runtimeScope.tenantId
      && activeEditScope.value.projectId === runtimeScope.projectId
  }

  function readBlueprintProjection() {
    void projectRevision.value
    void blueprintTreeUnavailableScope.value
    if(blueprintTreeUnavailableScope.value===currentScopeKey())return { tree: [], selectedNode: null, selectedNodeId: null, blueprintLocation: null, blueprintDraft: null, pageDeliveries: [] }
    return project.hasLoadedBlueprint ? project.readBlueprintProjection() : { tree: [], selectedNode: null, selectedNodeId: null, blueprintLocation: null, blueprintDraft: null, pageDeliveries: [] }
  }

  const blueprintProjection = computed(() => readBlueprintProjection())
  const activePageProjection = computed(() => {
    void projectRevision.value
    return project.readActivePageProjection()
  })
  const dirtyProjection = computed(() => {
    void projectRevision.value
    return project.readDirtyProjection()
  })
  const treeData = computed(() => blueprintProjection.value.tree)
  const pageList = computed(() => blueprintProjection.value.pageDeliveries)
  const selectedNode = computed(() => blueprintProjection.value.selectedNode)
  const blueprintEmpty = computed(() => blueprintProjection.value.tree.length === 0)
  const activePageId = computed(() => activePageProjection.value.pageId)

  function handleProjectBlueprintEvent(): void {
    projectRevision.value = project.revision
    refreshBlueprintDraftBindings()
  }

  let unsubscribeProjectBlueprint = currentEditor.value.project.subscribe(handleProjectBlueprintEvent)

  function bindProjectBlueprintEvents(): void {
    unsubscribeProjectBlueprint()
    unsubscribeProjectBlueprint = currentEditor.value.project.subscribe(handleProjectBlueprintEvent)
    projectRevision.value = currentEditor.value.project.revision
    refreshBlueprintDraftBindings()
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      unsubscribeProjectBlueprint()
      installScenarioDocument(null)
      releaseBlueprintWorkspaceDataView()
      cancelAutoSave()
    })
  }

  function normalizeEditScope(scope: Partial<ProjectWorkspaceScope>): ProjectWorkspaceScope {
    const scopedTenantId = scope.tenantId?.trim()
    const pickerTenantId = projectPicker.tenantId.trim()
    const scopedProjectId = scope.projectId?.trim()
    const pickerProjectId = projectPicker.projectId.trim()
    const normalizedTenantId = scopedTenantId && scopedTenantId.length > 0
      ? scopedTenantId
      : (pickerTenantId.length > 0 ? pickerTenantId : tenantId.value)
    const normalizedProjectId = scopedProjectId && scopedProjectId.length > 0
      ? scopedProjectId
      : (pickerProjectId.length > 0 ? pickerProjectId : projectId.value)
    if (!normalizedTenantId) throw new Error('tenantId 不能为空')
    if (!normalizedProjectId) throw new Error('projectId 不能为空')
    return { tenantId: normalizedTenantId, projectId: normalizedProjectId }
  }

  function sameEditScope(scope: ProjectWorkspaceScope): boolean {
    return tenantId.value === scope.tenantId && projectId.value === scope.projectId
  }

  async function openEditingProject(
    scope: Partial<ProjectWorkspaceScope>,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    const nextScope = normalizeEditScope(scope)
    if (sameEditScope(nextScope)) return true

    if(pendingPageBindingCreate){
      addStatus('工具页面创建流程尚未完成，请在原项目中保存并核验后再切换','warning')
      projectPicker.tenantId=tenantId.value;projectPicker.projectId=projectId.value
      return false
    }

    if(pendingMountedPageDelete){
      addStatus('挂载页面删除流程尚未完成，请在原项目中保存并核验后再切换','warning')
      projectPicker.tenantId=tenantId.value;projectPicker.projectId=projectId.value
      return false
    }

    if([...externalDataViewSessions].some(session=>session.hasUnconfirmedSave?.())){
      addStatus('DataView 保存回执仍未确认，先核验原目标后才能切换项目', 'warning')
      projectPicker.tenantId=tenantId.value;projectPicker.projectId=projectId.value
      return false
    }

    if ((project.readDirtyProjection().hasAnyDirty || editor.dirtyScenarioIds.length > 0 || hasExternalDataViewChanges()) && options.force !== true) {
      addStatus('当前项目模型还有未保存改动，请先保存后再切换编辑项目', 'warning')
      projectPicker.tenantId = tenantId.value
      projectPicker.projectId = projectId.value
      return false
    }

    cancelAutoSave()
    blueprintLoadRevision++
    blueprintTreeLoadFlights.clear()
    releaseBlueprintWorkspaceDataView()
    loadedBlueprintScopeKeys.clear()
    activeEditScope.value = nextScope
    projectPicker.tenantId = nextScope.tenantId
    projectPicker.projectId = nextScope.projectId
    installScenarioDocument(null)
    currentEditor.value = getAppProjectBlueprintWorkspace(nextScope)
    bindProjectBlueprintEvents()
    linkProbeInfo.value = null
    autoSaveStatus.value = 'idle'
    await loadBlueprint({ preserveActivePageId: readPersistedActivePageId() })
    return true
  }

  async function openProjectPickerScope(options?: { force?: boolean }): Promise<boolean> {
    return openEditingProject({
      tenantId: projectPicker.tenantId,
      projectId: projectPicker.projectId,
    }, options)
  }

  async function syncRuntimeNavigationIfDefaultProject(): Promise<void> {
    if (isDefaultUserProjectScope()) {
      await reloadAndSyncNavigation()
    }
  }

  function refreshBlueprintDraftBindings(): void {
    blueprintDraftRevision.value++
  }

  const emptyDraft: BlueprintNodeFormData = { nodeId: '', parentNodeId: '', projectId: projectId.value, kind: 'unknown', capability: {}, source: {} }
  const nodeFormGroupFields:Record<string,readonly string[]>={
    capability:['name','memo','funCode','personCharge','status'],kind:['conType'],
    navigation:['FunName','FunOrderValue','NavigationImageWxz','NavigationUrl','MobileUrl','NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment','IsShowAtNav','IsShowChildItem','BeginGroup'],
    dataSpace:['conid'],prototype:['htmlDesc'],
  }
  function readNodeFormTarget():BlueprintNodeFormData{
    void blueprintDraftRevision.value
    const session=blueprintWorkspaceDataView.value
    if(session?.nodeId&&session.nodeId===selectedNode.value?.nodeId){try{return session.nodeData()}catch{/* no node form values until the selected DataView row is valid */}}
    return emptyDraft
  }
  function writeNodeFormSection(section:string,value:unknown):void{
    const session=blueprintWorkspaceDataView.value,node=readNodeFormTarget()
    if(!session?.nodeId||session.nodeId!==node.nodeId||session.projectId!==projectId.value)throw new Error('当前节点 DataView 尚未就绪，不能编辑蓝图字段')
    const next={...node}
    Object.defineProperty(next,section,{value,configurable:true,enumerable:true,writable:true})
    session.updateNodeData(next)
    blueprintDraftRevision.value++;externalDataViewRevision.value++
    refreshBlueprintTreeProjection()
  }
  const nestedFormProxies=new Map<string,object>()
  const nodeGroup=(node:BlueprintNodeFormData,section:string):object|undefined=>{
    if(section==='capability')return node.capability
    if(section==='navigation')return node.navigation
    if(section==='dataSpace')return node.dataSpace
    if(section==='prototype')return node.prototype
    return undefined
  }
  function nodeFormSectionProxy(section:string):object{
    const existing=nestedFormProxies.get(section);if(existing)return existing
    const proxy=new Proxy({}, {
      get(_target,property){const group=nodeGroup(readNodeFormTarget(),section);if(group===undefined)return undefined;const value:unknown=Object.getOwnPropertyDescriptor(group,property)?.value;return value},
      set(_target:object,property:PropertyKey,value:unknown){const group=nodeGroup(readNodeFormTarget(),section);if(!group)throw new Error(`当前蓝图节点没有 ${section} 配置`);const next=Object.assign({},group,{[property]:value});writeNodeFormSection(section,next);return true},
      deleteProperty(){throw new Error('蓝图节点字段不能直接删除')},
      has(_target,property){const group=nodeGroup(readNodeFormTarget(),section);return group!==undefined&&Reflect.has(group,property)},
      ownKeys(){const group=nodeGroup(readNodeFormTarget(),section);return group===undefined?[]:Reflect.ownKeys(group)},
      getOwnPropertyDescriptor(_target,property){const group=nodeGroup(readNodeFormTarget(),section);const descriptor=group===undefined?undefined:Reflect.getOwnPropertyDescriptor(group,property);return descriptor?{...descriptor,configurable:true}:undefined},
    })
    nestedFormProxies.set(section,proxy);return proxy
  }
  const blueprintDraft=reactive(new Proxy(emptyDraft,{
    get(_target,property){const node=readNodeFormTarget(),value:unknown=Reflect.get(node,property,node);return typeof property==='string'&&['capability','navigation','dataSpace','prototype'].includes(property)&&value!==undefined?nodeFormSectionProxy(property):value},
    set(_target,property,value){if(typeof property!=='string'||!['kind','capability','navigation','dataSpace','prototype'].includes(property))throw new Error('蓝图节点身份字段只读');writeNodeFormSection(property,value);return true},
    deleteProperty(_target,property){if(typeof property!=='string'||!['navigation','dataSpace','prototype'].includes(property))throw new Error('蓝图节点身份字段不能删除');writeNodeFormSection(property,undefined);return true},
    has(_target,property){return property in readNodeFormTarget()},
    ownKeys(){return Reflect.ownKeys(readNodeFormTarget())},
    getOwnPropertyDescriptor(_target,property){const node=readNodeFormTarget();const descriptor=Reflect.getOwnPropertyDescriptor(node,property);return descriptor?{...descriptor,configurable:true}:undefined},
  }))
  function blueprintNodeFieldAccess(field:string):Readonly<{read:boolean;write:boolean}>{
    const session=blueprintWorkspaceDataView.value
    if(session!==undefined&&session.nodeId===selectedNode.value?.nodeId)return {read:session.canRead(field),write:session.canWrite(field)}
    return {read:false,write:false}
  }
  /** The designer target is the raw value returned by the formal DataView query. */
  const persistedDataSpaceId = computed(() => {
    void externalDataViewRevision.value
    const session=blueprintWorkspaceDataView.value
    const node=selectedNode.value
    const row=session?.row
    if(!node||!row||session.nodeId!==node.nodeId||session.projectId!==projectId.value
      ||!session.canRead('conid'))return ''
    const raw=row['conid']
    return typeof raw==='string'?raw.trim():''
  })
  /** A staged conid edit fences every designer operation until top-level save/readback. */
  const sceneBindingPending = computed(() => {
    void externalDataViewRevision.value
    const session=blueprintWorkspaceDataView.value
    const node=selectedNode.value
    const row=session?.row
    if(!node||!row||session.nodeId!==node.nodeId||session.projectId!==projectId.value
      ||!session.canRead('conid'))return false
    const raw=row['conid']
    const overlay=session.value('conid')
    const current=overlay===undefined?raw:overlay
    return String(current??'').trim()!==String(raw??'').trim()
  })
  function blueprintNodeFieldsWritable(fields:readonly string[]):boolean{
    const session=blueprintWorkspaceDataView.value
    return session!==undefined&&session.nodeId===selectedNode.value?.nodeId?session.canWriteFields(fields):false
  }
  function blueprintNodeSectionWritable(section:string):boolean{return blueprintNodeFieldsWritable(nodeFormGroupFields[section]??[])}

  // ── 页面文件状态（经 ProjectWorkspace 加载/保存）──
  const pageIoBusy = ref(false)
  const allSaving = ref(false)

  function bumpPageCache(
    pageId: string,
    filename: ProjectBlueprintDomain.PageToolFileName | '__created' | '__deleted' | '__bulk',
  ): void {
    editor.notifyPageFileChanged(pageId, filename)
  }

  // ── 状态消息 ──
  const statusMessages = ref<StatusMessage[]>([])
  const linkProbeLoading = ref(false)
  const linkProbeInfo = ref<{ embeddable: boolean; reason: string } | null>(null)

  // ── 自动保存 ──
  const autoSaveStatus = ref<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let nodeSelectionRevision=0
  const AUTO_SAVE_DELAY = 800

  // ── SPARK AI tool approval bridge + pageDesign entry ──
  const pageDesignAiAdapter = createAiRunAdapter()
  const pageDesignAiRunRevision = ref(0)
  const aiToolApprovals = createAiToolApprovalBridge()
  const aiToolApprovalRevision = ref(0)
  const pageDesignAiRunning = computed(() => {
    void pageDesignAiRunRevision.value
    return pageDesignAiAdapter.isRunning()
  })
  const aiToolApprovalPending = computed<readonly ToolApprovalDisplayItem[]>(() => {
    void aiToolApprovalRevision.value
    return aiToolApprovals.listPending().map(toToolApprovalDisplayItem)
  })

  aiToolApprovals.subscribe(() => {
    aiToolApprovalRevision.value += 1
  })

  // ── SPARK AI project planning document import ──
  const projectPlanningDocumentImportDialogVisible = ref(false)
  const projectPlanningDocumentUploading = ref(false)
  const projectPlanningAiRunning = ref(false)
  const projectPlanningDocumentFileName = ref('')
  const projectPlanningAttachmentRef = ref('')
  const projectPlanningAdapter = createAiRunAdapter()
  const projectPlanningAiRunRevision = ref(0)
  const projectPlanningAiTimeline = computed<readonly AiRunTimelineEvent[]>(() => {
    void projectPlanningAiRunRevision.value
    return projectPlanningAdapter.snapshot().timeline.slice(-8).reverse()
  })

  projectPlanningAdapter.subscribe(() => {
    projectPlanningAiRunRevision.value += 1
  })

  // ═══════════════════════════════════════════════════════════
  // 计算属性
  // ═══════════════════════════════════════════════════════════

  const hasAnyFileDirty = computed(() => {
    const dirty = dirtyProjection.value.dirtyFiles
    return pageFileNames.some((n) => dirty.has(n))
  })

  const blueprintDirty = computed(() => {
    return dirtyProjection.value.blueprintDirty
  })

  const hasAnyDirty = computed(() => {
    void scenarioDefinitionRevision.value
    return dirtyProjection.value.hasAnyDirty || editor.dirtyScenarioIds.length > 0 || editor.unconfirmedPageFiles.length > 0
      || hasExternalDataViewChanges()
  })
  function hasPendingDevSystemWrite(): boolean {
    return pageToolFilesDataView?.hasPendingFileSave === true || pageToolFilesDataView?.hasUnconfirmedSave === true
      || pageToolFilesDataView?.hasPendingRestoreDelivery === true
      || blueprintWorkspaceDataView.value?.hasPendingBlueprintCommand === true
  }

  const scenarioDefinitionDocument = shallowRef<ProjectBlueprintDomain.ScenarioDefinitionDocument | null>(null)
  const scenarioDefinitionRevision = ref(0)
  const pageDataDirty = computed(() => { void scenarioDefinitionRevision.value; return scenarioDefinitionDocument.value?.isDirty === true })
  let releaseScenarioDocument = () => {}
  let scenarioLoad = 0

  function installScenarioDocument(document: ProjectBlueprintDomain.ScenarioDefinitionDocument | null): void {
    releaseScenarioDocument()
    scenarioDefinitionDocument.value?.dispose()
    scenarioDefinitionDocument.value = document
    const views = document?.viewSelectors.map(item => document.dataSet.getView(item.tableName, item.viewId)).filter((view): view is DataView => view !== undefined) ?? []
    const changed = () => {scenarioDefinitionRevision.value++}
    const events = ['editingChanged', 'editingDiscarded', 'rowsChanged', 'mutatingChanged'] as const
    for (const view of views) for (const event of events) view.events.on(event, changed)
    releaseScenarioDocument = () => {for (const view of views) for (const event of events) view.events.off(event, changed)}
    changed()
  }

  function definitionViews(document: ProjectBlueprintDomain.ScenarioDefinitionDocument): DataView[] {
    return document.viewSelectors.map(item => {
      const view = document.dataSet.getView(item.tableName, item.viewId)
      if (!view) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 定义视图已释放')
      return view
    })
  }
  const pageDataError = ref<string | null>(null)
  function selectedScenarioMatches(id: string): boolean { return persistedDataSpaceId.value === id && !sceneBindingPending.value }
  async function loadSelectedScenarioViews(forceReload = false): Promise<void> {
    const scenarioId = persistedDataSpaceId.value
    const generation = ++scenarioLoad
    pageDataError.value = null
    if (!scenarioId || sceneBindingPending.value) {installScenarioDocument(null); return}
    const workspace = currentEditor.value
    const previous = scenarioDefinitionDocument.value
    if (!forceReload && previous?.scenarioId === scenarioId && workspace.getScenarioDefinitions(scenarioId) === previous.dataSet) return
    if (forceReload && previous?.isDirty) throw new Error('SCENARIO_VIEW_UNSAVED: 请先保存或撤销当前定义修改')
    installScenarioDocument(null)
    try {
      const dataSet = await workspace.loadScenarioDefinitions({scenarioId})
      if (generation !== scenarioLoad || currentEditor.value !== workspace || !selectedScenarioMatches(scenarioId)) return
      if (forceReload) {
        const source = dataSet.getView('DataViewDefinition')
        if (!source) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 正式元数据缺少定义视图')
        const snapshot = await source.previewSource()
        if (snapshot.version !== null) await source.adoptSource(snapshot)
        for (const name of Object.keys(ProjectBlueprintDomain.ScenarioDefinitionRecords.resources)) {
          const view = dataSet.getView(name)
          if (!view) throw new Error('SCENARIO_DOCUMENT_IDENTITY: 正式元数据缺少定义视图')
          await view.refresh()
        }
      }
      const document = await ProjectBlueprintDomain.ScenarioDefinitionDocument.open(dataSet, scenarioId)
      if (generation !== scenarioLoad || currentEditor.value !== workspace || !selectedScenarioMatches(scenarioId)) {document.dispose(); return}
      installScenarioDocument(document)
    } catch(error) {
      if (generation === scenarioLoad && currentEditor.value === workspace && selectedScenarioMatches(scenarioId)) pageDataError.value = `场景 ${scenarioId} 视图配置加载失败: ${String(error)}`
      throw error
    }
  }
  async function createSelectedScenarioViews(): Promise<void> {
    const scenarioId = persistedDataSpaceId.value
    const nodeId = selectedNode.value?.nodeId
    if(sceneBindingPending.value)throw new Error('场景绑定尚未正式保存并回读，不能创建场景视图')
    if (!scenarioId || !nodeId) throw new Error('请先绑定现有业务场景')
    const document = scenarioDefinitionDocument.value
    if (document?.scenarioId !== scenarioId || document.isPersisted || document.isDirty) throw new Error('请先加载尚无配置的正式场景')
    const modelView = document.dataSet.getView('Base_DataModel')
    if (!modelView) throw new Error('正式模型目录尚未加载')
    const models = modelView.rows
    if (models.length === 0) throw new Error('当前场景没有正式模型，不能创建视图草稿')
    const tables: Record<string, unknown> = {}
    for (const model of models) {
      const id = model['rowid'], name = model['Name']
      if (model['dataSetId'] !== scenarioId || modelView.fieldAccess(model, 'rowid').read !== 'visible' || modelView.fieldAccess(model, 'Name').read !== 'visible'
        || typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim() || Object.hasOwn(tables, name)) throw new Error('正式模型标识或 Name 不可读、无效或重复')
      Object.defineProperty(tables, name, { enumerable: true, value: { modelBinding: { modelId: id, modelName: name }, views: { default: {} } } })
    }
    await document.setText(JSON.stringify({...JSON.parse(document.getText()), tables}))
    scenarioDefinitionRevision.value++
    pageDataError.value = null
    addStatus('已按正式模型新建场景视图草稿，请检查并保存', 'info')
  }

  async function writeScenarioViewText(text: string): Promise<void> {
    const target = captureScenarioVersionTarget()
    await target.document.setText(text)
    target.assertCurrent(); scenarioDefinitionRevision.value++; pageDataError.value = null
  }
  async function saveScenarioViewText(): Promise<void> {
    const target = captureScenarioVersionTarget()
    const result = await target.document.dataSet.saveChanges({views: target.document.viewSelectors})
    target.assertCurrent()
    if (!result.success) throw result.error ?? new Error(result.message ?? '场景定义保存失败')
    scenarioDefinitionRevision.value++
  }

  /** 版本请求绑定实际工作区、节点与共享文件，迟到结果不能落入新的选择。 */
  function captureScenarioVersionTarget() {
    const workspace = currentEditor.value
    const file = scenarioDefinitionDocument.value
    const nodeId = selectedNode.value?.nodeId
    const token = lowcodeApi.readRequestScope().token
    if(sceneBindingPending.value)throw new Error('场景绑定尚未正式保存并回读，不能操作场景设计器')
    if (!file || !selectedScenarioMatches(file.scenarioId)) throw new Error('场景视图文件尚未加载或选择已切换')
    const assertCurrent = (): void => {
      if (currentEditor.value !== workspace || scenarioDefinitionDocument.value !== file || selectedNode.value?.nodeId !== nodeId
        || !selectedScenarioMatches(file.scenarioId) || lowcodeApi.readRequestScope().token !== token) {
        throw new Error('SCENARIO_VIEW_SCOPE_STALE: 场景版本目标已切换')
      }
    }
    const source = definitionViews(file).find(view => view.tableName === 'DataViewDefinition')
    if (!source) throw new Error('正式定义视图缺失')
    return { document: file, source, scenarioId: file.scenarioId, assertCurrent }
  }

  async function listScenarioVersions(): ReturnType<DataView['listSourceVersions']> {
    const target = captureScenarioVersionTarget()
    const versions = await target.source.listSourceVersions()
    target.assertCurrent()
    return versions
  }

  async function previewScenarioVersion(version: string | number): Promise<string> {
    const target = captureScenarioVersionTarget()
    const text = await target.source.previewSourceVersion(version)
    target.assertCurrent()
    return text
  }

  async function createScenarioVersion(): Promise<void> {
    const target = captureScenarioVersionTarget()
    await target.source.createSourceVersion()
    target.assertCurrent()
  }

  async function restoreScenarioVersion(version: string | number, previewText: string): Promise<void> {
    const target = captureScenarioVersionTarget()
    const hasChanges = () => target.document.isDirty
    if (hasChanges()) throw new Error('SCENARIO_VIEW_UNSAVED: 请先处理当前定义修改')
    const current = target.document.getText()
    const verified = await target.source.previewSourceVersion(version)
    target.assertCurrent()
    if (verified !== previewText) throw new Error('SCENARIO_VIEW_PREVIEW_CHANGED: 快照与预览不一致')
    if (hasChanges() || target.document.getText() !== current) throw new Error('SCENARIO_VIEW_UNSAVED: 预览期间定义已改变')
    await target.document.setText(verified)
    target.assertCurrent()
    await saveScenarioViewText()
  }

  // ═══════════════════════════════════════════════════════════
  // 工具：地址 / 持久化 pageId
  // ═══════════════════════════════════════════════════════════

  function buildActivePageStorageKey(): string {
    return `dev-system:active-page:${tenantId.value}:${projectId.value}`
  }

  function readPersistedActivePageId(): string {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage.getItem(buildActivePageStorageKey())?.trim() ?? ''
    } catch {
      return ''
    }
  }

  function persistActivePageId(pageId: string): void {
    if (typeof window === 'undefined') return
    const key = buildActivePageStorageKey()
    try {
      if (pageId) window.localStorage.setItem(key, pageId)
      else window.localStorage.removeItem(key)
    } catch {
      // ignore storage failures
    }
  }

  function isBackendConfigPage(pageId: string): boolean {
    const pageMeta = pageList.value.find((page: ProjectBlueprintDomain.ProjectPageNodeSummary) => page.pageId === pageId)
    if (!pageMeta) return treeData.value.length === 0
    return isConfigFilesPageSurface(pageMeta.designSurface)
  }

  // ═══════════════════════════════════════════════════════════
  // 页面上下文切换
  // ═══════════════════════════════════════════════════════════

  function setActivePageContext(pageId: string, forceReset = false): boolean {
    const normalizedPageId = pageId.trim()
    if (!normalizedPageId || !isBackendConfigPage(normalizedPageId)) {
      clearActivePageContext()
      return false
    }

    const shouldReset = forceReset || activePageId.value !== normalizedPageId
    project.setActivePage(normalizedPageId, { forceReset: shouldReset })
    persistActivePageId(normalizedPageId)
    return true
  }

  function clearActivePageContext(): void {
    project.clearActivePage()
    persistActivePageId('')
  }

  // ═══════════════════════════════════════════════════════════
  // 项目蓝图树工具
  // ═══════════════════════════════════════════════════════════

  function syncActivePageContextByPath(path: string): void {
    const pageId = normalizePageIdFromPath(path)
    if (pageId && selectedNode.value && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(selectedNode.value))) {
      setActivePageContext(pageId, activePageId.value !== pageId)
      return
    }
    clearActivePageContext()
  }

  // ═══════════════════════════════════════════════════════════
  // 状态消息
  // ═══════════════════════════════════════════════════════════

  function addStatus(text: string, type: StatusMessage['type'] = 'info'): void {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    statusMessages.value.unshift({ text, type, time })
    if (statusMessages.value.length > 80) {
      statusMessages.value = statusMessages.value.slice(0, 80)
    }
  }

  function previewApprovalArgs(args: AiToolApprovalRequest['args']): string {
    try {
      const text = JSON.stringify(args, null, 2)
      return text.length > 600 ? `${text.slice(0, 600)}...` : text
    } catch {
      return String(args)
    }
  }

  function toToolApprovalDisplayItem(request: AiToolApprovalRequest): ToolApprovalDisplayItem {
    return {
      id: request.id,
      toolName: request.toolName,
      moduleId: request.moduleId,
      argsPreview: previewApprovalArgs(request.args),
    }
  }

  function approveAiTool(requestId: string): void {
    if (!aiToolApprovals.decide(requestId, { status: 'allow' })) return
    addStatus('AI 工具调用已允许', 'info')
  }

  function rejectAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'reject',
      reason: normalizedReason || '用户拒绝工具调用',
      fix: '请根据用户拒绝原因调整方案；必要时先询问用户。',
    })) return
    addStatus('AI 工具调用已拒绝', 'warning')
  }

  function abortAiTool(requestId: string, reason: string): void {
    const normalizedReason = reason.trim()
    if (!aiToolApprovals.decide(requestId, {
      status: 'abort',
      reason: normalizedReason || '用户中止工具调用',
    })) return
    addStatus('AI 工具调用已中止', 'warning')
  }

  async function runPageDesignAi(options: PageDesignAiRunOptions): Promise<void> {
    const pageId = activePageId.value.trim()
    const description = options.description.trim()
    if (!pageId) {
      addStatus('请先选择一个配置页面', 'warning')
      return
    }
    if (!description) {
      addStatus('请先输入 AI 编辑需求', 'warning')
      return
    }
    if (pageDesignAiAdapter.isRunning()) return

    pageDesignAiRunRevision.value += 1
    await nextTick()

    try {
      addStatus(`AI 开始编辑页面 ${pageId}`, 'info')
      const result = await runPageDesignAiSession({
        ...options,
        pageId,
        editor,
        savePageFile:(targetPageId,name,text)=>savePageToolFile({pageId:targetPageId,fileName:name,submittedText:text}),
        adapter: pageDesignAiAdapter,
        beforeFunctionCall: aiToolApprovals.beforeFunctionCall,
        onAbort: aiToolApprovals.cancelPending,
        events: {
          onToolCall: (record) => {
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
        },
      })
      addStatus(
        result.sawToolCall
          ? `AI 已修改页面 ${pageId}，请保存`
          : `AI 已完成页面 ${pageId} 的编辑会话`,
        result.sawToolCall ? 'success' : 'info',
      )
    } catch (error) {
      addStatus(`AI 编辑失败: ${String(error)}`, 'error')
    } finally {
      aiToolApprovals.cancelPending('AI 编辑会话已结束。')
      pageDesignAiRunRevision.value += 1
    }
  }

  // ── 项目策划文档导入 ──

  function openProjectPlanningDocumentImportDialog(): void {
    projectPlanningAttachmentRef.value = project.projectInfo.planningAttachmentRef ?? ''
    projectPlanningDocumentImportDialogVisible.value = true
  }

  function closeProjectPlanningDocumentImportDialog(): void {
    projectPlanningDocumentImportDialogVisible.value = false
    projectPlanningDocumentFileName.value = ''
  }

  function bindProjectPlanningAttachmentRef(attachmentRef: string): Promise<void> {
    void attachmentRef
    return Promise.reject(new Error('lowcode 项目附件绑定接口不满足写前镜像、journal、readback 与补偿门禁'))
  }

  async function handleProjectPlanningDocumentFileSelected(file: File): Promise<void> {
    if (!isProjectPlanningDocumentFile(file)) {
      addStatus('请选择 .docx 格式的项目策划文档', 'warning')
      return
    }
    projectPlanningDocumentUploading.value = true
    projectPlanningDocumentFileName.value = file.name
    try {
      const result = await uploadProjectPlanningAttachment({
        tenantId: tenantId.value,
        projectId: projectId.value,
        file,
      })
      projectPlanningAttachmentRef.value = result.planningAttachmentRef
      await bindProjectPlanningAttachmentRef(result.planningAttachmentRef)
      addStatus(`项目策划文档已上传并绑定: ${result.originalFilename}`, 'success')
    } catch (error) {
      projectPlanningAttachmentRef.value = project.projectInfo.planningAttachmentRef ?? ''
      addStatus(`项目策划文档上传失败: ${String(error)}`, 'error')
    } finally {
      projectPlanningDocumentUploading.value = false
    }
  }

  async function runProjectPlanningDocumentImportAi(): Promise<void> {
    const localAttachmentRef = projectPlanningAttachmentRef.value.trim()
    const modelAttachmentRef = project.projectInfo.planningAttachmentRef?.trim() ?? ''
    const attachmentRef = localAttachmentRef.length > 0 ? localAttachmentRef : modelAttachmentRef
    if (!attachmentRef) {
      addStatus('请先上传并绑定项目策划文档', 'warning')
      return
    }
    if (projectPlanningAdapter.isRunning()) return

    projectPlanningAiRunning.value = true
    projectPlanningAiRunRevision.value += 1
    await nextTick()

    try {
      addStatus('AI 开始读取项目策划附件并生成项目蓝图...', 'info')
      const planningDataView = await loadBlueprintWorkspaceDataView()
      await planningDataView.loadProjectTree()
      const result = await runProjectPlanningAiSession({
        planningAttachmentRef: attachmentRef,
        editor,
        blueprintDataView: planningDataView,
        adapter: projectPlanningAdapter,
        beforeFunctionCall: aiToolApprovals.beforeFunctionCall,
        onAbort: aiToolApprovals.cancelPending,
        saveBlueprintAfterRun: true,
        events: {
          onToolCall: (record) => {
            const type: StatusMessage['type'] = record.status === 'success' ? 'info' : 'warning'
            addStatus(`AI 工具 ${record.toolName} ${record.status === 'success' ? '完成' : '失败'}`, type)
          },
        },
      })
      addStatus(
        result.savedBlueprint
          ? '项目策划完成，项目蓝图已保存'
          : '项目策划完成，请手动保存项目蓝图',
        result.savedBlueprint ? 'success' : 'warning',
      )
      closeProjectPlanningDocumentImportDialog()
    } catch (error) {
      addStatus(`项目策划失败: ${String(error)}`, 'error')
    } finally {
      aiToolApprovals.cancelPending('项目策划会话已结束。')
      projectPlanningAiRunning.value = false
      projectPlanningAiRunRevision.value += 1
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 数据加载
  // ═══════════════════════════════════════════════════════════

  async function ensureCurrentProjectBlueprintLoaded(): Promise<void> {
    const scopeKey = currentScopeKey()
    if (loadedBlueprintScopeKeys.has(scopeKey)) return
    const current=blueprintTreeLoadFlights.get(scopeKey)
    if(current){await current;return}
    const loading=(async()=>{
      await loadBlueprintTreeFromDataView()
      if(currentScopeKey()!==scopeKey)throw new Error('蓝图 DataView 树首载项目作用域已切换')
      loadedBlueprintScopeKeys.add(scopeKey)
    })()
    blueprintTreeLoadFlights.set(scopeKey,loading)
    try{await loading}finally{if(blueprintTreeLoadFlights.get(scopeKey)===loading)blueprintTreeLoadFlights.delete(scopeKey)}
  }

  async function loadBlueprint(options?: { preserveSelectedNodeId?: string | null; preserveActivePageId?: string | null }): Promise<void> {
    const loadingScope=currentScopeKey()
    const revision=++blueprintLoadRevision
    const preservedSelectedNodeId = options?.preserveSelectedNodeId ?? selectedNode.value?.nodeId ?? null
    const preservedActivePageId = options?.preserveActivePageId?.trim() ?? ''
    blueprintTreeUnavailableScope.value=loadingScope
    blueprintLoading.value = true
    try {
      await ensureCurrentProjectBlueprintLoaded()
      if(revision!==blueprintLoadRevision||currentScopeKey()!==loadingScope)return
      blueprintTreeUnavailableScope.value=''
      refreshBlueprintDraftBindings()
      addStatus(`项目 ${tenantId.value}/${projectId.value} 蓝图已就绪`, 'success')
    } catch (error) {
      if(revision===blueprintLoadRevision&&currentScopeKey()===loadingScope){
        blueprintTreeUnavailableScope.value=loadingScope
        addStatus(`项目蓝图加载失败: ${String(error)}`, 'error')
      }
      return
    } finally {
      if(revision===blueprintLoadRevision)blueprintLoading.value = false
    }

    const snapTree = readBlueprintProjection().tree

    if (preservedSelectedNodeId) {
      const matchedNode = findNodeById(snapTree, preservedSelectedNodeId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }
    }

    if (preservedActivePageId) {
      const matchedNode = findPageNodeByPageId(snapTree, preservedActivePageId)
      if (matchedNode) {
        await selectNode(matchedNode)
        return
      }

      if (setActivePageContext(preservedActivePageId, false)) {
        project.selectNode(null)
        linkProbeInfo.value = null
        return
      }
    }

    if (snapTree.length === 0) {
      project.selectNode(null)
      clearActivePageContext()
      return
    }

    const firstNode = snapTree[0]
    if (firstNode) {
      await selectNode(firstNode)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 节点表单
  // ═══════════════════════════════════════════════════════════

  function loadNodeToForm(node: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): void {
    const pageId = resolvePageNodePageId(node)
    if (pageId) project.setActivePage(pageId)
    else clearActivePageContext()
    project.selectNode(node.nodeId)
    linkProbeInfo.value = null
  }

  function markBlueprintDirty(): void {
    blueprintDraftRevision.value++
    externalDataViewRevision.value++
    refreshBlueprintTreeProjection()
    scheduleAutoSave()
  }

  function scheduleAutoSave(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveStatus.value = 'pending'
    autoSaveTimer = setTimeout(() => { void doAutoSave() }, AUTO_SAVE_DELAY)
  }

  function cancelAutoSave(): void {
    if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null }
    if (autoSaveStatus.value === 'pending') autoSaveStatus.value = 'idle'
  }

  async function doAutoSave(): Promise<void> {
    autoSaveTimer = null
    if (!hasExternalDataViewChanges()) { autoSaveStatus.value = 'idle'; return }
    if (!selectedNode.value) { autoSaveStatus.value = 'idle'; return }
    autoSaveStatus.value = 'saving'
    try {
      autoSaveStatus.value = await saveNodeChanges() ? 'saved' : 'error'
    } catch {
      autoSaveStatus.value = 'error'
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 保存
  // ═══════════════════════════════════════════════════════════

  async function saveNodeChanges(): Promise<boolean> {
    if (!selectedNode.value) return false
    const node = selectedNode.value
    const scope=currentScopeKey(),workspace=currentEditor.value
    blueprintSaving.value = true
    try {
      const owner=await loadBlueprintWorkspaceDataView()
      if(currentScopeKey()!==scope||currentEditor.value!==workspace||selectedNode.value.nodeId!==node.nodeId)throw new Error('节点保存目标已切换')
      if(owner.nodeId!==node.nodeId)await owner.load(node.nodeId)
      await owner.saveSelectedNode()
      if(currentScopeKey()!==scope||currentEditor.value!==workspace||selectedNode.value.nodeId!==node.nodeId)throw new Error('节点已保存，但工作区目标随后发生变化')
      refreshBlueprintTreeProjection()
      notifyExternalDataViewChanged()
      await syncRuntimeNavigationIfDefaultProject()
      addStatus(`节点 ${node.navigation?.title ?? node.capability.name} 已保存`, 'success')
      return true
    } catch (e) {
      addStatus(`节点保存失败: ${String(e)}`, 'error')
      return false
    } finally {
      blueprintSaving.value = false
    }
  }

  function selectPage(pageId: string): void {
    if (!isBackendConfigPage(pageId)) {
      clearActivePageContext()
      addStatus(`页面 ${pageId} 为宿主页面，不提供后端配置文件编辑`, 'warning')
      return
    }
    setActivePageContext(pageId, activePageId.value !== pageId)
  }

  async function createPageForSelectedNode(params: { pageId: string; title: string; icon: string }): Promise<boolean> {
    const pageId = params.pageId.trim()
    const selected=selectedNode.value
    if(!pageId||!selected||pageIoBusy.value||pendingPageBindingCreate)return false
    if(pageId!==params.pageId||/[\\/%\u0000-\u001f\u007f?#]/.test(pageId)||pageId==='.'||pageId==='..'){
      addStatus('工具页面 ID 无效','warning');return false
    }
    if(selected.projectId!==projectId.value){addStatus('所选蓝图节点不属于当前项目','warning');return false}

    pageIoBusy.value = true
    let saga:PendingPageBindingCreate|undefined
    try {
      const scope=currentScopeKey(),workspace=currentEditor.value
      const owner=await loadBlueprintWorkspaceDataView()
      if(currentScopeKey()!==scope||currentEditor.value!==workspace||selectedNode.value.nodeId!==selected.nodeId
        ||owner.projectId!==projectId.value||owner.nodeId&&owner.nodeId!==selected.nodeId)throw new Error('工具创建目标已切换或身份不匹配')
      const tree=await owner.loadProjectTree()
      if(currentScopeKey()!==scope||currentEditor.value!==workspace||selectedNode.value.nodeId!==selected.nodeId)throw new Error('工具创建期间项目或节点已切换')
      const targetExists=(items:readonly ProjectBlueprintDomain.ProjectBlueprintTreeNodeData[]):boolean=>items.some(item=>
        item.navigation?.target===`cfg:${pageId}`||item.children!==undefined&&targetExists(item.children))
      if(targetExists(tree.children)||project.findPageTool(pageId))throw new Error(`工具页面 ${pageId} 已存在，不能重复创建`)
      if(owner.nodeId!==selected.nodeId)await owner.load(selected.nodeId)
      if(currentScopeKey()!==scope||currentEditor.value!==workspace||selectedNode.value.nodeId!==selected.nodeId)throw new Error('工具创建期间项目或节点已切换')
      if(owner.dirty||owner.hasUnconfirmedSave)throw new Error('蓝图 DataView 有待保存或待核验修改，请先完成保存或取消')
      const before=owner.nodeData()
      const title=params.title.trim()?params.title.trim():before.capability.name??''
      const navigation={...(before.navigation??{order:0}),title,target:`cfg:${pageId}`,icon:params.icon,
        publishInMenu:true,showChildren:true,beginGroup:false}
      const next:BlueprintNodeFormData={...before,kind:'page',navigation}
      owner.preflightNodeData(next)
      const fileOwner=pageToolFilesDataView
      if(fileOwner?.ownerDataSet!==owner.dataSet||owner.dataSet.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY)throw new Error('工具创建所需 Blueprint/PageToolFiles owner 未绑定同一正式 DataSet')
      const parentId=`page-binding:${selected.nodeId}`
      saga={pageId,parentId,nodeId:selected.nodeId,projectId:selected.projectId,title,icon:params.icon,stage:'files'}
      pendingPageBindingCreate=saga
      await resumePendingPageBindingCreate()
      return true
    } catch (e) {
      const owner=blueprintWorkspaceDataView.value
      const fileOwner=pageToolFilesDataView
      if(saga?.stage==='blueprint'&&owner?.hasUnconfirmedSave===true){
        addStatus(`工具绑定回执未知，已保留原文件创建命令 ${pageId}；Save All 将先核验页面文件，再核验蓝图绑定`,'warning')
      }else if(saga?.stage==='files'&&fileOwner?.hasUnconfirmedSave){
        addStatus(`工具文件创建回执未知，原命令 ${pageId} 已保留；Save All 将先核验该命令再保存蓝图`,'warning')
      }else if(saga?.stage==='compensate'&&pendingPageBindingCreate===saga){
        addStatus(`工具绑定失败，默认页面文件补偿命令 ${pageId} 尚待保存`,'warning')
      }else if(saga?.stage==='done'){
        addStatus(`导航绑定已保存；后续页面打开或导航刷新失败，保留页面文件 ${pageId} 以匹配正式记录`,'warning')
      }
      addStatus(`创建页面失败: ${String(e)}`, 'error')
      return false
    } finally {
      pageIoBusy.value = false
    }
  }

  async function saveCurrentNavScope(): Promise<boolean> {
    if (selectedNode.value) {
      return saveNodeChanges()
    }
    addStatus('未选中节点，无需保存蓝图属性', 'info')
    return true
  }

  async function saveAll(): Promise<void> {
    if (allSaving.value || pageIoBusy.value || blueprintSaving.value) return
    if (blueprintDirty.value && hasExternalDataViewChanges()) {
      addStatus('节点基本信息与树行 DataView 同时存在未保存修改；请分别保存或取消，避免交叉覆盖', 'warning')
      return
    }
    const workspace = currentEditor.value, scope = currentScopeKey()
    const assertCurrent = () => {if (currentEditor.value !== workspace || currentScopeKey() !== scope) throw new Error('保存期间工作区已切换')}
    let stage = '蓝图属性'
    allSaving.value = true; cancelAutoSave()
    try {
      stage = '蓝图 DataView'
      for (const session of externalDataViewSessions) if (session.isDirty()) await session.save()
      assertCurrent()
      stage = '蓝图属性'
      if ((blueprintDirty.value || !hasAnyDirty.value) && !await saveCurrentNavScope()) throw new Error('蓝图属性未保存；后续文件尚未提交')
      assertCurrent(); stage = '工具工作文件'
      const dirtyTargets=[...new Map([...workspace.unconfirmedPageFiles,...[...workspace.project.design.pages].flatMap(page=>page.getDirtyFileNames().map(fileName=>({pageId:page.pageId,fileName})))].map(target=>[`${target.pageId}/${target.fileName}`,target])).values()]
      const hadFiles=dirtyTargets.length>0
      for(const target of dirtyTargets){await savePageToolFile({pageId:target.pageId,fileName:target.fileName,requireActive:false});assertCurrent()}
      assertCurrent()
      if (hadFiles) addStatus('工具工作文件本轮提交已确认', 'success')
      stage = '场景定义'
      await workspace.saveDirtyScenarioDefinitions(); assertCurrent()
      scenarioDefinitionRevision.value++
      addStatus(hasAnyDirty.value ? '本轮提交已确认，仍有新修改待保存' : '全部保存已确认', hasAnyDirty.value ? 'info' : 'success')
    } catch (cause) {
      if (currentEditor.value === workspace && currentScopeKey() === scope) addStatus(
        `${stage}保存未完成：${String(cause)}。已确认部分保留，未确认修改仍待处理${stage === '场景定义' ? '' : '；后续场景定义尚未提交'}${workspace.unconfirmedPageFiles.length ? '；再次保存先核验原工具提交' : ''}`, 'error')
    } finally {allSaving.value = false; scenarioDefinitionRevision.value++}
  }

  // ═══════════════════════════════════════════════════════════
  // 节点选中
  // ═══════════════════════════════════════════════════════════

  async function selectNode(node: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    if(pendingPageBindingCreate&&pendingPageBindingCreate.nodeId!==node.nodeId){addStatus('工具页面创建流程尚未完成，请保存或核验后再切换节点','warning');return}
    const selectionRevision=++nodeSelectionRevision,scope=currentScopeKey(),workspace=currentEditor.value
    cancelAutoSave()
    if (hasExternalDataViewChanges()) {
      addStatus('当前蓝图节点有 DataView 未保存修改，请先保存或取消后再切换节点', 'warning')
      return
    }
    if (blueprintDirty.value && selectedNode.value) void saveNodeChanges()
    if (selectedNode.value?.nodeId !== node.nodeId || selectedNode.value.dataSpace?.scenarioId !== node.dataSpace?.scenarioId) {
      scenarioLoad++; installScenarioDocument(null); pageDataError.value = null
    }
    const owner=await loadBlueprintWorkspaceDataView()
    await owner.load(node.nodeId)
    if(selectionRevision!==nodeSelectionRevision||currentScopeKey()!==scope||currentEditor.value!==workspace
      ||!findNodeById(readBlueprintProjection().tree,node.nodeId))throw new Error('节点选择期间当前项目树已变化')
    loadNodeToForm(node)
    const pageId = resolvePageNodePageId(node)
    if (pageId && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(node))) {
      try { await editor.selectPage(pageId); persistActivePageId(pageId) }
      catch(error) { addStatus(`工具 ${pageId} 文件加载失败: ${String(error)}`, 'error') }
    }
  }

  function handlePathChange(val: string): void {
    markBlueprintDirty()
    syncActivePageContextByPath(val)
  }

  // ═══════════════════════════════════════════════════════════
  // 链接探测
  // ═══════════════════════════════════════════════════════════

  function onLinkUrlChanged(): void {
    markBlueprintDirty()
    linkProbeInfo.value = null
  }

  async function probeLinkTarget(): Promise<void> {
    const url = (blueprintDraft.navigation?.target ?? '').trim()
    if (!url) {
      addStatus('请先输入超链接地址', 'warning')
      return
    }

    linkProbeLoading.value = true
    try {
      const result = await editor.probeLink(url)
      const embeddable = result.embeddable
      const reason = result.reason

      if (blueprintDraft.navigation) blueprintDraft.navigation.openMode = embeddable ? 'embedded' : 'new-window'
      linkProbeInfo.value = { embeddable, reason }
      markBlueprintDirty()

      addStatus(
        embeddable
          ? '链接检测通过：已标记为 iframe 渲染'
          : '链接检测提示禁止嵌入：已标记为新标签打开',
        embeddable ? 'success' : 'warning',
      )
    } catch (e) {
      addStatus(`链接检测失败: ${String(e)}`, 'warning')
    } finally {
      linkProbeLoading.value = false
    }
  }

  async function listReferenceProjects(): Promise<ProjectBlueprintDomain.ProjectSummary[]> {
    return editor.listReferenceProjects()
  }

  async function listReferenceProjectPages(targetProjectId: string): Promise<ProjectBlueprintDomain.ProjectPageReference[]> {
    return editor.listReferenceProjectPages(targetProjectId)
  }

  // ═══════════════════════════════════════════════════════════
  // 树增删
  // ═══════════════════════════════════════════════════════════

  async function addRootNode(): Promise<void> {
    let session:BlueprintWorkspaceDataView|undefined
    try {
      session=await loadBlueprintWorkspaceDataView()
      if (hasExternalDataViewChanges() && !session.hasPendingRootCreate) {addStatus('树行 DataView 有未保存修改，请先保存或取消后再新增节点', 'warning'); return}
      await session.addRootModule()
      refreshBlueprintTreeProjection()
      externalDataViewRevision.value++
      await syncRuntimeNavigationIfDefaultProject()
      addStatus('已通过 Base_NavigationInfo DataView 保存根模块', 'success')
    } catch (e) {
      const unconfirmed=session?.hasPendingRootCreate===true&&session.hasUnconfirmedSave
      addStatus(unconfirmed
        ? `根模块保存回执未知；请再次执行新增以沿原 DataView 保存入口核验：${String(e)}`
        : `添加根模块失败: ${String(e)}`, unconfirmed ? 'warning' : 'error')
    }
  }

  async function addChildNode(parent: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    try {
      const session=await loadBlueprintWorkspaceDataView()
      if(session.hasPendingChildCreate){await session.addChildNode(parent.nodeId,{});refreshBlueprintTreeProjection();externalDataViewRevision.value++;await syncRuntimeNavigationIfDefaultProject();addStatus('已核验子节点保存回执','success');return}
      const fileOwner=pageToolFilesDataView
      if(!fileOwner)throw new Error('page-tool-files DataView owner missing')
      const pendingFileCommand=fileOwner.pendingCommandForParent(parent.nodeId)
      const pendingOwnFileCommand=pendingFileCommand!==undefined
      if(session.dirty||hasExternalDataViewChanges()&&!pendingOwnFileCommand){addStatus('树行 DataView 有未保存修改，请先保存或取消后再新增节点','warning');return}
      if(pendingFileCommand?.action==='compensate'){
        await fileOwner.compensateCreate(pendingFileCommand.pageId,parent.nodeId)
        addStatus('已核验并完成原页面文件补偿；可重新执行新增子节点','warning');return
      }
      const pageId=pendingFileCommand?.pageId??normalizePageIdFromPath(`/child-${crypto.randomUUID().slice(0, 8)}`)
      const childInput={name:'新页面',funCode:'',FunName:'新页面',memo:'',htmlDesc:'',conType:'Navitem',conid:'',NavigationUrl:`cfg:${pageId}`,VersionId:'',
        DifficultyFactor:'0',Manhour:'0',Number:'0',Sum:'0',Total:'0',personCharge:'',status:'',FunOrderValue:'0',NavigationImageWxz:'Document',MobileUrl:'',
        IsShowAtNav:'1',NavigationType:'',IsShowChildItem:'1',BeginGroup:'0',NavigationShowType:'',ChildItemLocation:'Left',HorizontalAlignment:''}
      let recoveredFilePageId=''
      if(pendingOwnFileCommand&&fileOwner.hasUnconfirmedSave){
        recoveredFilePageId=await fileOwner.create(parent.nodeId,pageId)
        await assertRecoveredChildPermission({parentId:parent.nodeId,pageId:recoveredFilePageId,assertParent:()=>session.preflightChildNode(parent.nodeId,childInput),compensate:(targetPageId,parentId)=>fileOwner.compensateCreate(targetPageId,parentId)})
      }else{
        session.preflightChildNode(parent.nodeId,childInput)
        if(pendingOwnFileCommand)recoveredFilePageId=await fileOwner.create(parent.nodeId,pageId)
      }
      await createChildPageWithFiles({parentId:parent.nodeId,assertParent:()=>session.preflightChildNode(parent.nodeId,childInput),
        createFiles:async parentId=>recoveredFilePageId||await fileOwner.create(parentId,pageId),
        addNode:async()=>{await session.addChildNode(parent.nodeId,childInput)},
        isNodeReceiptUnknown:()=>session.hasPendingChildCreate,compensate:(childPageId,parentId)=>fileOwner.compensateCreate(childPageId,parentId)})
      refreshBlueprintTreeProjection();externalDataViewRevision.value++
      await syncRuntimeNavigationIfDefaultProject()
      addStatus(`已在 ${parent.navigation?.title ?? parent.capability.name} 下添加子节点`, 'info')
    } catch (e) {
      addStatus(`添加节点失败: ${String(e)}`, 'error')
    }
  }

  function removeNodeFromTree(_node: { parent: { data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData } }, data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): void {
    if (hasExternalDataViewChanges()) {addStatus('树行 DataView 有未保存修改，请先保存或取消后再删除节点', 'warning'); return}

    const pageId = resolvePageNodePageId(data)
    const shouldRemoveMountedPage = pageId.length > 0 && isConfigNodeKind(ProjectBlueprintDomain.projectNodeDeliveryKind(data))
    if(blueprintSaving.value){addStatus('蓝图节点正在保存，请稍后再删除','warning');return}
    blueprintSaving.value=true
    const deletePromise = (async()=>{
      try{
        if(shouldRemoveMountedPage){
          const page=project.findPageTool(pageId)
          if(page?.isDirty())throw new Error('挂载页面存在未保存文件修改，请先保存或取消后再删除')
          if(data.projectId!==projectId.value)throw new Error('蓝图 DataView 删除目标项目身份不匹配')
          pendingMountedPageDelete={pageId,customPath:`${projectId.value}/${pageId}`,nodeId:data.nodeId,projectId:data.projectId,
            parentNodeId:data.parentNodeId,title:data.navigation?.title??data.capability.name,stage:'blueprint'}
          await completePendingMountedPageDelete()
          return
        }
        try{
          const owner=await loadBlueprintWorkspaceDataView()
          await owner.removeLeafNode(data.nodeId,data.projectId,data.parentNodeId)
          refreshBlueprintTreeProjection()
          externalDataViewRevision.value++
        }finally{blueprintSaving.value=false}
      }finally{blueprintSaving.value=false}
    })()
    void deletePromise.then(
      () => {
        if (!shouldRemoveMountedPage && selectedNode.value?.nodeId === data.nodeId) {
          project.selectNode(null);clearActivePageContext()
        }
        if(!shouldRemoveMountedPage){void syncRuntimeNavigationIfDefaultProject();addStatus(`已删除 ${data.navigation?.title ?? data.capability.name}`,'info')}
      },
      (e: unknown) => {
        const message=String(e)
        addStatus(message.includes('MOUNTED_PAGE_FILE_DELETE_PARTIAL')
          ? `挂载页面删除部分成功：${message.replace('MOUNTED_PAGE_FILE_DELETE_PARTIAL: ','')}`
          : `删除节点失败: ${message}`, 'error')
      },
    )
  }

  async function moveNodeInTree(data: ProjectBlueprintDomain.ProjectBlueprintTreeNodeData): Promise<void> {
    const location: ProjectBlueprintDomain.ProjectBlueprintTreeNodeLocation | null = findNodeLocation(treeData.value, data.nodeId)
    if (!location) return
    blueprintSaving.value = true
    try {
      await moveBlueprintNodeInDataView(data.nodeId, location.parentId, location.index)
      addStatus(`节点 ${data.navigation?.title ?? data.capability.name} 已在 Base_NavigationInfo DataView 暂存；显式保存后生效`, 'info')
    } catch (e) {
      addStatus(`节点移动失败: ${String(e)}`, 'error')
    } finally {
      blueprintSaving.value = false
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 上下文编辑
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════

  async function initialize(): Promise<void> {
    const persistedActivePageId = readPersistedActivePageId()
    await loadBlueprint({ preserveActivePageId: persistedActivePageId })
  }

  return {
    // 项目蓝图树
    get tenantId(): string { return tenantId.value },
    get projectId(): string { return projectId.value },
    projectPicker,
    treeData,
    childCreateActionState,
    blueprintLoading,
    blueprintSaving,
    blueprintDirty,
    selectedNode,

    // 编辑表单读取及字段覆盖都由正式 Base_NavigationInfo DataView 提供
    blueprintDraft,
    blueprintNodeFieldAccess,
    blueprintNodeFieldsWritable,
    blueprintNodeSectionWritable,
    persistedDataSpaceId,
    sceneBindingPending,

    // 空蓝图状态
    blueprintEmpty,

    // 页面 4 文件
    pageFileNames,
    activePageId,
    pageIoBusy,
    allSaving,
    projectRevision,
    pageDataError,
    scenarioDefinitionDocument,
    scenarioDefinitionRevision,
    loadSelectedScenarioViews,
    createSelectedScenarioViews,
    writeScenarioViewText,
    saveScenarioViewText,
    listScenarioVersions,
    previewScenarioVersion,
    createScenarioVersion,
    restoreScenarioVersion,
    pageDataDirty,

    // 页面列表
    pageList,

    // 状态
    statusMessages,
    linkProbeLoading,
    linkProbeInfo,
    autoSaveStatus,
    pageDesignAiRunning,
    aiToolApprovalPending,

    // 项目策划文档导入
    projectPlanningDocumentImportDialogVisible,
    projectPlanningDocumentUploading,
    projectPlanningAiRunning,
    projectPlanningDocumentFileName,
    projectPlanningAttachmentRef,
    projectPlanningAiTimeline,

    // 计算属性
    hasAnyFileDirty,
    hasAnyDirty,
    hasPendingDevSystemWrite,
    registerExternalDataViewSession,
    notifyExternalDataViewChanged,
    moveBlueprintNodeInDataView,
    loadBlueprintTreeFromDataView,
    refreshBlueprintTreeProjection,
    blueprintWorkspaceDataView,
    blueprintPageRuntime,
    loadBlueprintWorkspaceDataView,
    savePageToolFile,
    restorePageToolVersion,
    loadNavigationDictionaryOptions,
    createPageToolSnapshot,

    editor,
    project,

    // 方法
    addStatus,
    openEditingProject,
    openProjectPickerScope,
    loadBlueprint,
    clearActivePageContext,
    selectPage,
    createPageForSelectedNode,
    onLinkUrlChanged,
    probeLinkTarget,
    loadNodeToForm,
    markBlueprintDirty,
    saveNodeChanges,
    saveAll,
    runPageDesignAi,
    approveAiTool,
    rejectAiTool,
    abortAiTool,
    selectNode,
    handlePathChange,
    addRootNode,
    addChildNode,
    listReferenceProjects,
    listReferenceProjectPages,
    removeNodeFromTree,
    moveNodeInTree,
    openProjectPlanningDocumentImportDialog,
    closeProjectPlanningDocumentImportDialog,
    handleProjectPlanningDocumentFileSelected,
    runProjectPlanningDocumentImportAi,
    initialize,
  }
}

/** Dev State 的运行状态。 */
export type DevState = ReturnType<typeof useDevState>
