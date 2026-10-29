<!--
@module app:views/app/dev-system/blueprint-workspace/BlueprintWorkspace
职责：编排选中正式节点的六阶段编辑、真实API保存与三文件交付。
边界：节点分组是领域真源，远端回执不得覆盖等待期间的新编辑。
AI用途：保存策划、原型、场景绑定、估算、交付或发布前定位实际控制链。
-->
<template>
  <section v-if="state.selectedNode.value" class="blueprint-workspace" v-loading="loading">
    <div class="blueprint-workspace__actions">
      <DisplayTag v-if="autoSavePresentation" :content="autoSavePresentation.content" :tag-type="autoSavePresentation.tagType"
        size="small" :effect="autoSavePresentation.effect" />
      <RendererButton label="取消节点修改" :disabled="!sessionDirty || saving || loading" @click="cancelEdits" />
      <RendererButton label="保存节点修改" button-type="primary" :disabled="!sessionDirty || saving || loading" :loading="saving" @click="save('节点修改')" />
    </div>
    <RendererTabs v-model="activeStage" class="blueprint-workspace__tabs" toolbar-placement="header">
      <RendererTabPane label="基本信息" name="basic" :index="0"><NodeBasicInfo v-if="readyWorkspaceForView" :state="state" :sections="['capability']" /></RendererTabPane>
      <RendererTabPane label="原型描述" name="prototype" :index="1"><PrototypePane v-if="readyWorkspaceForView" :binding="readyWorkspaceForView.session.standardComponentBinding" :saving="saving" :field-access="access('htmlDesc')" @changed="fieldChanged" @save="save('原型描述')" /><BlueprintReadonlyInfo v-if="activeStage==='prototype' && readyWorkspaceForView" :key="`${readyWorkspaceForView.runtime.instanceId}-history-${readyWorkspaceForView.nodeId}`" :runtime="readyWorkspaceForView.runtime" :node-id="readyWorkspaceForView.nodeId" :binding="`${BLUEPRINT_SCENARIO_ID}@Base_Navigation_Desc_Version@default`" :fields="HISTORY_FIELDS" :assert-current="assertReadonlyTarget" /></RendererTabPane>
      <RendererTabPane label="数据空间" name="data" :index="2"><NodeBasicInfo v-if="readyWorkspaceForView" :state="state" :sections="['data-space']" /><DataPlanningPane v-if="activeStage === 'data' && readyWorkspaceForView" :state="state" :field-access="access('conid')" /></RendererTabPane>
      <RendererTabPane label="导航属性" name="navigation" :index="3" :lazy="true"><template v-if="activeStage==='navigation' && readyWorkspaceForView"><NodeBasicInfo :state="state" :sections="['navigation']" /><NodeTargetConfig :state="state" /><NodeLayoutConfig :state="state" /><NodeStateConfig :key="readyWorkspaceForView.runtime.instanceId" :state="state" /></template></RendererTabPane>
      <RendererTabPane label="导航宿主" name="nav-host" :index="4"><BlueprintReadonlyInfo v-if="activeStage==='nav-host' && readyWorkspaceForView" :key="`${readyWorkspaceForView.runtime.instanceId}-nav-host-${readyWorkspaceForView.nodeId}`" :runtime="readyWorkspaceForView.runtime" :node-id="readyWorkspaceForView.nodeId" :binding="`${BLUEPRINT_SCENARIO_ID}@Base_Navigation_DataRelation@default`" :fields="NAV_HOST_FIELDS" :assert-current="assertReadonlyTarget" /></RendererTabPane>
      <RendererTabPane label="任务信息" name="task-info" :index="5"><DisplayEmpty description="参考实现暂无对应任务资源" /></RendererTabPane>
      <RendererTabPane label="本仓扩展" name="extensions" :index="6"><RendererTabs v-model="activeExtension" class="extension-tabs"><RendererTabPane label="节点估算" name="estimate" :index="0"><EstimatePane v-if="readyWorkspaceForView" :binding="readyWorkspaceForView.session.standardComponentBinding" :saving="saving" :field-access="estimateAccess" @changed="fieldChanged" @save="save('节点估算')" /></RendererTabPane><RendererTabPane label="开发交付" name="delivery" :index="1" :disabled="!state.activePageId.value"><DeliveryPane :state="state" :saving="saving" :can-publish="deliveryAccess" @save="saveDelivery" /></RendererTabPane><RendererTabPane label="发布运行" name="release" :index="2"><ReleasePane v-if="readyWorkspaceForView" :binding="readyWorkspaceForView.session.standardComponentBinding" :saving="saving" :visibility-access="access('IsShowAtNav')" :navigation-access="access('NavigationType')" :runtime-access="access('NavigationUrl')" :visibility-boolean="isBooleanField('IsShowAtNav')" :visibility-options="binaryOptions('IsShowAtNav')" :navigation-options="navigationTypeOptions" @changed="fieldChanged" @save="save('发布运行')" /></RendererTabPane></RendererTabs></RendererTabPane>
    </RendererTabs>
  </section>
  <DisplayEmpty v-else description="在左侧 WBS 中选择节点" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  parseLowcodeBlueprintFileVersions,
  type LowcodeBlueprintFileName,
} from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import {DisplayEmpty, DisplayTag, PAGE_RUNTIME, RendererButton, RendererTabPane, RendererTabs, useSparkComponent} from '@spark-appworks/spark-component'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'
import { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import type { DataView } from '@spark-appworks/spark-data'
import PrototypePane from './PrototypePane.vue'
import BlueprintReadonlyInfo from './BlueprintReadonlyInfo.vue'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY as BLUEPRINT_SCENARIO_ID } from '@spark-appworks/spark-lowcode-api'
import DataPlanningPane from './DataPlanningPane.vue'
import EstimatePane from './EstimatePane.vue'
import DeliveryPane from './DeliveryPane.vue'
import ReleasePane from './ReleasePane.vue'
import NodeBasicInfo from '../components/NodeBasicInfo.vue'
import NodeTargetConfig from '../components/NodeTargetConfig.vue'
import NodeLayoutConfig from '../components/NodeLayoutConfig.vue'
import NodeStateConfig from '../components/NodeStateConfig.vue'

