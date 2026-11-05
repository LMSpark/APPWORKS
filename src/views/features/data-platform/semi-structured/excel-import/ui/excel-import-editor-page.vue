<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-editor-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>导入配置设置</h1></header>
    <p v-if="loading" role="status">正在读取设计…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <p v-if="missing" role="alert">当前方案不存在</p>
    <p v-if="unconfirmed" role="status">存在尚未确认的保存结果，请通过原保存入口核验。</p>
    <p v-if="recoveryNotice" role="status">{{ recoveryNotice }}</p>
    <template v-if="ready && validTarget">
      <RendererForm :data-view-key="schemeKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
        <FieldText field="solutionName" label="方案名称" :readonly="true" />
        <FieldText field="dataSetId" label="方案数据空间" :readonly="true" />
      </RendererForm>
      <div class="excel-workspaces">
        <aside :inert="(acting || unconfirmed || !!targetChange || !!removal || !!fieldReference || pendingPart('nodes') || pendingPart('rules')) || undefined">
          <RendererButton :data-view-key="nodesKey" label="新增根配置" perm-action="create" :disabled="locked" @click="addRoot" />
          <RendererButton :data-view-key="nodesKey" label="新增同级配置" perm-action="create" :disabled="locked" @click="addNode('sibling')" />
          <RendererButton :data-view-key="nodesKey" label="新增子级配置" perm-action="create" :disabled="locked || !selectedNode" @click="addNode('child')" />
          <RendererButton :data-view-key="nodesKey" label="删除配置" perm-action="delete" :disabled="locked || !selectedNode" @click="openRemoval" />
          <RendererTree :data-view-key="nodesKey" :expand-level="1" :tree-props="{highlightCurrent:true,expandOnClickNode:false}" :show-data-view-meta="false" />
        </aside>
        <main v-if="selectedNode">
          <h2>基本信息</h2>
          <RendererForm :data-view-key="nodesKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
            <FieldText field="sheetName" label="工作表名称" :readonly="locked" />
            <FieldNumber field="sheet" label="工作表索引" :readonly="locked" />
            <FieldNumber field="titleIndex" label="表头行（负数则无表头）" :readonly="locked" />
            <FieldNumber field="dataIndex" label="数据开始行" :readonly="locked" />
            <FieldText field="relatedAppName" label="应用" :readonly="true" />
            <FieldText field="tableDesc" label="目标数据" :readonly="true" />
            <FieldSelect field="exportType" label="导入导出方式" :option-data-view-key="methodsKey" :readonly="locked" />
            <FieldSelect v-if="association" field="parentField" label="父字段" :option-data-view-key="association.parentKey" :option-label-fields="['title','name']" :readonly="locked" :on-change="associationHandlers.parent" />
            <FieldSelect v-if="association" field="foreignKeyField" label="外键字段" :option-data-view-key="association.foreignKey" :option-label-fields="['title','name']" :readonly="locked" :on-change="associationHandlers.foreign" />
            <FieldJson field="filters" label="过滤条件" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.filters',value)" />
            <FieldJson field="sorted" label="排序规则" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.sorted',value)" />
            <FieldJson field="sheet_layout_json" label="Sheet 布局" mode="text" :readonly="locked" :on-change="changeLayout" :on-editing-change="value => pending('nodes.layout',value)" />
          </RendererForm>
          <RendererButton :data-view-key="nodesKey" label="选择目标数据" perm-action="edit" :disabled="locked || !!targetChange || !targetAllowed" @click="openTarget" />
          <p v-if="targetState?.kind==='source'" role="status">目标及字段替换共同保存；提交开始后沿同一次保存核验。</p>
          <RendererButton :label="targetChange ? targetSaveLabel : isUnconfirmed(nodesTable) ? '核验配置保存结果' : '保存配置'" :disabled="busy || !!targetChange && !targetChange.owns(nodesTable) || pendingPart('nodes')" @click="save(nodesTable)" />
          <RendererButton label="取消配置修改" :disabled="busy || unconfirmed || !!targetChange && (!targetState?.canCancel || !targetChange.owns(nodesTable))" @click="cancel(nodesTable)" />
          <RendererButton v-if="targetState?.canRetry" :label="targetState?.kind==='source' ? '确认未生效，重新提交目标及字段' : '确认未生效，重新提交原修改'" :disabled="busy" @click="retryTarget" />
          <RendererButton v-if="targetState?.canAcceptCurrent" :label="targetState?.kind==='source' ? '读取并采用当前正式结果，结束原换源' : '读取并采用当前正式结果，结束原保存'" :disabled="busy" @click="acceptTargetCurrent" />
          <RendererButton v-if="targetChange && targetState?.applyStarted && targetState.canDiscard" :label="targetState?.kind==='source' ? '放弃本次配置和字段的本地修改' : '放弃本次保存范围的本地修改'" :disabled="busy" @click="discardTarget" />
          <p v-if="layoutEnabled" role="status">已启用相对版式，经典字段映射已隐藏。请在 Sheet 布局中维护版式定义。</p>
          <section v-else>
            <h2>字段映射</h2>
            <RendererButton :data-view-key="fieldsKey" label="设置引用" perm-action="edit" :disabled="locked || !!targetChange || !currentMapping" @click="editReference(false)" />
            <RendererButton :data-view-key="fieldsKey" label="清空引用" perm-action="edit" :disabled="locked || !!targetChange || !currentMapping" @click="editReference(true)" />
            <RendererButton :data-view-key="fieldsKey" label="删除字段" perm-action="delete" :disabled="locked || !!targetChange" @click="remove(fieldsTable)" />
            <RendererButton :label="targetChange ? targetSaveLabel : isUnconfirmed(fieldsTable) ? '核验字段保存结果' : '保存字段'" :disabled="busy || !!targetChange && (!targetChange.owns(fieldsTable) || targetChange.owns(nodesTable) && pendingPart('nodes'))" @click="save(fieldsTable)" />
            <RendererButton label="取消字段修改" :disabled="busy || unconfirmed || !!targetChange && (!targetState?.canCancel || !targetChange.owns(fieldsTable))" @click="cancel(fieldsTable)" />
            <RendererTable :data-view-key="fieldsKey" :children="fieldColumns" :highlight-current-row="true" />
          </section>
        </main>
        <p v-else role="status">请选择左侧节点后再编辑</p>
      </div>
      <ExcelTransformRulesPane :data-view-key="rulesKey" :field-options-key="ruleFieldOptionsKey" :has-node="!!selectedNode" :disabled="locked" @session-change="value => pending('rules.dialog',value)">
        <template #scheme-tools>
          <RendererForm :data-view-key="schemeKey" :auto-columns="false" :show-data-view-meta="false">
            <FieldCheckbox field="transform_enabled" label="启用增强规则" :true-value="1" :false-value="0" :readonly="locked || pendingPart('rules')" />
          </RendererForm>
          <RendererButton :label="isUnconfirmed(schemeTable) ? '核验增强规则开关保存结果' : '保存增强规则开关'" :disabled="busy || pendingPart('rules')" @click="save(schemeTable)" />
          <RendererButton label="取消增强规则开关修改" :disabled="busy || unconfirmed || pendingPart('rules')" @click="cancel(schemeTable)" />
        </template>
      </ExcelTransformRulesPane>
    </template>
    <ExcelTargetDialog v-if="sourceTargetId" :data-view-key="nodesKey" :record-id="sourceTargetId" :busy="acting" :validate-target="validateSourceTarget" @close="sourceTargetId = ''" @confirm="applyTarget" />
    <ExcelReferenceDialog v-if="fieldReference" :data-view-key="fieldsKey" :reference="fieldReference" :busy="acting" @close="fieldReference=undefined" />
    <RendererDialog v-if="removal" :model-value="true" :data-view-key="nodesKey" title="删除配置确认" :width="560" @update:model-value="cancelRemoval">
      <p>将删除当前叶配置，同时删除 {{ removalState?.fields }} 个字段和 {{ removalState?.rules }} 条转换规则。</p>
      <p>保留方案、兄弟配置、模板和来源业务数据。</p>
      <p v-if="removalState?.databaseConfirmed" role="status">数据库删除已确认，继续回读并刷新页面。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template #footer>
        <RendererButton label="取消删除配置" :disabled="busy || !removalState?.canCancel" @click="cancelRemoval" />
        <RendererButton v-if="removalState?.canAcceptCurrent" label="读取并采用当前正式结果，结束原删除" :disabled="busy" @click="acceptRemovalCurrent" />
        <RendererButton :label="unconfirmed || removalState?.databaseConfirmed ? '核验删除并刷新' : '确认删除配置'" button-type="danger" :disabled="busy" @click="saveRemoval" />
      </template>
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'
import {ExcelConfigurationEdit} from '@/lowcode/resources/semi-structured/excel-import/configuration-edit'
import {ExcelConfigurationRemoval} from '@/lowcode/resources/semi-structured/excel-import/configuration-removal'
import {assertExcelFieldRemoval} from '@/lowcode/resources/semi-structured/excel-import/edit-references'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {ExcelAssociationFields} from '@/lowcode/resources/semi-structured/excel-import/association-fields'
import {ExcelFieldReference} from '@/lowcode/resources/semi-structured/excel-import/field-reference'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import ExcelTargetDialog from './excel-import-target-dialog.vue'
import ExcelReferenceDialog from './excel-import-reference-dialog.vue'
import ExcelTransformRulesPane from './excel-import-transform-rules-pane.vue'

