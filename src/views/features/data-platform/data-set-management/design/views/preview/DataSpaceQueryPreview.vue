<!--
@module app:views/features/data-platform/data-set-management/design/views/preview/DataSpaceQueryPreview
职责：以标准组件绑定独立预览DataView，输入调用参数、查询并呈现原数据权限。
边界：运行数据不进入元数据或文件草稿；关闭释放实例，失败不呈现旧结果。
AI用途：正式模型及命名视图的原生查询预览，数据交互使用PageRuntime和spark-data API。
-->
<template>
  <section class="data-space-query-preview" :aria-label="tableName === undefined && viewId === undefined ? '模型查询预览' : '命名视图查询预览'">
    <p v-if="loading" role="status">正在装配预览…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready && controls && !controls.destroyed && preview && !preview.disposed">
      <RendererSection class="preview-card" :data-view-key="controlKey" title="预览条件：" bordered :grid-columns="1">
        <RendererForm v-if="directInputs && contextSchema" :data-view-key="controlKey" context-data-member="currentRow"
          :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" label-width="0px">
          <p>本次测试值；未提供的覆盖值沿用视图默认值，不修改来源映射。</p>
          <FieldJson field="context" label="" mode="properties" :schema="contextSchema" value-label="测试值" :height="220" />
        </RendererForm>
        <p v-if="functionWarning" role="alert">{{ functionWarning }}</p>
        <RendererFilter v-if="!directInputs || tableName !== undefined" :data-view-key="preview.dataViewKey" :auto-query="filter?.autoQuery"
          :filter-function-context="functionContext" expression-display="inline" />
        <RendererForm v-slot="{row}" :data-view-key="controlKey" context-data-member="currentRow"
          :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" label-width="96px">
        <div class="preview-toolbar">
          <div class="preview-toolbar-main">
            <FieldRadio field="outputType" label="输出类型：" :button-style="false"
              :options="tableName === undefined && viewId === undefined ? [...outputTypes] : [{label: '沿用视图默认', value: ''}, ...outputTypes]" />
            <FieldRadio field="resultMode" label="结果过滤：" :button-style="false"
              :options="[{label: '完整结果', value: 'full'}, {label: '仅数据', value: 'data'}]" />
            <FieldText v-if="row['outputType'] === 'SelfRefData' && nodeQueryInputs" field="nodeId" label="查询节点：" placeholder="父节点或定位目标的 ID" />
            <FieldCheckbox v-if="row['outputType'] === 'Table' || tableName !== undefined && row['outputType'] !== 'SelfRefData'" field="allPages" label="" checkbox-text="读取过滤条件下的完整集合" />
          </div>
          <RendererButton :data-view-key="controlKey" data-action="run-query-preview" :disabled="querying" button-type="primary" label="查询" @click="query" />
        </div>
        <RendererSection :data-view-key="controlKey" title="调用参数与查询设置" collapsible default-collapsed :grid-columns="1">
          <p v-if="tableName === undefined && viewId === undefined">{{ modelName }} · 模型查询预览。使用当前请求与字段查询设置，不叠加命名视图条件；参数与结果仅在本次预览有效。</p>
          <p v-else>{{ modelName ?? tableName }} @ {{ viewId }}。使用当前配置查询；调用参数及结果仅在本次预览中有效。</p>
          <p v-if="contextWarning" role="status">{{ contextWarning }}</p>
          <template v-if="!directInputs">
            <FieldJson v-if="contextSchema" field="context" label="调用参数覆盖值（未填沿用视图默认）" mode="properties" :schema="contextSchema" value-label="本次值" :height="220" />
            <FieldText field="context" label="完整调用参数（JSON对象）" />
          </template>
          <div class="preview-settings">
            <template v-if="row['outputType'] !== 'SelfRefData'">
              <FieldNumber field="pageSize" label="每次请求条数（1—1000）" />
              <FieldNumber v-if="row['allPages'] === true" field="maxRows" label="完整集合上限（行）" />
            </template>
            <template v-if="row['outputType'] === 'SelfRefData' && nodeQueryInputs">
              <FieldSelect field="keyField" label="树节点标识字段" :option-data-view-key="fieldKey" option-value-field="name" option-label-field="label" />
              <FieldSelect field="parentField" label="树父节点字段" :option-data-view-key="fieldKey" option-value-field="name" option-label-field="label" />
              <FieldSelect field="treeMode" label="查询方向" :clearable="false" :options="[{label: '默认方向', value: ''}, ...DataViewQuery.treeModes]" />
              <FieldSelect field="hasChildrenField" label="子节点标志字段（可选）" :option-data-view-key="fieldKey" option-value-field="name" option-label-field="label" />
            </template>
          </div>
        </RendererSection>
        </RendererForm>
      </RendererSection>
      <p v-if="querying" role="status">正在查询…</p>
      <RendererDetail v-slot="{row}" :data-view-key="controlKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <RendererSection class="preview-card" :data-view-key="preview.dataViewKey" data-member="rows" title="输出结果" bordered :grid-columns="1">
          <FieldJson :data-view-key="preview.dataViewKey" data-member="rows" :include-query-info="row['resultMode'] === 'full'" :height="240" />
        </RendererSection>
      </RendererDetail>
      <RendererSection class="preview-card" :data-view-key="preview.dataViewKey" data-member="rows" title="结果数据" bordered :grid-columns="1">
        <p v-if="!resultFields.length">当前模型暂无可展示的顶层标量字段</p>
        <RendererTable v-else-if="result" :data-view-key="preview.dataViewKey" :show-data-view-meta="true" :auto-columns="false" :max-height="280">
          <FieldText v-for="field in resultFields" :key="field.name" :field="field.name" :label="field.label || field.name" :min-width="180" show-overflow-tooltip readonly />
        </RendererTable>
        <p v-else>暂无数据</p>
      </RendererSection>
    </template>
    <div class="preview-footer"><RendererButton data-action="close-query-preview" label="关闭" @click="emit('close')" /></div>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef} from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter, DataViewLocalQuery, DataViewQuery, RequestState, type DataView, type DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {ScenarioDefinitionResource, DataSpaceReferenceLayoutResource, ProjectToolResource} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceQueryPreview} from '@/lowcode/data-space/view-design/preview/lowcode-data-space-query-preview'