const props = defineProps<{ state: DevState }>()
const HISTORY_FIELDS=['prowid','rowid','desc','versionId','VersionName','version'] as const
const NAV_HOST_FIELDS=['dataName','paramType','titleLocation','location','pName','prowid','ValParamName','childrowid','dbName','TextParamName','rowid','selectTextParam','selectPid','selectValParam','dataType','dataSetId','title'] as const
function assertReadonlyTarget(nodeId:string,runtime:PageRuntime):void{
  if(props.state.selectedNode.value?.nodeId!==nodeId||!runtime.isLoaded||props.state.blueprintPageRuntime.value!==runtime)throw new Error('蓝图只读视图的项目、节点或运行时上下文已失效')
}
const {sparkProvide,sparkRemove}=useSparkComponent({type:'dev-system-blueprint-workspace'})
const activeStage = ref('basic')
const activeExtension = ref('estimate')
const loading = ref(false)
const saving = ref(false)
const autoSavePresentation = computed(() => {
  switch (props.state.autoSaveStatus?.value ?? 'idle') {
    case 'pending': return {content:'待保存…',tagType:'info' as const,effect:'plain' as const}
    case 'saving': return {content:'保存中…',tagType:'info' as const,effect:'dark' as const}
    case 'saved': return {content:'已自动保存',tagType:'success' as const,effect:'plain' as const}
    case 'error': return {content:'保存失败',tagType:'danger' as const,effect:'plain' as const}
    default: return undefined
  }
})
let loadRevision = 0
let disposed = false
const session = shallowRef<BlueprintWorkspaceDataView>()
const dataViewRevision = ref(0)
const sessionDirty = computed(() => {void dataViewRevision.value; void props.state.hasAnyDirty.value; return session.value?.dirty ?? false})
const fileVersions = computed(() => {void dataViewRevision.value; return String(session.value?.value('VersionId') ?? '').trim()})
function fieldChanged():void {dataViewRevision.value++; props.state.notifyExternalDataViewChanged()}
function columnType(field:string):string|undefined {void dataViewRevision.value;return session.value?.view.columns.find(column=>column.name===field)?.type}
function isBooleanField(field:string):boolean {return ['boolean','bool'].includes(columnType(field)??'')}
function isNumericField(field:string):boolean {return ['number','int','integer','decimal','float','double'].includes(columnType(field)??'')}
function binaryOptions(field:string):Array<{label:string;value:string|number}> {
  const values=isNumericField(field)?[1,0]:['1','0']
  return values.map((value,index)=>({label:index===0?'是':'否',value}))
}
const navigationTypeOptions = computed(()=>{
  void dataViewRevision.value
  const values=isNumericField('NavigationType')?[4,3,2,1,0]:['4','3','2','1','0']
  const labels=['子系统','当前窗口','新窗口','对话框','嵌入']
  return values.map((value,index)=>({value,label:labels[index]??''}))
})
type FieldAccess = Readonly<{read: boolean; write: boolean}>
type ReadyWorkspace = Readonly<{nodeId:string;projectId:string;runtime:PageRuntime;session:BlueprintWorkspaceDataView}>
const readyWorkspace = shallowRef<ReadyWorkspace>()
const readyWorkspaceForView = computed<ReadyWorkspace | undefined>(() => {
  const ready=readyWorkspace.value
  return ready!==undefined && session.value===ready.session
    && props.state.projectId===ready.projectId && props.state.selectedNode.value?.nodeId===ready.nodeId
    && props.state.blueprintPageRuntime.value===ready.runtime && ready.runtime.isLoaded
    && ready.runtime.getDataSet(BLUEPRINT_SCENARIO_ID)===ready.session.dataSet
    && ready.session.projectId===ready.projectId && ready.session.nodeId===ready.nodeId
    && ready.session.view.currentRow?.['rowid']===ready.nodeId
    && ready.session.view.currentRow?.['SysId']===ready.projectId
    ? ready : undefined
})
const access = (field: string): FieldAccess => ({read: session.value?.canRead(field) ?? false, write: session.value?.canWrite(field) ?? false})
const estimateAccess = computed(() => {void dataViewRevision.value; return ({
  DifficultyFactor: access('DifficultyFactor'), Manhour: access('Manhour'), Number: access('Number'),
  Sum: access('Sum'), Total: access('Total'), personCharge: access('personCharge'), status: access('status'),
})})
const deliveryAccess = computed(() => {void dataViewRevision.value; return access('NavigationUrl').read && access('VersionId').read && access('VersionId').write})

