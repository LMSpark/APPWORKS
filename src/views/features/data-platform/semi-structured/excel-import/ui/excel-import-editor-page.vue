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
    <template v-if="ready && validTarget">
      <RendererForm :data-view-key="schemeKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
        <FieldText field="solutionName" label="方案名称" :readonly="true" />
        <FieldText field="dataSetId" label="方案数据空间" :readonly="true" />
      </RendererForm>
      <div class="excel-workspaces">
        <aside>
          <RendererButton :data-view-key="nodesKey" label="新增根配置" perm-action="create" :disabled="locked" @click="addRoot" />
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
            <FieldJson field="filters" label="过滤条件" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.filters',value)" />
            <FieldJson field="sorted" label="排序规则" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.sorted',value)" />
            <FieldJson field="sheet_layout_json" label="Sheet 布局" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('nodes.layout',value)" />
          </RendererForm>
          <RendererButton :label="isUnconfirmed(nodesTable) ? '核验配置保存结果' : '保存配置'" :disabled="busy || pendingPart('nodes')" @click="save(nodesTable)" />
          <RendererButton label="取消配置修改" :disabled="busy || unconfirmed" @click="cancel(nodesTable)" />
          <section>
            <h2>字段映射</h2>
            <RendererButton :data-view-key="fieldsKey" label="新增字段" perm-action="create" :disabled="locked" @click="add(fieldsTable,{name:'',title:'',index:''})" />
            <RendererButton :data-view-key="fieldsKey" label="删除字段" perm-action="delete" :disabled="locked" @click="remove(fieldsTable)" />
            <RendererButton :label="isUnconfirmed(fieldsTable) ? '核验字段保存结果' : '保存字段'" :disabled="busy" @click="save(fieldsTable)" />
            <RendererButton label="取消字段修改" :disabled="busy || unconfirmed" @click="cancel(fieldsTable)" />
            <RendererTable :data-view-key="fieldsKey" :children="fieldColumns" :highlight-current-row="true" />
          </section>
          <section>
            <h2>增强规则</h2>
            <RendererButton :data-view-key="rulesKey" label="新增规则" perm-action="create" :disabled="locked" @click="add(rulesTable,{rule_name:'',rule_type:'',sort_order:0,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:'{}'})" />
            <RendererButton :data-view-key="rulesKey" label="删除规则" perm-action="delete" :disabled="locked" @click="remove(rulesTable)" />
            <RendererButton :label="isUnconfirmed(rulesTable) ? '核验规则保存结果' : '保存规则'" :disabled="busy || pendingPart('rules')" @click="save(rulesTable)" />
            <RendererButton label="取消规则修改" :disabled="busy || unconfirmed" @click="cancel(rulesTable)" />
            <RendererTable :data-view-key="rulesKey" :children="ruleColumns" :highlight-current-row="true" />
            <RendererForm v-if="selectedRule" :data-view-key="rulesKey" :auto-columns="false" :show-data-view-meta="false">
              <FieldJson field="condition_json" label="执行条件" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('rules.condition',value)" />
              <FieldJson field="config_json" label="规则配置" mode="text" :readonly="locked" :on-change="validateJson" :on-editing-change="value => pending('rules.config',value)" />
            </RendererForm>
          </section>
        </main>
        <p v-else role="status">请选择左侧节点后再编辑</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeExcelImport} from '@/lowcode/resources/semi-structured/excel-import/resource'