import type {DataSpaceQueryPreviewProps} from './DataSpaceQueryPreview.props'
import {LowcodeDataSpaceFieldValue} from '@/lowcode/data-space/model-source/field-value/lowcode-data-space-field-value'

const {FieldCheckbox, FieldJson, FieldNumber, FieldRadio, FieldSelect, FieldText, PAGE_RUNTIME, RendererButton, RendererDetail, RendererFilter, RendererForm, RendererSection, RendererTable, useSparkComponent} = SparkComponent
const props = defineProps<DataSpaceQueryPreviewProps>()
const emit = defineEmits<{close: []}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-space-query-preview'})
const preview = shallowRef<LowcodeDataSpaceQueryPreview>()
const localQuery = computed(() => ['file', 'static-data'].includes(preview.value?.view.dataTable?.resourceType ?? ''))
const outputTypes = computed(() => localQuery.value ? DataViewLocalQuery.outputTypes : DataViewQuery.outputTypes)
const controls = shallowRef<DataView>()
const controlKey = ref('')
const fieldKey = ref('')
const nodeQueryInputs = ref(true)
const contextSchema = shallowRef<JsonSchemaObject>()
const directInputs = ref(false), contextWarning = ref('')
const functionContext = shallowRef<DataViewFilterFunctionContext>({}), functionWarning = ref('')
const resultFields = computed(() => preview.value && !preview.value.disposed ? preview.value.view.columns
  .filter(column => column.name !== '_pk' && !/对象|数组|json|object|array/i.test(column.type)) : [])
const ready = ref(false), loading = ref(true), querying = ref(false), result = ref(false), error = ref('')
let active = true
let unsubscribe: (() => void) | undefined
let stopDisposal: (() => void) | undefined
const describeError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