onBeforeUnmount(() => { disposed = true; loadRevision++; sparkRemove(PAGE_RUNTIME) })

async function load(): Promise<void> {
  const nodeId = props.state.selectedNode.value?.nodeId
  const projectId = props.state.projectId
  const revision = ++loadRevision
  readyWorkspace.value=undefined
  sparkRemove(PAGE_RUNTIME)
  session.value = undefined
  if (!nodeId) {loading.value=false; return}
  loading.value = true
  try {
    const current=await props.state.loadBlueprintWorkspaceDataView()
    if(disposed||revision!==loadRevision||props.state.projectId!==projectId||props.state.selectedNode.value?.nodeId!==nodeId)return
    const runtime=props.state.blueprintPageRuntime.value
    if(!runtime?.isLoaded)throw new Error('蓝图工作区 PAGE_RUNTIME 未就绪')
    sparkProvide(PAGE_RUNTIME,runtime)
    session.value=current
    await current.load(nodeId)
    if(disposed||revision!==loadRevision||props.state.projectId!==projectId||props.state.selectedNode.value?.nodeId!==nodeId){session.value=undefined;return}
    readyWorkspace.value={nodeId,projectId,runtime,session:current}
    dataViewRevision.value++
    props.state.notifyExternalDataViewChanged()
  } catch (error) {
    if (!disposed && revision === loadRevision) {
      readyWorkspace.value=undefined
      session.value=undefined
      sparkRemove(PAGE_RUNTIME)
      props.state.addStatus(`六阶段 DataView 加载失败: ${String(error)}`, 'error')
    }
  } finally { if (!disposed && revision === loadRevision) loading.value = false }
}

async function save(label: string): Promise<void> {
  const nodeId = props.state.selectedNode.value?.nodeId
  const current = session.value
  if (!nodeId || !current || saving.value || loading.value) return
  const projectId = props.state.projectId
  saving.value = true
  try {
    await current.save()
    if (disposed || props.state.projectId !== projectId || props.state.selectedNode.value?.nodeId !== nodeId) throw new Error('保存已提交，但工作区目标随后发生变化')
    props.state.refreshBlueprintTreeProjection()
    props.state.notifyExternalDataViewChanged()
    props.state.addStatus(`${label}已通过 Base_NavigationInfo DataView 保存并读回；保存范围为当前节点全部暂存字段`, 'success')
  } catch (error) {
    props.state.addStatus(`${label} DataView 保存失败或回执待核验: ${String(error)}`, 'error')
  } finally { saving.value = false }
}

function cancelEdits(): void {
  try {session.value?.cancel(); props.state.refreshBlueprintTreeProjection(); dataViewRevision.value++; props.state.notifyExternalDataViewChanged()}
  catch (error) {props.state.addStatus(`取消蓝图 DataView 修改失败: ${String(error)}`, 'error')}
}