const {PAGE_RUNTIME, RendererTree, RendererTable, RendererForm, RendererButton, RendererDialog, FieldText, FieldNumber, FieldSelect, FieldJson, FieldCheckbox, useSparkComponent} = SparkComponent
const props = defineProps<{schemeRowid?: string}>(), route = useRoute()
const importConfigId = computed(() => props.schemeRowid ?? (typeof route.query['importConfigId'] === 'string' ? route.query['importConfigId'] : ''))
const scene = LowcodeExcelImport.designScenarioId, catalogScene = LowcodeExcelImport.navigationScenarioId
const nodesTable = 'Base_ImportData_Config', fieldsTable = 'Base_ImportData_Field', rulesTable = 'Base_Import_Transform_Rule'
const schemeTable = 'Base_Import_solution'
const key = (table: string) => buildDataViewKey(table, 'default', scene)
const nodesKey = key(nodesTable), fieldsKey = key(fieldsTable), rulesKey = key(rulesTable), methodsKey = key('ImportExportMethods')
const ruleFieldOptionsKey=buildDataViewKey(fieldsTable,'foreignKeyFields',scene)
const schemeKey = buildDataViewKey('Base_Import_solution', 'editorTarget', catalogScene)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'excel-import-editor-page'})
const dataSet = shallowRef<DataSet>(), catalog = shallowRef<DataSet>(), opening = ref(false), ready = ref(false), acting = ref(false), error = ref(''), revision = ref(0)
const inputs = ref(new Set<string>())
const sourceTargetId = ref(''), targetChange = shallowRef<ExcelConfigurationEdit>()
const recoveryNotice = ref('')
const association = shallowRef<ExcelAssociationFields>()
const fieldReference=shallowRef<ExcelFieldReference>()
const targetState = computed(() => {revision.value; return targetChange.value?.getState()})
const targetSaveLabel = computed(() => {
  const state=targetState.value,part=state?.kind==='source'?'目标及字段':state?.kind===fieldsTable?'字段':'配置'
  return state?.dispatched?`核验${part}保存结果`:state?.applyStarted?`重新保存${part}`:`保存${part}`
})
const removal = shallowRef<ExcelConfigurationRemoval>(), removalState = computed(() => {revision.value; return removal.value?.getState()})
let runtime: PageRuntime | undefined, unsubscribers: Array<() => void> = [], generation = 0, active = true
const view = (table: string) => table === schemeTable ? catalog.value?.getView(table, 'editorTarget') : dataSet.value?.getView(table)
const views = computed(() => [...Object.values(dataSet.value?.tables ?? {}).flatMap(table => table.viewList), ...[view(schemeTable)].filter(item => item !== undefined)])
const validTarget = computed(() => {revision.value; const target=view(schemeTable), row=target?.rows[0]; return target?.rows.length === 1 && row !== undefined && target.getPkKey(row) === importConfigId.value})
const loading = computed(() => {revision.value; return opening.value || views.value.some(item => item.requestState === RequestState.Preparing || item.requestState === RequestState.Loading)})
const missing = computed(() => ready.value && !validTarget.value)
const busy = computed(() => acting.value || loading.value)
const unconfirmed = computed(() => {revision.value; return views.value.some(item => item.hasUnconfirmedSave)})
const locked = computed(() => busy.value || unconfirmed.value || !!removal.value || !!fieldReference.value || targetState.value?.applyStarted === true)
const hasPending = computed(() => {revision.value; return acting.value || !!targetChange.value || !!removal.value || !!fieldReference.value || inputs.value.size > 0 || views.value.some(item => item.hasUnconfirmedSave || item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty() {return opening.value || hasPending.value}})
const selectedNode = computed(() => {revision.value; return view(nodesTable)?.currentRow ?? null})
const currentMapping=computed(()=>{revision.value;return view(fieldsTable)?.currentRow??null})
const layoutEnabled = computed(() => {
  revision.value
  const nodes=view(nodesTable),row=nodes?.currentRow,id=row?nodes?.getPkKey(row):undefined
  if(!nodes||!row||id===undefined||nodes.fieldAccess(row,'sheet_layout_json').read!=='visible')return false
  return activeLayout(nodes.getEditingRow(id)?.['sheet_layout_json'])
})
const associationHandlers = computed(() => {
  const owner=association.value,nodeId=selectedNode.value?.['rowid']
  return {parent:(value:unknown,previous:unknown,control:unknown)=>changeAssociation({owner,nodeId,kind:'parentField',value},control),
    foreign:(value:unknown,previous:unknown,control:unknown)=>changeAssociation({owner,nodeId,kind:'foreignKeyField',value},control)}
})
const targetAllowed = computed(() => {revision.value; const nodes=view(nodesTable), row=nodes?.currentRow, id=row?nodes?.getPkKey(row):undefined; return !layoutEnabled.value && id!==undefined && !nodes?.dirtyTracking.isPendingCreate(id) && nodes?.editActionState(row??null)==='enabled'})
const queryError = computed(() => {revision.value; return views.value.find(item => item.loadingError)?.loadingError?.message ?? ''})
function pending(id: string, editing: boolean): void {if (editing) inputs.value.add(id); else inputs.value.delete(id)}
function pendingPart(prefix: string): boolean {return [...inputs.value].some(id => id.startsWith(prefix + '.'))}
function isUnconfirmed(table: string): boolean {revision.value; return view(table)?.hasUnconfirmedSave === true}
function validateJson(value: unknown): void {if (typeof value !== 'string') throw new Error('配置必须是JSON文本'); if (value.trim()) parseJsonDocument(value)}
function activeLayout(value:unknown):boolean {
  if(typeof value!=='string'||!value.trim())return false
  try{const layout=parseJsonDocument(value);return !Array.isArray(layout)&&Boolean(layout['enabled'])}catch{return false}
}
function changeLayout(value:unknown,previous:unknown,control:unknown):void {
  if(control===null||typeof control!=='object'||!('cancel' in control))throw new Error('缺少字段交互控制')
  try{
    validateJson(value)
    const fields=view(fieldsTable)
    if(activeLayout(value)!==activeLayout(previous)&&(fields?.hasEditingChanges()||fields?.dirtyTracking.hasPendingChanges()))throw new Error('请先保存或取消字段修改，再切换相对版式')
    error.value=''
  }catch(cause){control.cancel=true;error.value=cause instanceof Error?cause.message:String(cause)}
}
const fieldColumns = computed<SparkNode[]>(() => [
  ...Object.entries({name:'字段名称',title:'标题',index:'Excel 列号',type:'类型'}).map(([field,label]) => ({type:field === 'type' ? 'r-number' : 'r-text',props:{field,label,readonly:['name','type'].includes(field),showCellControl:true,cellReadonly:()=>locked.value}})),
  {type:'r-select',props:{field:'DesenID',label:'脱敏规则',optionDataViewKey:key('Base_Desensitization_Rule'),showCellControl:true,cellReadonly:()=>locked.value}},
  {type:'r-text',props:{field:'refTableDesc',label:'引用表描述',readonly:true}},
])
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
defineExpose({hasPending,busy,unconfirmed,discardChanges:discardAll})
watch(importConfigId, async id => {
  const own = ++generation
  sourceTargetId.value = ''; targetChange.value = undefined; removal.value = undefined; fieldReference.value=undefined
  unsubscribers.forEach(off=>off()); unsubscribers=[]; association.value=undefined; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime=undefined; dataSet.value=undefined; catalog.value=undefined
  ready.value=false; opening.value=true; error.value=''; recoveryNotice.value=''; inputs.value.clear()
  try {
    if (!id.trim()) throw new Error('缺少 importConfigId 参数')
    const page:PageRuntime = new PageRuntime({pageId:'excel-import-editor-page',scenarioIds:[catalogScene,scene,LowcodeExcelImport.referenceScenarioId,LowcodeDictionary.editorScenarioId],deferredScenarioIds:[LowcodeExcelImport.referenceScenarioId,LowcodeDictionary.editorScenarioId],scenarioInputs:{[catalogScene]:{importConfigId:id},[scene]:{importConfigId:id}},
      loadScenario: space => space === scene ? LowcodeExcelImport.loadEditor(scene,()=>page) : space === catalogScene ? LowcodeExcelImport.loadCatalog(catalogScene)
        : space === LowcodeExcelImport.referenceScenarioId ? LowcodeExcelImport.loadReferenceSources() : space===LowcodeDictionary.editorScenarioId ? LowcodeDictionary.loadEditor().then(result=>result.dataSet) : Promise.reject(new Error('Excel页面未声明该来源空间'))})
    runtime=page; await page.load()
    if (!active || own!==generation) {page.dispose();return}
    catalog.value=page.getDataSet(catalogScene); dataSet.value=page.getDataSet(scene)
    const target=catalog.value?.getView('Base_Import_solution','editorTarget'), nodes=view(nodesTable)
    if (!target || !nodes) throw new Error('Excel正式设计视图缺失')
    if ([nodesTable,fieldsTable,rulesTable].some(name=>view(name)?.commitMode!=='staged')) throw new Error('Excel设计必须使用正式暂存视图')
    association.value = new ExcelAssociationFields(dataSet.value!)
    const changed=()=>revision.value++
    unsubscribers=[catalog.value!,dataSet.value!].map(ds=>ds.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed}))
    await target.refresh(); if (target.loadingError) throw target.loadingError
    if (!active || own!==generation) return
    if (target.rows.length>1) throw new Error('方案身份不唯一')
    if (target.rows.length===1) {
      if (target.getPkKey(target.rows[0]!) !== id) throw new Error('方案身份与调用参数不一致')
      nodes.setTreeConfig({idField:'rowid',parentIdField:'pid',textField:'sheetName',rootParentValue:id,lazy:false})
      sparkProvide(PAGE_RUNTIME,page); dataSet.value!.triggerAutoLoad()
    }
    ready.value=true
  } catch(cause) {if(active && own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
  finally {if(active && own===generation)opening.value=false}
},{immediate:true})
async function act(table: string, command: (target: NonNullable<ReturnType<typeof view>>) => unknown): Promise<void> {
  if (busy.value) return
  const target=view(table); if(!target)return
  const own=generation;acting.value=true;error.value=''
  try {await command(target)} catch(cause) {if(active && own===generation)error.value=cause instanceof Error?cause.message:String(cause)}
  finally {if(active && own===generation){acting.value=false;revision.value++}}
}
async function save(table: string): Promise<void> {await act(table,async target=>{
  if (targetChange.value && [nodesTable, fieldsTable].includes(table)) {
    if (!targetChange.value.owns(table)) throw new Error('请先处理原结构保存，不能扩大提交范围')
    if (targetChange.value.owns(nodesTable) && pendingPart('nodes')) return
    await targetChange.value.save(); if (targetChange.value.getState().done) targetChange.value = undefined
    return
  }
  if (pendingPart(table===schemeTable?'scheme':table===nodesTable?'nodes':table===rulesTable?'rules':'fields')) return
  const structural=ExcelConfigurationEdit.hasStructuralChanges(target)
  if(structural && !target.hasUnconfirmedSave && (table===nodesTable||table===fieldsTable)){
    const own=generation,page=runtime,ds=dataSet.value,id=view(nodesTable)?.currentRow?.['rowid']
    if(!ds||typeof id!=='string')throw new Error('Excel结构保存缺少原节点')
    targetChange.value=ExcelConfigurationEdit.pending({dataSet:ds,nodeId:id,tableName:table,assertCurrent:()=>{
      if(!active||own!==generation||runtime!==page||dataSet.value!==ds||view(nodesTable)?.currentRow?.['rowid']!==id)throw new Error('Excel结构保存上下文已变化')
    }})
    await targetChange.value.save();if(targetChange.value.getState().done)targetChange.value=undefined
    return
  }
  const owner=table===schemeTable?catalog.value:dataSet.value
  if(table===schemeTable && !validTarget.value)throw new Error('方案身份与调用参数不一致')
  const result=await owner!.saveChanges({views:[{tableName:target.tableName,viewId:target.viewId,...(table===schemeTable?{ids:[importConfigId.value]}:{})}]})
  if(!result.success)throw new Error(result.message??'保存未完整确认')
})}
function cancel(table: string): void {if(!busy.value&&!unconfirmed.value){try{if(targetChange.value && [nodesTable,fieldsTable].includes(table)){if(!targetChange.value.owns(table))throw new Error('请从原入口取消结构修改');targetChange.value.cancel();targetChange.value=undefined}else view(table)?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}}
function discardAll(): boolean {if(busy.value||unconfirmed.value)return false;fieldReference.value=undefined;if(removal.value){try{removal.value.cancel();removal.value=undefined}catch{return false}}if(targetChange.value){try{targetChange.value.cancel();targetChange.value=undefined}catch{return false}}for(const target of views.value)target.discardPendingChanges();revision.value++;return !hasPending.value}
async function openRemoval(): Promise<void> {
  if (locked.value || targetChange.value) return
  await act(nodesTable, async nodes => {
    const id = nodes.currentRow ? nodes.getPkKey(nodes.currentRow) : undefined
    if (typeof id !== 'string') throw new Error('请先选择配置')
    const own = generation, page = runtime, schemeId = importConfigId.value
    removal.value = await ExcelConfigurationRemoval.open({dataSet: dataSet.value!, schemeId, nodeId: id,
      assertCurrent: () => {if(!active || own!==generation || runtime!==page || importConfigId.value!==schemeId)throw new Error('Excel删除上下文已变化')}})
  })
}
async function saveRemoval(): Promise<void> {await act(nodesTable,async()=>{await removal.value?.save();if(removal.value?.getState().done)removal.value=undefined})}
function cancelRemoval(): void {if(busy.value)return;try{removal.value?.cancel();removal.value=undefined;error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function validateSourceTarget(): void {
  const nodes = view(nodesTable), row = nodes?.currentRow
  if (!active || !ready.value || !runtime || !sourceTargetId.value || !row || nodes?.getPkKey(row) !== sourceTargetId.value || row['schemeid'] !== importConfigId.value || !!targetChange.value) throw new Error('Excel来源目标已变化')
}
function openTarget(): void {
  if (locked.value || targetChange.value || !targetAllowed.value) return
  const nodes = view(nodesTable), id = nodes?.currentRow ? nodes.getPkKey(nodes.currentRow) : undefined
  if (typeof id !== 'string') return
  sourceTargetId.value = id
}
async function applyTarget(source: DataSet): Promise<void> {
  await act(nodesTable, async () => {
    validateSourceTarget()
    const own = generation, page = runtime, id = sourceTargetId.value
    const assertCurrent = () => {if(!active || own !== generation || runtime !== page || view(nodesTable)?.currentRow?.['rowid'] !== id)throw new Error('Excel目标替换上下文已变化')}
    const command = await ExcelConfigurationEdit.stage({dataSet: dataSet.value!, nodeId: id, source, assertCurrent})
    assertCurrent(); targetChange.value = command; sourceTargetId.value = ''
  })
}
async function retryTarget(): Promise<void> {await act(nodesTable,async()=>{await targetChange.value?.retry();if(targetChange.value?.getState().done)targetChange.value=undefined})}
async function acceptTargetCurrent(): Promise<void> {await act(nodesTable,async()=>{const source=targetChange.value?.getState().kind==='source';await targetChange.value?.acceptCurrent();if(targetChange.value?.getState().done){targetChange.value=undefined;recoveryNotice.value=source?'已读取并采用当前正式结果，未确认原换源成功。':'已读取并采用当前正式结果，未确认原保存成功。'}})}
async function acceptRemovalCurrent(): Promise<void> {await act(nodesTable,async()=>{await removal.value?.acceptCurrent();if(removal.value?.getState().done){removal.value=undefined;recoveryNotice.value='已读取并采用当前正式结果，未确认原删除成功。'}})}
function discardTarget(): void {if(busy.value)return;try{targetChange.value?.discardLocalChanges();targetChange.value=undefined;error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}
function changeAssociation(input: Readonly<{owner: ExcelAssociationFields | undefined; nodeId: unknown; kind: 'parentField' | 'foreignKeyField'; value: unknown}>, control: unknown): void {
  if (control === null || typeof control !== 'object' || !('cancel' in control)) throw new Error('缺少字段交互控制')
  control.cancel = true
  try {if(locked.value || !input.owner || input.owner!==association.value)throw new Error('关联编辑尚未就绪');input.owner.select(input);error.value=''}
  catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
function editReference(clear:boolean):void{
  if(locked.value||targetChange.value)return
  try{
    const ds=dataSet.value,nodeId=selectedNode.value?.['rowid'],row=currentMapping.value,fieldId=row?view(fieldsTable)?.getPkKey(row):undefined,own=generation,page=runtime
    if(!ds||typeof nodeId!=='string'||typeof fieldId!=='string')throw new Error('请先选择当前配置的字段映射')
    let command:ExcelFieldReference|undefined
    command=new ExcelFieldReference({dataSet:ds,nodeId,fieldId,resolveSource:id=>page?.getDataSet(id),assertCurrent:()=>{if(!active||generation!==own||runtime!==page||dataSet.value!==ds||!clear&&command!==undefined&&fieldReference.value!==command)throw new Error('原引用映射宿主已失效')}})
    if(clear)command.clear();else fieldReference.value=command
    error.value='';revision.value++
  }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
}
async function addRoot(): Promise<void> {await addNode('root')}
async function addNode(mode: 'root' | 'sibling' | 'child'): Promise<void> {
  if (unconfirmed.value) return
  await act(nodesTable, async target => {
    if ([fieldsTable, rulesTable].some(name => {const child = view(name); return child?.hasEditingChanges() || child?.dirtyTracking.hasPendingChanges()})) throw new Error('请先保存或取消当前配置的字段和规则修改')
    const current = target.currentRow, id = current ? target.getPkKey(current) : undefined
    if (mode === 'child' && id === undefined) throw new Error('请先选择父配置')
    if (current && (target.fieldAccess(current, 'schemeid').read !== 'visible' || current['schemeid'] !== importConfigId.value)) throw new Error('当前配置不属于本方案')
    if (mode === 'sibling' && current && target.fieldAccess(current, 'pid').read !== 'visible') throw new Error('当前配置父级不可读')
    const pid = mode === 'child' ? id : mode === 'sibling' && current ? current['pid'] || importConfigId.value : importConfigId.value
    target.setCurrentRow(await target.addRow({pid, sheet: 0, sheetName: '', titleIndex: 1, dataIndex: 2, exportType: 'tree'}))
  })
}
async function remove(table: string): Promise<void> {if(unconfirmed.value)return;await act(table,async target=>{
  const row=target.currentRow,id=row?target.getPkKey(row):undefined
  if(id===undefined)return
  if(table===fieldsTable){
    const ds=dataSet.value,nodeId=view(nodesTable)?.currentRow?.['rowid'],signature=definitionTargetDraftSignature(target,[String(id)]),own=generation,page=runtime
    if(!ds||typeof nodeId!=='string'||typeof id!=='string')throw new Error('删除映射缺少原节点身份')
    await assertExcelFieldRemoval({dataSet:ds,nodeId,ids:[id],assertCurrent:()=>{
      if(!active||own!==generation||runtime!==page||dataSet.value!==ds||target.currentRow!==row||view(nodesTable)?.currentRow?.['rowid']!==nodeId||definitionTargetDraftSignature(target,[id])!==signature)throw new Error('删除映射期间原目标或草稿已变化')
    }})
  }
  await target.removeRow(id)
})}
onBeforeUnmount(()=>{active=false;generation++;unsubscribers.forEach(off=>off());sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
.excel-workspaces {display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px;}
.excel-workspaces main {min-width:0;display:grid;gap:12px;}
</style>