async function open(): Promise<void> {
  try {
    if ((props.tableName === undefined) !== (props.viewId === undefined)) throw new Error('命名视图的表绑定和视图ID必须同时提供')
    let candidate: LowcodeDataSpaceQueryPreview
    if (props.fileResourceId !== undefined) {
      if (!props.tableName || !props.viewId || props.modelId !== undefined || props.modelName !== undefined) throw new Error('文件视图须提供资源身份，不得混用数据库模型身份')
      candidate = await props.session.openPreview({tableName: props.tableName, viewId: props.viewId, fileResourceId: props.fileResourceId})
    } else {
      if (!props.modelId || !props.modelName) throw new Error('正式模型身份不完整')
      candidate = props.tableName === undefined || props.viewId === undefined
        ? await props.session.openModelPreview({modelId: props.modelId, modelName: props.modelName})
        : await props.session.openPreview({modelId: props.modelId, modelName: props.modelName, tableName: props.tableName, viewId: props.viewId})
    }
    if (!active) {candidate.dispose(); return}
    preview.value = candidate
    stopDisposal = candidate.onDispose(() => {
      if (!active) return
      ready.value = false; loading.value = false; querying.value = false; result.value = false
      error.value ||= '预览已关闭或配置已变化，请关闭后重新打开预览'
      unsubscribe?.(); unsubscribe = undefined
      sparkRemove(PAGE_RUNTIME); controls.value = undefined; preview.value = undefined
    })
    if (candidate.disposed) return
    const modelOnlyPreview = props.modelId !== undefined && props.tableName === undefined && props.viewId === undefined
    let context = '{}'
    const sourceTest = props.tableName === undefined && props.viewId === undefined
      && ['third-party-api', 'logical-view'].includes(candidate.view.dataTable!.resourceType ?? '')
    directInputs.value = !!props.modelId && (sourceTest || candidate.view.queryConfig.sourceInputMode === 'direct')
    if (directInputs.value && props.modelId) {
      await props.session.loadSourceInputFields(props.modelId)
      if (!active || candidate.disposed) {candidate.dispose(); return}
    }
    const parameters: {schema: JsonSchemaObject; warning: string} = props.modelId
      ? new LowcodeDataSpaceFieldValue({dataSet: props.session.metadataDataSet, targetId: props.session.targetId, modelId: props.modelId}).readQueryParameters(directInputs.value ? 'direct' : 'mapped')
      : {schema: {type: 'object', properties: {}}, warning: ''}
    if (props.fileResourceId) {
      const fields = props.fileResourceId === DataSpaceReferenceLayoutResource.resourceId
        ? DataSpaceReferenceLayoutResource.queryParameters() : Object.values(ProjectToolResource.resources).some(id => id === props.fileResourceId)
          ? ProjectToolResource.queryParameters(props.fileResourceId) : ScenarioDefinitionResource.queryParameters(props.fileResourceId)
      parameters.schema = {type: 'object', properties: Object.fromEntries(fields.map(field =>
        [field.name, {description: field.label ?? field.name, 'x-typeLabel': field.type}])),
      required: fields.filter(field => field.required).map(field => field.name)}
    }
    if (parameters.warning && directInputs.value) throw new Error(parameters.warning)
    contextWarning.value = parameters.warning
    if (!parameters.warning && (directInputs.value || Object.keys(parameters.schema.properties ?? {}).length)) contextSchema.value = parameters.schema
    if (!directInputs.value || props.tableName !== undefined) {
      let models: DataViewFilterFunctionContext = {}
      try {models = await props.session.loadPreviewFilterContext(candidate)}
      catch (cause) {if (active) functionWarning.value = describeError(cause)}
      if (!active || candidate.disposed) {candidate.dispose(); return}
      functionContext.value = DataViewFilter.editorContext({...models,
        inputParams: Object.entries(parameters.schema.properties ?? {}).map(([name, schema]) => ({value: name,
          label: typeof schema === 'object' && schema.description ? schema.description : name})),
      })
    }
    if (sourceTest) {
      context = JSON.stringify(Object.fromEntries(Object.keys(parameters.schema.properties ?? {}).map(name => [name, ''])))
      candidate.view.queryConfig = {...candidate.view.queryConfig, sourceInputMode:'direct', autoQuery:props.filter?.autoQuery ?? true}
    }
    const dataSet = candidate.runtime.getDataSet(props.session.targetId)!
    const table = dataSet.addTable(`PreviewInputs_${crypto.randomUUID().replaceAll('-', '')}`, [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'context', type: 'string'}, {name: 'pageSize', type: 'number'},
      {name: 'allPages', type: 'boolean'}, {name: 'maxRows', type: 'number'},
      ...['outputType', 'resultMode', 'keyField', 'parentField', 'hasChildrenField', 'treeMode', 'nodeId'].map(name => ({name, type: 'string'})),
    ])
    table.resourceType = 'static-data'
    const view = table.getOrCreateView('default')
    const queryConfig = candidate.view.queryConfig
    const modelPreviewDefaults = modelOnlyPreview && props.modelId
      ? props.session.getModelEdit(props.modelId).readPreview(candidate.view) : undefined
    nodeQueryInputs.value = !localQuery.value && (candidate.view.dataTable!.resourceType !== 'json' || queryConfig.tree !== undefined)
    if (props.tableName === undefined && props.viewId === undefined) candidate.view.pageSize = 10
    view.commitMode = 'staged'; view.replaceRows([{id: 'inputs', context, resultMode: 'data', pageSize: candidate.view.pageSize,
      allPages: queryConfig.allPages ?? false, maxRows: queryConfig.maxRows ?? 50000,
      outputType: modelPreviewDefaults?.outputType ?? queryConfig.outputType ?? (queryConfig.tree ? 'SelfRefData' : ''),
      keyField: modelPreviewDefaults?.keyField ?? queryConfig.tree?.keyField ?? '',
      parentField: modelPreviewDefaults?.parentField ?? queryConfig.tree?.parentField ?? '',
      hasChildrenField: modelPreviewDefaults?.hasChildrenField ?? queryConfig.tree?.hasChildrenField ?? '',
      treeMode: modelPreviewDefaults?.treeMode ?? queryConfig.tree?.mode ?? '',
      nodeId: modelPreviewDefaults?.nodeId ?? queryConfig.tree?.nodeId ?? '',
    }]); view.setCurrentRowById('inputs')
    const fields = dataSet.addTable(`${table.tableName}_Fields`, [{name: 'name', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'}])
    fields.resourceType = 'static-data'
    fields.rows = candidate.view.queryColumns
      .map(column => ({name: column.name, label: column.label || column.name}))
    const fieldView = fields.getOrCreateView('default')
    fieldView.replaceRows(fields.rows)
    fieldKey.value = buildDataViewKey(fields.tableName, fieldView.viewId, dataSet.scenarioId)
    controls.value = view; controlKey.value = buildDataViewKey(table.tableName, view.viewId, dataSet.scenarioId)
    const resultView = candidate.view
    const syncQueryState = () => {
      if (!active || candidate.disposed) return
      querying.value = resultView.requestState === RequestState.Loading || resultView.requestState === RequestState.Preparing
      result.value = resultView.requestState === RequestState.Loaded
      error.value = resultView.loadingError?.message ?? ''
    }
    resultView.events.on('requestStateChanged', syncQueryState)
    unsubscribe = () => resultView.events.off('requestStateChanged', syncQueryState)
    candidate.bindInputs(view, [
      {sourceField: 'context', target: 'queryContext', format: 'json'},
      {sourceField: 'pageSize', target: 'pageSize'},
      {sourceField: 'outputType', target: 'queryConfig.outputType', omitEmpty: true},
      {sourceField: 'allPages', target: 'queryConfig.allPages', ...(modelOnlyPreview ? {when:{field:'outputType',equals:'Table'}} : {})},
      {sourceField: 'maxRows', target: 'queryConfig.maxRows', when: {field: 'allPages', equals: true}},
      ...(nodeQueryInputs.value ? ['keyField', 'parentField', 'nodeId', 'hasChildrenField', 'mode'] as const : []).map(field => ({
        sourceField: field === 'mode' ? 'treeMode' : field, target: `queryConfig.tree.${field}` as const,
        when: {field: 'outputType', equals: 'SelfRefData'},
        ...(field === 'mode' || field === 'hasChildrenField' ? {omitEmpty: true} : {}),
      })),
    ])
    sparkProvide(PAGE_RUNTIME, candidate.runtime); ready.value = true
  } catch (cause) {if (active) error.value = describeError(cause); preview.value?.dispose()}
  finally {if (active) loading.value = false}
}

async function query(): Promise<void> {
  const current = preview.value
  if (!current || querying.value) return
  error.value = ''
  try {await current.refresh()}
  catch (cause) {if (active) error.value = describeError(cause)}
}

onBeforeUnmount(() => {active = false; unsubscribe?.(); stopDisposal?.(); sparkRemove(PAGE_RUNTIME); preview.value?.dispose()})
void open()
</script>

<style scoped>
.preview-card { padding: 14px 16px; box-sizing: border-box; min-width: 0; }
.data-space-query-preview { display: grid; gap: 12px; }
.preview-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-top: 12px; }
.preview-toolbar-main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; min-width: 0; }
.preview-toolbar-main :deep(.el-form-item) { margin-bottom: 0; }
.preview-toolbar-main :deep(.el-radio-group) { flex-wrap: wrap; }
.preview-settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0 20px; }
.preview-footer { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 640px) { .preview-toolbar { flex-wrap: wrap; } }
</style>