async function saveDelivery() {
  const nodeId = props.state.selectedNode.value?.nodeId
  const pageId = props.state.activePageId.value
  if (!nodeId || saving.value || loading.value) return
  if (!pageId) {props.state.addStatus('交付工具身份必须与当前项目及页面一致', 'error'); return}
  const projectId = props.state.projectId
  const current = session.value
  if (!current || !deliveryAccess.value) {props.state.addStatus('发布交付要求当前 DataView 可读 NavigationUrl、VersionId 且允许写 VersionId', 'warning'); return}
  if (current.dirty || current.hasUnconfirmedSave) {props.state.addStatus('请先保存或取消当前节点字段修改，再提交发布文件', 'warning'); return}
  const scopeToken = lowcodeApi.readRequestScope().token
  const originalNavigationUrl = String(current.value('NavigationUrl') ?? '')
  let expectedVersionId = String(current.value('VersionId') ?? '')
  const originalWorkspace = readyWorkspace.value
  const fileNames=['rule.json','script.js','style.css'] as const satisfies readonly LowcodeBlueprintFileName[]
  let fileViews=new Map<LowcodeBlueprintFileName,DataView>()
  const written: string[] = []
  const confirmed: string[] = []
  const attemptedSnapshots: string[] = []
  const attemptedReferences: string[] = []
  const readFileText=(fileName:LowcodeBlueprintFileName):string=>{
    const view=fileViews.get(fileName)
    const row=view?.currentRow,id=row&&view?.getPkKey(row)
    const edited=id===null||id===undefined?row:view?.getEditingRow(id)??row
    if(!view||!row||!edited||row['pageId']!==pageId||row['fileName']!==fileName||typeof edited['text']!=='string')throw new Error(`${fileName} 文件 DataView 身份或文本无效`)
    if(view.dirtyTracking.hasPendingChanges(id!)||view.hasEditingChanges(id!))throw new Error(`${fileName} 存在未保存的文件 DataView 修改，不能发布`)
    if(view.hasUnconfirmedSave)throw new Error(`${fileName} 的文件 DataView 提交回执仍待核验，不能发布`)
    return edited['text']
  }
  const assertTarget = (allowOnlyOwnedVersionPatch = false) => {
    if (disposed || props.state.selectedNode.value?.nodeId !== nodeId || props.state.activePageId.value !== pageId
      || props.state.projectId !== projectId || lowcodeApi.readRequestScope().token !== scopeToken
      || session.value !== current || readyWorkspace.value !== originalWorkspace || originalWorkspace?.session !== current
      || !originalWorkspace || originalWorkspace.nodeId !== nodeId || originalWorkspace.projectId !== projectId
      || current.projectId !== projectId || current.nodeId !== nodeId) throw new Error('交付目标已切换，后续交付已停止')
    if (current.isBusy || current.view.loadingError) throw new Error('交付蓝图 DataView 查询状态已改变，后续交付已停止')
    if (!current.canRead('NavigationUrl') || !current.canRead('VersionId') || !current.canWrite('VersionId')) {
      throw new Error('交付期间正式 DataView 字段权限已改变，后续交付已停止')
    }
    const row = current.row
    const rowKey = row ? current.view.getPkKey(row) : undefined
    if (!row || rowKey === undefined || row['rowid'] !== nodeId || row['SysId'] !== projectId
      || String(current.value('NavigationUrl') ?? '') !== originalNavigationUrl
      || String(current.value('VersionId') ?? '') !== expectedVersionId) throw new Error('交付 DataView 行或发布身份已改变，后续交付已停止')
    const patch = current.view.getEditingPatch(rowKey)
    const changedFields = Object.keys(patch ?? {})
    const submittedRowIds = current.view.rows.map(candidate => current.view.getPkKey(candidate))
      .filter((key): key is string | number => key !== undefined
        && (current.view.hasEditingChanges(key) || current.view.dirtyTracking.hasPendingChanges(key)))
    if (current.hasUnconfirmedSave || current.hasPendingBlueprintCommand || current.view.dirtyTracking.hasPendingChanges(rowKey)) {
      throw new Error('交付 DataView 保存或命令状态已改变，后续交付已停止')
    }
    if (allowOnlyOwnedVersionPatch) {
      if (submittedRowIds.length !== 1 || submittedRowIds[0] !== rowKey
        || changedFields.length !== 1 || changedFields[0] !== 'VersionId' || patch?.['VersionId'] !== expectedVersionId) {
        throw new Error('交付期间 DataView 出现其他未保存修改，后续交付已停止')
      }
    } else if (current.dirty || changedFields.length > 0) {
      throw new Error('交付期间 DataView 出现未保存修改，后续交付已停止')
    }
  }
  saving.value = true
  try {
    const loadingPageId=pageId
    fileViews=new Map(await Promise.all(fileNames.map(async fileName=>[fileName,await props.state.loadPageToolFileDataView({pageId:loadingPageId,fileName})] as const)))
    assertTarget()
    const texts = new Map(fileNames.map(name=>[name,readFileText(name)]))
    const runtimeTarget = String(current.value('NavigationUrl') ?? '')
    if (lowcodeApi.readRequestScope().headers['X-AppId'] !== projectId || !pageId || pageId.trim() !== pageId
      || pageId === '.' || pageId === '..' || /[\\/%\u0000-\u001f\u007f?#]/.test(pageId)
      || runtimeTarget !== `cfg:${pageId}`) throw new Error('交付工具身份必须与当前项目及页面一致')
    let versions = parseLowcodeBlueprintFileVersions(fileVersions.value)
    for (const fileName of fileNames) {
      assertTarget()
      const text = texts.get(fileName)
      if (text === undefined) throw new Error('交付文本缺失')
      const fileView=await props.state.loadPageToolFileDataView({pageId,fileName})
      assertTarget()
      if(readFileText(fileName)!==text)throw new Error(`${fileName} 交付期间 DataView 已修改`)
      const history=await fileView.createSourceVersion(attempt=>{
        if(typeof attempt.fileName==='string'&&!attemptedSnapshots.includes(attempt.fileName))attemptedSnapshots.push(attempt.fileName)
      })
      if(history.state!=='confirmed'||typeof history.version!=='number'||typeof history.fileName!=='string') {
        throw new Error(`${fileName} 文件 DataView 未确认快照回执`)
      }
      const {version,fileName:versionedName}=history
      written.push(versionedName)
      assertTarget()
      fileView.acknowledgeSourceHistoryAttempt()
      if (readFileText(fileName)!==text) throw new Error(`${fileName} 上传期间 DataView 已修改，未更新发布引用`)
      versions = Object.freeze({ ...versions, [lowcodeBlueprintFileVersionKey(fileName)]: version })
      attemptedReferences.push(versionedName)
      expectedVersionId = encodeLowcodeBlueprintFileVersions(versions)
      current.update('VersionId', expectedVersionId)
      dataViewRevision.value++
      props.state.notifyExternalDataViewChanged()
      assertTarget(true)
      await current.save()
      assertTarget()
      const readbackVersions = String(current.value('VersionId') ?? '').trim()
      if (encodeLowcodeBlueprintFileVersions(parseLowcodeBlueprintFileVersions(readbackVersions)) !== expectedVersionId) throw new Error(`${fileName} 发布指针回读不一致`)
      assertTarget()
      confirmed.push(versionedName)
      assertTarget()
      props.state.notifyExternalDataViewChanged()
    }
    props.state.addStatus('开发交付三个文件已独立上传、切换版本并读回', 'success')
  } catch (error) {
    props.state.addStatus(`开发交付保存失败: ${String(error)}；已确认快照：${written.join('、') || '无'}；已确认发布引用：${confirmed.join('、') || '无'}；已尝试快照：${attemptedSnapshots.join('、') || '无'}；已尝试发布引用：${attemptedReferences.join('、') || '无'}。未确认的请求须核查远端结果`, 'error')
  } finally { saving.value = false }
}

watch([() => props.state.selectedNode.value?.nodeId ?? '', () => props.state.projectId], () => {void load()}, { immediate: true })
</script>

<style scoped>
.blueprint-workspace { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.blueprint-workspace__actions { display: flex; justify-content: flex-end; gap: 8px; padding: 6px 12px; }
.blueprint-workspace__tabs { flex: 1; min-height: 0; }
.blueprint-workspace :deep(.renderer-tabs-main), .blueprint-workspace :deep(.el-tabs), .blueprint-workspace :deep(.el-tabs__content) { height: 100%; min-height: 0; }
.blueprint-workspace :deep(.el-tab-pane) { min-height: 100%; }
.blueprint-workspace :deep(.stage-pane) { max-width: 960px; padding: 20px; }
.blueprint-workspace :deep(.stage-actions) { display: flex; justify-content: flex-end; margin-top: 18px; }
.domain-note { margin-top: 16px; }
.extension-tabs { height: 100%; }
.blueprint-workspace :deep(.estimate-grid) { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 0 24px; }
.delivery-pane, .delivery-tabs { height: 100%; }
.delivery-tabs :deep(.el-tabs__content), .delivery-tabs :deep(.el-tab-pane) { height: calc(100% - 28px); }
</style>