const {PAGE_RUNTIME, RendererTree, RendererTable, RendererForm, RendererButton, FieldText, FieldNumber, FieldSelect, FieldJson, useSparkComponent} = SparkComponent
const props = defineProps<{schemeRowid?: string}>(), route = useRoute()
const importConfigId = computed(() => props.schemeRowid ?? (typeof route.query['importConfigId'] === 'string' ? route.query['importConfigId'] : ''))
const scene = LowcodeExcelImport.designScenarioId, catalogScene = LowcodeExcelImport.navigationScenarioId
const nodesTable = 'Base_ImportData_Config', fieldsTable = 'Base_ImportData_Field', rulesTable = 'Base_Import_Transform_Rule'
const key = (table: string) => buildDataViewKey(table, 'default', scene)
const nodesKey = key(nodesTable), fieldsKey = key(fieldsTable), rulesKey = key(rulesTable), methodsKey = key('ImportExportMethods')
const schemeKey = buildDataViewKey('Base_Import_solution', 'editorTarget', catalogScene)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'excel-import-editor-page'})
const dataSet = shallowRef<DataSet>(), catalog = shallowRef<DataSet>(), opening = ref(false), ready = ref(false), acting = ref(false), error = ref(''), revision = ref(0)
const inputs = ref(new Set<string>())
let runtime: PageRuntime | undefined, unsubscribers: Array<() => void> = [], generation = 0, active = true
const view = (table: string) => dataSet.value?.getView(table)
const views = computed(() => Object.values(dataSet.value?.tables ?? {}).flatMap(table => table.viewList))
const validTarget = computed(() => {revision.value; return catalog.value?.getView('Base_Import_solution','editorTarget')?.rows.length === 1})
const loading = computed(() => {revision.value; return opening.value || views.value.some(item => item.requestState === RequestState.Preparing || item.requestState === RequestState.Loading)})
const missing = computed(() => ready.value && !validTarget.value)
const busy = computed(() => acting.value || loading.value)
const unconfirmed = computed(() => {revision.value; return views.value.some(item => item.hasUnconfirmedSave)})
const locked = computed(() => busy.value || unconfirmed.value)
const hasPending = computed(() => {revision.value; return acting.value || inputs.value.size > 0 || views.value.some(item => item.hasUnconfirmedSave || item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty() {return opening.value || hasPending.value}})
const selectedNode = computed(() => {revision.value; return view(nodesTable)?.currentRow ?? null})
const selectedRule = computed(() => {revision.value; return view(rulesTable)?.currentRow ?? null})
const queryError = computed(() => {revision.value; return views.value.find(item => item.loadingError)?.loadingError?.message ?? ''})
function pending(id: string, editing: boolean): void {if (editing) inputs.value.add(id); else inputs.value.delete(id)}
function pendingPart(prefix: string): boolean {return [...inputs.value].some(id => id.startsWith(prefix + '.'))}
function isUnconfirmed(table: string): boolean {revision.value; return view(table)?.hasUnconfirmedSave === true}
function validateJson(value: unknown): void {if (typeof value !== 'string') throw new Error('配置必须是JSON文本'); if (value.trim()) parseJsonDocument(value)}
const fieldColumns = computed<SparkNode[]>(() => Object.entries({name:'字段名称',title:'标题',index:'索引',type:'类型'}).map(([field,label]) => ({type:field === 'type' ? 'r-number' : 'r-text',props:{field,label,showCellControl:true,cellReadonly:()=>locked.value}})))
const ruleColumns = computed<SparkNode[]>(() => Object.entries({rule_name:'规则名称',rule_type:'规则类型',source_field:'来源字段',target_field:'目标字段',sort_order:'顺序',enabled:'启用',on_error:'错误处理'}).map(([field,label]) => ({type:['sort_order','enabled'].includes(field)?'r-number':'r-text',props:{field,label,showCellControl:true,cellReadonly:()=>locked.value}})))
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
defineExpose({hasPending,busy,unconfirmed,discardChanges:discardAll})
watch(importConfigId, async id => {
  const own = ++generation
  unsubscribers.forEach(off=>off()); unsubscribers=[]; sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime=undefined; dataSet.value=undefined; catalog.value=undefined
  ready.value=false; opening.value=true; error.value=''; inputs.value.clear()
  try {
    if (!id.trim()) throw new Error('缺少 importConfigId 参数')
    const page = new PageRuntime({pageId:'excel-import-editor-page',scenarioIds:[catalogScene,scene],scenarioInputs:{[catalogScene]:{importConfigId:id},[scene]:{importConfigId:id}},
      loadScenario: space => space === scene ? LowcodeExcelImport.loadEditor(scene) : LowcodeExcelImport.loadCatalog(catalogScene)})
    runtime=page; await page.load()
    if (!active || own!==generation) {page.dispose();return}
    catalog.value=page.getDataSet(catalogScene); dataSet.value=page.getDataSet(scene)
    const target=catalog.value?.getView('Base_Import_solution','editorTarget'), nodes=view(nodesTable)
    if (!target || !nodes) throw new Error('Excel正式设计视图缺失')
    const changed=()=>revision.value++
    unsubscribers=[catalog.value!,dataSet.value!].map(ds=>ds.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,selectedRowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed}))
    await target.refresh(); if (target.loadingError) throw target.loadingError
    if (!active || own!==generation) return
    if (target.rows.length>1) throw new Error('方案身份不唯一')
    if (target.rows.length===1) {
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
  if (pendingPart(table===nodesTable?'nodes':'rules')) return
  if (table===nodesTable && !target.hasUnconfirmedSave) for(const row of target.rows){
    const id=target.getPkKey(row)
    if(id!==undefined && (target.hasEditingChanges(id)||target.dirtyTracking.hasPendingChanges(id))){
      const value=target.getEditingRow(id)?.['sheetName']??row['sheetName']
      if(target.fieldAccess(row,'sheetName').read!=='visible'||typeof value!=='string'||!value.trim())throw new Error('请输入工作表名称')
    }
  }
  const result=await dataSet.value!.saveChanges({views:[{tableName:table,viewId:'default'}]})
  if(!result.success)throw new Error(result.message??'保存未完整确认')
})}
function cancel(table: string): void {if(!busy.value&&!unconfirmed.value){try{view(table)?.discardPendingChanges();error.value='';revision.value++}catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}}}
function discardAll(): boolean {if(busy.value||unconfirmed.value)return false;for(const target of views.value)target.discardPendingChanges();revision.value++;return !hasPending.value}
async function add(table: string, data: Partial<DataRow>): Promise<void> {if(unconfirmed.value)return;await act(table,async target=>{target.setCurrentRow(await target.addRow(data))})}
async function addRoot(): Promise<void> {await add(nodesTable,{pid:importConfigId.value,sheet:0,sheetName:'',titleIndex:1,dataIndex:2,exportType:'tree'})}
async function remove(table: string): Promise<void> {if(unconfirmed.value)return;await act(table,async target=>{const row=target.currentRow,id=row?target.getPkKey(row):undefined;if(id!==undefined)await target.removeRow(id)})}
onBeforeUnmount(()=>{active=false;generation++;unsubscribers.forEach(off=>off());sparkRemove(PAGE_RUNTIME);runtime?.dispose()})
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
.excel-workspaces {display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px;}
.excel-workspaces main {min-width:0;display:grid;gap:12px;}
</style>
