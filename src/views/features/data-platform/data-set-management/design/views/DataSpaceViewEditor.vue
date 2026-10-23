<!--
@module app:views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor
职责：在所属正式模型下呈现命名视图配置，通过绑定的DataView编辑和取消，通过DataSet提交变更。
边界：通过原生DataView编辑定义和所属模型绑定，存储由数据层适配，不读取业务行或另建权限和保存通道。
AI用途：将模型和选定视图接入原生数据空间页面时使用；复杂配置通过绑定原定义视图的标准r-json和过滤编辑器维护。
-->
<template>
  <section aria-label="数据视图编辑" class="view-editor">
    <p>模型 {{ modelName ?? fileResource?.tableName }} 的命名视图。未配置项沿用运行默认值；保存前会校验字段引用和完整配置。</p>
    <p v-if="state.error || error" role="alert">{{ error || state.error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="readbackFailure && !error" role="alert">目录回读未完成：{{ readbackFailure }}</p>
    <RendererButton v-if="readbackFailure" :data-view-key="definitionViewKey" data-action="reload-view-directory"
      :disabled="busy || disabled" label="重读视图目录" @click="retryReadback" />
    <p v-if="state.file?.saveStatus === 'unknown'" role="alert">文件提交结果未知，先核验；不会自动重复写入。</p>
    <RendererTabs v-if="availableViews.length" :data-view-key="definitionViewKey" data-member="currentRow"
      :model-value="rowKey === undefined ? '' : String(rowKey)" data-view-selector @update:model-value="selectExistingView">
      <RendererTabPane v-for="(item, index) in availableViews" :key="item.key" :index="index" :name="item.key"
        :label="item.label" :disabled="blocked || localDirty" />
    </RendererTabs>
    <p v-if="!row">请选择一个数据视图，或在当前模型下新增视图，再配置请求。</p>
    <div class="actions">
      <RendererButton button-type="primary" data-action="save-views" :disabled="blocked || !definitionDirty || !!activeProperty || filterPending || propertyPending || projectionDialogOpen || !!newName || !!newTable"
        label="保存视图配置" @click="save" />
      <RendererButton data-action="discard-view-edits" :disabled="blocked || !localDirty" label="取消未提交修改" @click="discard" />
      <RendererButton v-if="state.file?.saveStatus === 'unknown'" data-action="verify-views" :disabled="busy || disabled" label="核验文件提交" @click="verify" />
      <RendererButton v-if="state.file && definitionDirty" data-action="preview-remote-views" :disabled="busy || disabled || propertyPending || !!bindingRemoval || state.file.saveStatus === 'pending'" label="查看远端并处理草稿" @click="previewRemote" />
    </div>
    <div v-if="remotePreview" class="remote-preview">
      <p>这是当前远端配置。确认后取消本地视图与绑定修改，采用已展示的远端配置；数据库参数修改保留。</p>
      <pre>{{ remotePreview.text === null ? '远端尚无视图文件' : remotePreview.text }}</pre>
      <RendererButton data-action="adopt-remote-views" :disabled="busy || disabled" label="确认采用已展示远端" @click="adoptRemote" />
      <RendererButton :disabled="busy" label="取消处理" @click="remotePreview = null" />
    </div>
    <div v-if="bindingRemoval" data-binding-removal class="remote-preview">
      <p>将{{ fileResource ? '删除文件模型' : '解除绑定' }} {{ bindingRemoval.tableName }}，移除其全部视图（{{ bindingRemoval.viewIds.join('、') }}）、本地配置和布局位置。</p>
      <p>{{ fileResource ? '只删除本空间内的模型及其配置，文件资源内容保留。' : '数据库模型与字段保留。' }}引用它的其他页面需同步调整。</p>
      <p v-if="bindingRemoval.references.length" role="note">请先处理仍存的引用：{{ bindingRemoval.references.join('；') }}</p>
      <p>确认后记录绑定删除，点击“保存视图配置”提交；保存前可以取消。</p>
      <RendererButton button-type="danger" data-action="confirm-remove-binding" :disabled="busy || disabled" label="确认解除绑定" @click="confirmBindingRemoval" />
      <RendererButton data-action="cancel-remove-binding" :disabled="busy" label="取消解除" @click="bindingRemoval = null" />
    </div>
    <div v-if="row && view && !state.error" :key="String(rowKey)" data-view-properties>
      <p>{{ row['tableName'] }} @ {{ row['viewId'] }}</p>
      <RendererButton :data-view-key="definitionViewKey" data-action="open-query-preview" :disabled="blocked || localDirty"
        label="查询预览" @click="previewOpen = true" />
      <RendererDialog v-model="previewOpen" :data-view-key="definitionViewKey" data-member="currentRow" title="数据预览"
        width="92%" top="4vh" :grid-columns="1" append-to-body destroy-on-close :close-on-click-modal="false">
        <DataSpaceQueryPreview v-if="previewOpen" :key="`${rowKey}:${state.file?.revision}`" :session="session"
          v-bind="fileResource ? {fileResourceId: fileResource.resourceId} : modelId && modelName ? {modelId, modelName} : {}"
          :table-name="String(row['tableName'])" :view-id="String(row['viewId'])" @close="previewOpen = false" />
      </RendererDialog>
      <RendererSection v-if="!fileResource && !activeProperty" title="查询输出与聚合" :data-view-key="definitionViewKey" data-member="currentRow"
        :grid-columns="1" :bordered="false" data-query-output>
        <p>配置当前视图的输出字段、分组标记与聚合值函数。后端聚合支持数据库表、数据库视图的单表或关联查询，不支持树查询；同模型的明细和统计可以使用不同命名视图。</p>
        <p v-if="row['fieldProjection'] === undefined">未配置时沿用模型输出。初始化只创建当前视图草稿，不修改模型字段。</p>
        <RendererButton v-if="row['fieldProjection'] === undefined" :data-view-key="definitionViewKey" data-action="initialize-query-output"
          :disabled="blocked || filterPending" label="配置查询输出" @click="initializeQueryOutput" />
        <RendererForm v-else :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <FieldJson data-member="currentRow" field="fieldProjection" label="查询字段"
            value-format="native" mode="rows" row-edit-mode="inline" :children="projectionChildren" :row-adapter="projectionAdapter"
            :readonly="blocked" :max-height="420" :on-editing-change="value => propertyEditingChanged(value, 'projection')" />
        </RendererForm>
      </RendererSection>
      <RendererSection v-if="row['aggregates'] !== undefined" title="旧本地汇总" :data-view-key="definitionViewKey" data-member="currentRow"
        :grid-columns="1" :bordered="false" data-legacy-aggregates>
        <p>正式远程视图已停止旧配置的本地汇总，原配置保留。请在命名视图的查询输出中配置后端聚合，确认下游绑定后再显式移除旧配置；这不会自动迁移旧汇总。</p>
        <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <FieldJson data-member="currentRow" field="aggregates" label="原配置" value-format="native" readonly />
        </RendererForm>
        <RendererButton :disabled="blocked || !!activeProperty || propertyPending || projectionDialogOpen" data-clear-property="aggregates"
          label="移除旧配置" @click="change('aggregates', undefined)" />
      </RendererSection>
      <RendererSection v-for="group in propertyGroups" v-show="!activeProperty" :key="group.title" :title="group.title" :data-view-key="definitionViewKey"
        data-member="currentRow" :grid-columns="1" :bordered="false" :data-view-request-settings="group.request ? '' : undefined">
      <div v-if="group.request && !activeProperty" data-request-workspace class="request-workspace">
        <RendererSection v-for="part in requestSections" :key="part.title" :title="part.title" :data-view-key="definitionViewKey"
          data-member="currentRow" :grid-columns="1" :bordered="false" :data-request-parameters="part.parameters ? '' : undefined">
          <RendererForm v-if="Object.keys(part.schema.properties ?? {}).length" :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
            :grid-columns="1" :form-props="{disabled: blocked, labelPosition: 'top'}">
            <FieldJson field="queryConfig" label="" data-member="currentRow" value-format="native" mode="form" :schema="part.schema"
              :empty-value="{}" :readonly="blocked" :on-editing-change="value => propertyEditingChanged(value, part.title)" />
          </RendererForm>
          <template v-if="part.parameters">
            <p>当前视图的默认调用值；实际调用可以覆盖。{{ fileResource ? '参数由文件资源声明，目标数据空间ID定位被查询的配置文件。' : '参数声明和来源值函数映射在模型与空间配置中维护。' }}</p>
            <p v-if="parameterCatalog.warning" role="status">{{ parameterCatalog.warning }}</p>
            <p v-else-if="!Object.keys(parameterCatalog.schema.properties ?? {}).length" role="status">尚无已声明参数；已有调用值保留，可通过完整JSON编辑维护。</p>
            <div class="actions">
              <RendererButton v-if="modelId && parameterCatalog.warning && sourceInputMode === 'direct'" data-action="load-query-parameters"
                :disabled="blocked || filterPending || propertyPending" label="加载来源参数目录" @click="run(async () => {if (modelId) await session.loadSourceInputFields(modelId)})" />
              <RendererButton data-action="toggle-inline-context-json" :disabled="blocked || filterPending || propertyPending"
                :label="contextEditorMode === 'properties' ? '完整JSON编辑' : '返回参数表'"
                @click="contextEditorMode = contextEditorMode === 'properties' ? 'tree' : 'properties'" />
              <RendererButton data-action="clear-query-parameters" :disabled="blocked || filterPending || propertyPending || row['queryContext'] === undefined"
                label="移除默认调用值" @click="change('queryContext', undefined)" />
            </div>
            <RendererForm v-if="!parameterCatalog.warning || contextEditorMode === 'tree'" :data-view-key="definitionViewKey" context-data-member="currentRow"
              :auto-columns="false" :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked, labelPosition: 'top'}">
              <FieldJson field="queryContext" label="默认调用值" data-member="currentRow" value-format="native" :mode="contextEditorMode"
                :schema="parameterCatalog.schema" value-label="默认调用值" :empty-value="{}" :readonly="blocked"
                :on-editing-change="value => propertyEditingChanged(value, 'context')" />
            </RendererForm>
          </template>
          <template v-if="part.filter">
            <h4>过滤条件</h4>
            <p v-if="columnState.error" :role="columnState.pending ? 'status' : 'alert'">{{ columnState.error }}</p>
            <p v-if="parameterCatalog.warning" role="status">{{ parameterCatalog.warning }}</p>
            <p v-if="functionCatalogError" role="alert">{{ functionCatalogError }}</p>
            <RendererFilterExpression v-if="!columnState.error" :key="filterRevision" :data-view-key="definitionViewKey"
              data-member="currentRow" field="filterExpression" :columns="columnState.columns" :disabled="blocked"
              display="dialog" display-mode="inline" :function-context="filterFunctionContext" :on-editing-change="filterEditingChanged" />
            <RendererButton v-else :disabled="blocked || propertyPending" label="重新加载字段" @click="run(loadFields)" />
            <p v-if="filterPending" role="status">请先应用或取消过滤编辑，再保存或切换配置。</p>
          </template>
        </RendererSection>
      </div>
      <RendererSection v-if="group.request" title="请求完成" :data-view-key="definitionViewKey" data-member="currentRow"
        :grid-columns="1" :bordered="false" data-completion-config>
        <p v-if="!view?.columns.some(column => column.name === 'onRequestComplete')" role="status">当前元数据空间尚未声明请求完成字段，请先更新设计器的数据空间配置。</p>
        <RendererForm v-else :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
          :grid-columns="1" :form-props="{disabled: blocked}">
          <FieldText field="onRequestComplete" label="请求完成函数" placeholder="页面 script.js 中的函数名；留空禁用" />
        </RendererForm>
        <p>查询成功后调用，接收一个含 view、dataViewKey、signal 的对象。预览只查询数据；完成函数由使用此视图的页面执行。</p>
        <RendererButton :disabled="blocked || row['onRequestComplete'] === undefined" data-clear-property="onRequestComplete"
          label="移除完成配置" @click="change('onRequestComplete', undefined)" />
      </RendererSection>
      <RendererSection :title="group.request ? '其他请求配置与完整编辑' : '结果组织与编辑配置'" :data-view-key="definitionViewKey"
        data-member="currentRow" collapsible default-collapsed lazy :grid-columns="1" :bordered="false">
      <RendererForm :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
        :grid-columns="1" :form-props="{disabled: blocked || !!activeProperty}">
      <div v-for="column in group.properties" :key="column.name" class="property" :data-property="column.name">
        <div class="property-name"><small>{{ column.name }}</small><span v-if="row[column.name] === undefined">未配置</span></div>
        <div>
          <FieldNumber v-if="column.type === 'number'" :field="column.name" :label="label(column.name)" />
          <FieldCheckbox v-else-if="column.type === 'boolean'" :field="column.name" :label="label(column.name)" />
        <FieldSelect v-else-if="column.name === 'commitMode'" field="commitMode" label="提交方式" :clearable="false" placeholder="未配置"
          :options="[{label: '暂存后提交', value: 'staged'}, {label: '立即提交', value: 'immediate'}]" />
        <div v-else-if="column.name === 'labelField'" class="complex-value">
          <FieldSelect field="labelField" label="显示字段" :clearable="false" placeholder="未配置" />
          <p v-if="fieldState('labelField').valueStatus === 'invalid'" role="alert">{{ row[column.name] }}（引用已失效，原配置保留）</p>
          <p v-if="fieldState('labelField').error" role="alert">{{ fieldState('labelField').error }}</p>
        </div>
        <FieldText v-else-if="column.type === 'string'" :field="column.name" :label="label(column.name)" placeholder="未配置" />
        <div v-else class="complex-value">
          <span v-if="column.name !== 'valueField'">{{ label(column.name) }}</span>
          <FieldSelect v-if="column.name === 'valueField'" field="valueField" label="取值字段候选" :clearable="false"
            placeholder="选择单字段；多字段使用编辑" />
          <code>{{ row[column.name] === undefined ? '未配置' : JSON.stringify(row[column.name]) }}</code>
          <p v-if="column.name === 'valueField' && fieldState('valueField').valueStatus === 'invalid'" role="alert">取值字段引用已失效，原配置保留，请修正。</p>
          <RendererButton :disabled="blocked || !!activeProperty || filterPending || propertyPending" :data-edit-property="column.name" label="编辑" @click="editProperty(column.name)" />
        </div>
        </div>
        <RendererButton :disabled="blocked || propertyPending || row[column.name] === undefined" :data-clear-property="column.name" label="移除配置" @click="change(column.name, undefined)" />
      </div>
      </RendererForm>
      </RendererSection>
      </RendererSection>
      <div v-if="activeProperty" class="complex-editor" :data-complex-property="activeProperty">
        <h3>{{ label(activeProperty) }}</h3>
        <template v-if="activeProperty === 'filterExpression'">
          <p v-if="columnState.error" :role="columnState.pending ? 'status' : 'alert'">{{ columnState.error }}</p>
          <p v-if="parameterCatalog.warning" role="status">{{ parameterCatalog.warning }}</p>
          <p v-if="functionCatalogError" role="alert">{{ functionCatalogError }}</p>
          <RendererFilterExpression v-if="!columnState.error" :data-view-key="definitionViewKey" data-member="currentRow" field="filterExpression"
            :columns="columnState.columns" :disabled="blocked" display="inline" :function-context="filterFunctionContext"
            :on-editing-change="filterEditingChanged" />
        </template>
        <RendererForm v-else :data-view-key="definitionViewKey" context-data-member="currentRow" :auto-columns="false"
          :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: blocked, labelPosition: 'top'}">
          <template v-if="activeProperty === 'queryConfig'">
            <RendererButton :disabled="blocked || propertyPending" data-action="toggle-query-json" :label="queryEditorMode === 'form' ? 'JSON编辑' : '返回配置表单'"
              @click="queryEditorMode = queryEditorMode === 'form' ? 'tree' : 'form'" />
            <p v-if="columnState.error" :role="columnState.pending ? 'status' : 'alert'">{{ columnState.error }}</p>
          </template>
          <template v-if="activeProperty === 'queryContext'">
            <p>当前视图的默认调用值；实际调用可以覆盖。按已配置的来源参数方式显示空间声明或来源参数，不修改参数声明和值函数映射。</p>
            <p v-if="parameterCatalog.warning" role="status">{{ parameterCatalog.warning }}</p>
            <p v-else-if="!Object.keys(parameterCatalog.schema.properties ?? {}).length" role="status">尚无已声明参数；已有调用值保留，可通过JSON编辑维护。</p>
            <RendererButton :disabled="blocked || propertyPending || !!parameterCatalog.warning" data-action="toggle-context-json"
              :label="contextEditorMode === 'properties' ? '完整JSON编辑' : '返回参数表'"
              @click="contextEditorMode = contextEditorMode === 'properties' ? 'tree' : 'properties'" />
          </template>
          <template v-if="activeProperty === 'sortExpression'">
            <p>从上到下依次排序；选中一行后可上移或下移调整优先级。只影响当前数据视图。</p>
            <p v-if="columnState.error" :role="columnState.pending ? 'status' : 'alert'">{{ columnState.error }}</p>
            <RendererButton :disabled="blocked || propertyPending" data-action="toggle-sort-json"
              :label="sortEditorMode === 'rows' ? '完整JSON编辑' : '返回排序表'"
              @click="sortEditorMode = sortEditorMode === 'rows' ? 'tree' : 'rows'" />
            <p v-if="propertyPending" role="status">请先保存或取消当前排序行，再完成本项编辑。</p>
          </template>
          <FieldJson :key="`${rowKey}:${activeProperty}`" :data-view-key="definitionViewKey" data-member="currentRow"
            :field="activeProperty" :label="label(activeProperty)" value-format="native"
            :readonly="blocked || activeProperty === 'sortExpression' && sortEditorMode === 'rows' && !!columnState.error" :height="360"
            :mode="activeProperty === 'queryConfig' ? queryEditorMode : activeProperty === 'queryContext' ? contextEditorMode : activeProperty === 'sortExpression' ? sortEditorMode : 'tree'"
            :on-editing-change="propertyEditingChanged"
            v-bind="activeProperty === 'queryConfig' ? {schema: querySchema} : activeProperty === 'queryContext' ? {schema: parameterCatalog.schema, valueLabel: '默认调用值'} : activeProperty === 'sortExpression' ? {children: sortChildren, reorderable: true} : {}"
            :empty-value="['fieldProjection', 'sortExpression'].includes(activeProperty) ? [] : activeProperty === 'valueField' ? '' : {}" />
        </RendererForm>
        <RendererButton :disabled="busy || filterPending || propertyPending" data-action="finish-view-property" label="完成本项编辑" @click="activeProperty = ''" />
      </div>
      <RendererButton button-type="danger" data-action="remove-view" :disabled="blocked || row['viewId'] === 'default' || !!activeProperty || filterPending || propertyPending"
        label="从草稿删除此视图" @click="remove" />
    </div>
    <RendererSection v-if="modelId" :data-view-key="modelViewKey" data-member="currentRow" title="旧模型请求配置" collapsible default-collapsed lazy
      :grid-columns="1" :bordered="false" data-legacy-request>
      <p>模型级默认请求请在模型工作区的「2 请求方案」页签维护。此处只读保留旧值供核对，不会自动覆盖命名视图配置。</p>
      <RendererForm :data-view-key="modelViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2">
        <FieldText v-for="field in legacyFields" :key="field.name" :field="field.name" :label="field.label" readonly />
      </RendererForm>
    </RendererSection>
    <RendererForm v-if="!state.error && !controls.destroyed" :data-view-key="controlViewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1"
      :form-props="{disabled: blocked || !!activeProperty || filterPending}" class="create-view">
      <h3>在当前模型下新增视图</h3>
      <p v-if="bindings.length > 1" role="alert">此模型存在多个历史绑定，完整视图键无法唯一定位。请核对引用后显式解除重复绑定；原配置保留。</p>
      <FieldSelect v-if="bindings.length" field="binding" label="已有模型绑定" :clearable="false" />
      <RendererButton v-if="binding && bindings.includes(binding)" button-type="danger" data-action="preview-remove-binding"
        :disabled="blocked || viewInputDirty" :label="fileResource ? '删除此文件模型…' : '解除此模型绑定'" @click="previewBindingRemoval" />
      <FieldText v-if="!binding && !bindings.length" field="newTable" label="绑定表名" placeholder="绑定表名" />
      <FieldText field="newName" label="新视图名称" placeholder="新视图名称" />
      <RendererButton data-action="add-view" :disabled="blocked || !newName || !(binding || newTable) || !!activeProperty || filterPending" label="新增视图草稿" @click="add" />
    </RendererForm>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import {buildDataViewKey, DataViewFilter, DataViewLocalQuery, DataViewQuery, RequestState, type DataViewFieldCascadeState, type DataViewFilterFunctionContext, type SparkNodeChildren} from '@spark-appworks/spark-data'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {ScenarioDefinitionResource, ScenarioViewConfig, DataSpaceReferenceLayoutResource, ProjectToolResource} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSpaceQueryAggregation} from '@spark-appworks/spark-lowcode-api'
import type {DataSpaceViewEditorProps} from './DataSpaceViewEditor.props'
import DataSpaceQueryPreview from './preview/DataSpaceQueryPreview.vue'
import {LowcodeDataSpaceFieldValue} from '@/lowcode/data-space/model-source/field-value/lowcode-data-space-field-value'

const {FieldJson, FieldNumber, FieldSelect, FieldCheckbox, FieldText, RendererButton, RendererDialog, RendererForm, RendererFilterExpression, RendererSection, RendererTabs, RendererTabPane} = SparkComponent
const props = defineProps<DataSpaceViewEditorProps>()
const emit = defineEmits<{changed: []; pending: [value: boolean]; select: [key: string | number | undefined]}>()
const busy = ref(false)
const previewOpen = ref(false)
const error = ref('')
const message = ref('')
const tick = ref(0)
const activeProperty = ref('')
const queryEditorMode = ref<'form' | 'tree'>('form')
const contextEditorMode = ref<'properties' | 'tree'>('properties')
const sortEditorMode = ref<'rows' | 'tree'>('rows')
const propertyEdits = ref(new Map<string, boolean>())
const propertyPending = computed(() => [...propertyEdits.value.values()].some(Boolean))
const projectionDialogOpen = ref(false)
const projectionFunctionContext = DataSpaceQueryAggregation.editorContext()
const projectionChildren: SparkNodeChildren = [
  {type: 'r-text', props: {field: 'viewField', label: '字段', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'label', label: '标题', readonly: true, minWidth: 140}},
  {type: 'r-checkbox', props: {field: 'output', label: '输出', width: 80}},
  {type: 'r-number', props: {field: 'group', label: '分组标记', min: 0, step: 1, width: 130}},
  {type: 'r-value-function', props: {field: 'valueFunction', label: '聚合值函数', minWidth: 240,
    functionContext: projectionFunctionContext, onDialogVisibleChange: (visible: boolean) => {projectionDialogOpen.value = visible}}},
]
const projectionAdapter = {
  read: (original: Readonly<Record<string, unknown>>) => ({...original}),
  write: (value: Readonly<Record<string, unknown>>, original: Readonly<Record<string, unknown>> | undefined) => {
    if (!original) throw new Error('查询字段必须来自本模型的正式输出，不能手工新增')
    return {...original, output: value['output'], group: value['group'], valueFunction: value['valueFunction']}
  },
  canEdit: (original: Readonly<Record<string, unknown>> | undefined) => original !== undefined,
}
function propertyEditingChanged(editing: boolean, editor = 'property'): void {
  if (editing) propertyEdits.value.set(editor, true)
  else propertyEdits.value.delete(editor)
}
const filterPending = ref(false)
const filterRevision = ref(0)
const remotePreview = ref<{text: string | null; revision: number} | null>(null)
const bindingRemoval = ref<(Parameters<DataSpaceViewEditorProps['session']['removeModelBinding']>[0] & {viewIds: string[]; references: readonly string[]}) | null>(null)
let active = true
const describeError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const view = computed(() => props.session.metadataDataSet.getView('DataViewDefinition', 'default'))
const dataSet = props.session.metadataDataSet
const bindingView = dataSet.getView('DataTableBindingDefinition', 'default')!
const readbackViews = [view.value, bindingView, dataSet.getView('DataTableBindingDefinition', 'fileModels')].filter(item => item !== undefined)
const readbackFailure = computed(() => {
  tick.value
  const failed = readbackViews.find(item => item.requestState === RequestState.Failed)
  return failed ? failed.loadingError?.message ?? '查询未完成' : ''
})
for (const item of readbackViews) item.events.on('requestStateChanged', changed)
const definitionViewKey = buildDataViewKey('DataViewDefinition', 'default', dataSet.scenarioId)
const modelViewKey = buildDataViewKey('Base_DataModel', 'default', dataSet.scenarioId)
const sourceInputMode = computed(() => {
  const config = row.value?.['queryConfig']
  return isRecord(config) && config['sourceInputMode'] === 'direct' ? 'direct' : 'mapped'
})
const parameterCatalog = computed(() => {
  props.revision; tick.value
  if (props.fileResource) {
    const parameters = props.fileResource.resourceId === DataSpaceReferenceLayoutResource.resourceId
      ? DataSpaceReferenceLayoutResource.queryParameters() : Object.values(ProjectToolResource.resources).some(id => id === props.fileResource?.resourceId)
        ? ProjectToolResource.queryParameters(props.fileResource.resourceId) : ScenarioDefinitionResource.queryParameters(props.fileResource.resourceId)
    const schema: JsonSchemaObject = {type: 'object', properties: Object.fromEntries(parameters.map(parameter =>
      [parameter.name, {description: parameter.label ?? parameter.name, 'x-typeLabel': parameter.type}])),
    required: parameters.filter(parameter => parameter.required).map(parameter => parameter.name)}
    return {schema, warning: ''}
  }
  if (!props.modelId) throw new Error('视图参数目录缺少模型身份')
  return new LowcodeDataSpaceFieldValue({dataSet: dataSet, targetId: props.session.targetId, modelId: props.modelId})
    .readQueryParameters(sourceInputMode.value)
})
const filterParameterNames = computed(() => JSON.stringify(Object.entries(parameterCatalog.value.schema.properties ?? {})
  .map(([name, schema]) => ({value: name, label: typeof schema !== 'boolean' && schema.description || name}))))
const functionCatalog = shallowRef<DataViewFilterFunctionContext>({})
const functionCatalogError = ref('')
const filterFunctionContext = computed(() => DataViewFilter.editorContext({...functionCatalog.value, inputParams: JSON.parse(filterParameterNames.value)}))
function filterEditingChanged(editing: boolean): void {filterPending.value = editing}
const legacyFields = [
  {name: 'OutputType', label: '输出类型'}, {name: 'Filter', label: '过滤条件'},
  {name: 'parentField', label: '父字段'}, {name: 'hasChildField', label: '子节点标志字段'},
  {name: 'selfType', label: '自引用输出类型'}, {name: 'topValue', label: '顶层值'},
  {name: 'cacheType', label: '缓存类型'}, {name: 'RequestComplete', label: '请求完成配置'},
]
watch(() => [props.modelId, props.revision], () => {
  if (!props.modelId) return
  const models = dataSet.getView('Base_DataModel', 'default')
  if (models && !models.destroyed && models.currentRow?.['rowid'] !== props.modelId) models.setCurrentRowById(props.modelId)
}, {immediate: true})
const ownerKey = computed(() => JSON.stringify(props.fileResource ?? {modelId: props.modelId, modelName: props.modelName}))
const controlTable = dataSet.addTable(`ViewControls_${crypto.randomUUID().replaceAll('-', '')}`,
  ['id', 'ownerKey', 'binding', 'newName', 'newTable'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
controlTable.resourceType = 'static-data'
const controls = controlTable.getOrCreateView('default')
const controlViewKey = buildDataViewKey(controlTable.tableName, controls.viewId, dataSet.scenarioId)
controls.commitMode = 'staged'
controls.replaceRows([{id: 'controls', ownerKey: ownerKey.value, binding: '', newName: '', newTable: ''}])
controls.setCurrentRowById('controls')
const bindingOptions = dataSet.addTable(`${controlTable.tableName}_bindings`,
  ['id', 'ownerKey', 'binding', 'label'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
bindingOptions.resourceType = 'static-data'
bindingOptions.getOrCreateView('default').configure({valueField: 'binding', labelField: 'label',
  queryContext: {ownerKey: ''}, filterExpression: {field: 'ownerKey', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'ownerKey'}}})
dataSet.addCascade({kind: 'field', cascadeId: bindingOptions.tableName, tableName: controlTable.tableName, viewId: 'default', targetField: 'binding',
  valueFormat: 'native', valuePolicy: {mode: 'retain'},
  parents: [{tableName: controlTable.tableName, viewId: 'default', field: 'ownerKey', parameter: 'ownerKey'}],
  optionsView: {tableName: bindingOptions.tableName, viewId: 'default'}})
function controlText(field: string): string {tick.value; const value = controls.getEditingRow('controls')?.[field]; return typeof value === 'string' ? value : ''}
const newName = computed(() => controlText('newName'))
const newTable = computed(() => controlText('newTable'))
const binding = computed(() => controlText('binding'))
controls.events.on('editingFieldChanged', () => {if (active) changed()})
function setControl(field: string, value: string): void {
  if (controls.getEditingRow('controls')?.[field] !== value) controls.updateEditingValue('controls', field, value)
}
function clearCreation(): void {setControl('newName', ''); setControl('newTable', '')}
function definitionChanged(): void {
  if (!active) return
  error.value = ''; message.value = ''; remotePreview.value = null; changed()
}
view.value?.events.on('editingFieldChanged', definitionChanged)
let unsubscribeFields: (() => void) | undefined
watch(() => props.session, session => {
  unsubscribeFields?.()
  unsubscribeFields = session.metadataDataSet.onFieldCascadeChange(address => {
    if (address.tableName === 'DataViewDefinition') tick.value++
  })
}, {immediate: true})
function fieldState(field: string): DataViewFieldCascadeState {
  tick.value
  try {return props.session.metadataDataSet.getFieldCascadeState({tableName: 'DataViewDefinition', viewId: 'default', field})}
  catch (cause) {return {status: 'error', options: [], valueStatus: 'unverified', error: describeError(cause)}}
}
const state = computed(() => {
  props.revision; tick.value
  try {return {file: props.session.viewState, error: ''}} catch (cause) {return {file: null, error: describeError(cause)}}
})
function ownsRow(candidate: Record<string, unknown>): boolean {
  return candidate['dataSetId'] === props.session.targetId && (props.fileResource
    ? candidate['tableName'] === props.fileResource.tableName && candidate['dataModelId'] === undefined && candidate['dataModelName'] === undefined
    : !!props.modelId && candidate['dataModelId'] === props.modelId && candidate['dataModelName'] === props.modelName)
}
const row = computed(() => {
  props.revision; tick.value
  if (props.rowKey === undefined) return undefined
  const candidate = view.value?.getEditingRow(props.rowKey)
  return candidate && ownsRow(candidate) ? candidate : undefined
})
const properties = computed(() => (view.value?.columns ?? []).filter(column => !['onRequestComplete', 'aggregates'].includes(column.name) && ScenarioViewConfig.isViewProperty(column.name)))
const requestProperties = new Set(['fieldProjection', 'queryContext', 'queryConfig', 'filterExpression', 'sortExpression', 'page', 'pageSize', 'autoLoad'])
const propertyGroups = computed(() => [
  {title: '请求设置', request: true, properties: properties.value.filter(column => requestProperties.has(column.name))},
  {title: '结果组织与编辑', request: false, properties: properties.value.filter(column => !requestProperties.has(column.name))},
])
const availableViews = computed(() => {
  props.revision; tick.value
  return (view.value?.rows ?? []).flatMap(item => {
    const key = view.value?.getPkKey(item)
    if (key === undefined || !ownsRow(item)) return []
    return [{key: String(key), label: `${String(item['tableName'])} @ ${String(item['viewId'])}`}]
  })
})
function selectExistingView(key: string | number): void {
  if (blocked.value || localDirty.value || !availableViews.value.some(item => item.key === String(key))) return
  emit('select', key)
}
watch(() => [props.session, props.rowKey, props.revision], () => {
  if (!row.value || props.rowKey === undefined) return
  if (!view.value?.currentRow || view.value.getPkKey(view.value.currentRow) !== props.rowKey) view.value?.setCurrentRowById(props.rowKey)
}, {immediate: true, flush: 'sync'})
const viewInputDirty = computed(() => {
  props.revision; tick.value
  return !!newName.value || !!newTable.value || !!activeProperty.value || filterPending.value || propertyPending.value || projectionDialogOpen.value || view.value?.hasEditingChanges() === true
    || view.value?.dirtyTracking.hasPendingChanges() === true
})
const localDirty = computed(() => {tick.value; props.revision; return viewInputDirty.value || bindingView.dirtyTracking.hasPendingChanges() || bindingView.hasEditingChanges()})
const definitionDirty = computed(() => localDirty.value || state.value.file?.dirty === true)
const blocked = computed(() => busy.value || props.disabled === true || !!state.value.error || !!bindingRemoval.value
  || state.value.file !== null && state.value.file.saveStatus !== 'idle')
// 共享文件可能由来源/改名命令提交；不能冒充本编辑器草稿而阻断原命令恢复。
watch(() => busy.value || localDirty.value || !!bindingRemoval.value, value => emit('pending', value), {immediate: true, flush: 'sync'})
const bindings = computed(() => {
  props.revision; tick.value
  const tables = state.value.file?.config['tables']
  return isRecord(tables) ? Object.entries(tables).filter(([name, table]) => isRecord(table) && (props.fileResource
    ? name === props.fileResource.tableName && table['resourceType'] === 'file' && table['resourceId'] === props.fileResource.resourceId && table['modelBinding'] === undefined
    : isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === props.modelId && table['modelBinding']['modelName'] === props.modelName))
    .map(([name]) => name).filter(name => bindingView.rows.some(item => item['tableName'] === name)) : []
})
watch(() => [ownerKey.value, props.rowKey], () => {
  const table = row.value?.['tableName']
  setControl('ownerKey', ownerKey.value)
  setControl('binding', typeof table === 'string' ? table : bindings.value.length === 1 ? bindings.value[0]! : '')
  error.value = ''; message.value = ''; remotePreview.value = null
}, {immediate: true})
watch(() => JSON.stringify([ownerKey.value, ...bindings.value]), () => {
  if (dataSet.destroyed) return
  bindingOptions.rows = bindings.value.map(name => ({id: name, ownerKey: ownerKey.value, binding: name, label: name}))
  const options = bindingOptions.getOrCreateView('default')
  options.replaceRows([])
  options.configure({queryContext: {ownerKey: ''}})
}, {immediate: true})
const fieldSelection = computed(() => {
  const tableName = row.value?.['tableName'], viewId = row.value?.['viewId']
  return typeof tableName === 'string' && typeof viewId === 'string'
    ? props.fileResource ? {tableName, viewId, fileResourceId: props.fileResource.resourceId}
      : props.modelId && props.modelName ? {tableName, viewId, modelId: props.modelId, modelName: props.modelName} : undefined : undefined
})
let functionAttempt = 0
watch(() => {
  props.revision; tick.value
  return JSON.stringify([fieldSelection.value, state.value.file?.text])
}, () => {
  const selection = fieldSelection.value, attempt = ++functionAttempt
  functionCatalog.value = {}; functionCatalogError.value = ''
  if (!selection) return
  void props.session.loadViewFilterContext(selection).then(context => {
    if (active && attempt === functionAttempt) functionCatalog.value = context
  }).catch(cause => {
    if (active && attempt === functionAttempt) functionCatalogError.value = describeError(cause)
  })
}, {immediate: true})
const fieldsLoading = ref(false), fieldsError = ref('')
let fieldAttempt = 0
async function loadFields(): Promise<void> {
  const selection = fieldSelection.value, session = props.session, attempt = ++fieldAttempt
  if (!selection) return
  fieldsLoading.value = true; fieldsError.value = ''
  try {await session.loadViewFields(selection)}
  catch (cause) {if (active && attempt === fieldAttempt) fieldsError.value = describeError(cause); throw cause}
  finally {if (active && attempt === fieldAttempt) {fieldsLoading.value = false; tick.value++}}
}
const columnState = computed(() => {
  props.revision; tick.value
  try {
    const columns = fieldSelection.value && props.session.getViewFields(fieldSelection.value)
    if (!columns) return {columns: [], pending: fieldsLoading.value,
      error: fieldsError.value || (fieldsLoading.value ? '正在读取当前模型字段…' : '当前模型字段尚未读取，请按需加载字段。')}
    return {columns, pending: false, error: ''}
  } catch (cause) {return {columns: [], pending: false, error: describeError(cause)}}
})
watch(() => {
  props.revision; tick.value
  try {
    return fieldSelection.value && props.session.getViewFields(fieldSelection.value) === null
      ? JSON.stringify([fieldSelection.value, state.value.file?.text, row.value?.['fieldProjection'], row.value?.['treeConfig'], row.value?.['queryConfig']]) : ''
  } catch {return ''}
}, key => {if (key) void loadFields().catch(() => {}); else fieldAttempt++}, {immediate: true})
// 仅声明呈现；原生查询校验、字段身份和保存仍由DataView/ScenarioViewConfig处理。
const sortChildren = computed<SparkNodeChildren>(() => [
  {type: 'r-select', props: {field: 'field', label: '字段', filterable: true, clearable: false,
    options: columnState.value.columns.filter(column => !column.isComputed && !column.computeExpression && column.name !== '_pk')
      .map(column => ({value: column.name, label: column.label ? `${column.label}（${column.name}）` : column.name}))}},
  {type: 'r-select', props: {field: 'direction', label: '方向', clearable: false,
    options: [{value: 'asc', label: '升序'}, {value: 'desc', label: '降序'}]}},
])
const querySchema = computed<JsonSchemaObject>(() => {
  const fieldChoices = columnState.value.columns.filter(column => !column.isComputed && !column.computeExpression && column.name !== '_pk').map(column => ({const: column.name, title: column.label || column.name}))
  const field = (title: string): JsonSchemaObject => ({title, type: 'string', oneOf: fieldChoices})
  return {type: 'object', properties: {
    outputType: {title: '输出类型', type: 'string', oneOf: (props.fileResource ? DataViewLocalQuery.outputTypes : DataViewQuery.outputTypes).map(item => ({const: item.value, title: item.label}))},
    allPages: {title: '读取完整集合', type: 'boolean', description: '省略时沿用默认查询；自引用结果不分页。'},
    maxRows: {title: '完整集合上限（行）', type: 'integer', minimum: 1},
    autoQuery: {title: '过滤输入变化后立即查询', type: 'boolean'},
    ...(!props.fileResource ? {cacheType: {title: '缓存类型', type: 'string', oneOf: [
      {const: 'page', title: '页面缓存'}, {const: 'browser', title: '浏览器缓存'}, {const: 'none', title: '不设置'},
    ], description: '页面缓存随本次页面释放；浏览器缓存仅当前会话内复用，刷新浏览器、退出或切换身份清除。显式刷新和保存清除结果。'}} : {}),
    ...(!props.fileResource ? {tree: {title: '自引用参数', type: 'object', description: '配置后仅适用于自引用查询；不改变本地树展示配置。',
      properties: {keyField: field('节点主键字段'), parentField: field('父字段'), hasChildrenField: field('子节点标志字段'),
        nodeId: {title: '起始节点值', type: 'string'}, mode: {title: '自引用输出类型', type: 'string', oneOf: DataViewQuery.treeModes.map(item => ({const: item.value, title: item.label}))}}},
    sourceInputMode: {title: '来源参数方式', type: 'string', oneOf: [{const: 'mapped', title: '按已配置映射'}, {const: 'direct', title: '直接传入'}]}} : {}),
    fields: {title: '请求字段列表', type: 'array', items: {type: 'string', oneOf: fieldChoices}, description: '选择正式输出字段，至少一项；移除配置沿用默认输出。身份及依赖字段由查询适配器补齐。'},
    filterLookups: {title: '辅助过滤视图', type: 'array', description: '将文本条件转为辅助视图的值集合，不是输出字段选择；按完整视图绑定配置，使用JSON数组。'},
  }}
})
const requestSections = computed(() => {
  const properties = querySchema.value.properties ?? {}
  const subset = (names: string[], radio: string[] = []): JsonSchemaObject => ({type: 'object', properties: Object.fromEntries(names.map(name => {
    const definition = properties[name]
    return [name, radio.includes(name) && typeof definition === 'object' ? {...definition, 'x-control': 'radio'} : definition ?? {}]
  }))})
  return [
    {title: '视图查询参数', filter: true, schema: subset(['outputType'], ['outputType'])},
    {title: '调用参数', parameters: true, filter: false, schema: subset(props.fileResource ? [] : ['sourceInputMode'], ['sourceInputMode'])},
    ...(!props.fileResource ? [{title: '自引用参数', filter: false, schema: subset(['tree'])}] : []),
    {title: '结果读取', filter: false, schema: subset(['allPages', 'maxRows', 'autoQuery'], ['allPages', 'autoQuery'])},
    ...(!props.fileResource ? [{title: '结果缓存', filter: false, schema: subset(['cacheType'], ['cacheType'])}] : []),
  ]
})
function label(name: string): string {
  const labels: Record<string, string> = {fieldProjection: '字段投影', queryContext: '查询参数', queryConfig: '查询模式与范围', filterExpression: '过滤条件',
    sortExpression: '排序', autoCurrentFirst: '自动定位首行', autoSelectFirst: '自动选中首行', page: '初始页码', pageSize: '每页条数',
    treeConfig: '树配置', valueField: '取值字段', labelField: '显示字段', selectionDelimiter: '选中值分隔符', autoLoad: '自动加载',
    commitMode: '提交方式'}
  return labels[name] ?? name
}
function changed(): void {tick.value++; emit('changed')}
async function initializeQueryOutput(): Promise<void> {
  if (blocked.value || filterPending.value || props.fileResource || row.value?.['fieldProjection'] !== undefined) return
  const selection = fieldSelection.value, key = props.rowKey, session = props.session
  if (!selection || key === undefined) return
  await run(async () => {
    await session.loadViewFields(selection)
    if (!active || props.session !== session || props.rowKey !== key || row.value?.['tableName'] !== selection.tableName
      || row.value?.['viewId'] !== selection.viewId || row.value?.['fieldProjection'] !== undefined) return
    const projection = session.getViewOutputProjection(selection)
    if (!projection?.length) throw new Error('当前模型没有可配置的正式输出字段')
    view.value?.updateEditingValue(key, 'fieldProjection', projection)
  })
}
async function editProperty(name: string): Promise<void> {
  if (blocked.value || activeProperty.value || filterPending.value || propertyPending.value) return
  if (!['sortExpression', 'filterExpression', 'queryConfig', 'queryContext'].includes(name)) {activeProperty.value = name; return}
  const open = () => {
    if (!active) return
    if (name === 'sortExpression') sortEditorMode.value = 'rows'
    else if (name === 'queryContext') contextEditorMode.value = parameterCatalog.value.warning ? 'tree' : 'properties'
    else queryEditorMode.value = 'form'
    activeProperty.value = name
  }
  const needsLoad = name === 'queryContext'
    ? sourceInputMode.value === 'direct' && !!props.modelId && !!parameterCatalog.value.warning
    : !!columnState.value.error
  if (!needsLoad) {
    error.value = ''; message.value = ''; open()
    return
  }
  await run(async () => {
    if (name === 'queryContext') {
      if (sourceInputMode.value === 'direct' && props.modelId) {
        await props.session.loadSourceInputFields(props.modelId)
        const parameters = new LowcodeDataSpaceFieldValue({dataSet: dataSet, targetId: props.session.targetId, modelId: props.modelId}).readQueryParameters('direct')
        if (parameters.warning) throw new Error(parameters.warning)
      }
      tick.value++
    } else await loadFields()
    open()
  })
}
function change(field: string, value: unknown): void {
  if (blocked.value || propertyPending.value || !row.value || props.rowKey === undefined || !ScenarioViewConfig.isViewProperty(field)) return
  try {
    props.session.viewState
    view.value?.updateEditingValue(props.rowKey, field, value)
    error.value = ''; message.value = ''; remotePreview.value = null; changed()
  } catch (cause) {error.value = describeError(cause)}
}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || props.disabled || propertyPending.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {await action()} catch (cause) {if (active) error.value = describeError(cause)}
  finally {if (active) {busy.value = false; changed()}}
}
async function commitDefinitions(successMessage: string): Promise<void> {
  const bindingChanged = bindingView.hasEditingChanges() || bindingView.dirtyTracking.hasPendingChanges()
  const saved = await dataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}, {tableName: 'DataTableBindingDefinition', viewId: 'default'}]})
  if (!saved.success) throw new Error(saved.message)
  // 属性修改已由原生保存回执接纳；结构变化还须读取隐式新增的默认视图及绑定投影。
  const structureChanged = bindingChanged || (saved.data?.createdCount ?? 0) > 0 || (saved.data?.deletedCount ?? 0) > 0
  if (structureChanged) await readbackDefinitions()
  if (active) message.value = localDirty.value ? '本轮保存已确认，仍有修改待保存'
    : readbackViews.some(item => item.refreshPending) ? '配置已保存，目录将在当前修改或操作结束后更新' : successMessage
}
async function readbackDefinitions(): Promise<void> {
  const results = await Promise.all(readbackViews.map(item => item.requestRefresh()))
  const failure = results.find(result => !result.success)
  if (failure) throw new Error(`保存已确认，目录回读未完成：${failure.message ?? '查询失败'}`)
}
async function retryReadback(): Promise<void> {
  return run(async () => {
    await readbackDefinitions()
    if (active) message.value = readbackViews.some(item => item.refreshPending) ? '目录将在当前修改或操作结束后更新' : '视图目录已更新'
  })
}
async function save(): Promise<void> {
  if (blocked.value || activeProperty.value || filterPending.value || propertyPending.value || projectionDialogOpen.value || newName.value || newTable.value) return
  return run(() => commitDefinitions('视图配置已保存并回读确认'))
}
function discard(): void {
  if (blocked.value) return
  try {
    props.session.viewState
    if (props.rowKey !== undefined && view.value?.dirtyTracking.isPendingCreate(props.rowKey)) emit('select', undefined)
    view.value?.discardPendingChanges()
    bindingView.discardPendingChanges()
    clearCreation(); activeProperty.value = ''; filterRevision.value++; filterPending.value = false; propertyEdits.value.clear(); remotePreview.value = null
    error.value = ''; message.value = '视图与绑定的未提交修改已取消'; changed()
  } catch (cause) {error.value = describeError(cause)}
}
async function verify(): Promise<void> {
  return run(() => commitDefinitions('已核验并确认保存结果'))
}
async function previewRemote(): Promise<void> {
  return run(async () => {
    const revision = props.session.viewState?.revision
    const text = await props.session.previewRemoteViews()
    if (active && revision !== undefined) remotePreview.value = {text, revision}
  })
}
async function adoptRemote(): Promise<void> {
  const preview = remotePreview.value
  if (!preview) return
  return run(async () => {
    if (props.session.viewState?.revision !== preview.revision) throw new Error('配置已变化，请重新查看远端')
    await props.session.adoptViews({expectedRevision: preview.revision, previewText: preview.text,
      discardViews: [{tableName: 'DataViewDefinition', viewId: 'default'}, {tableName: 'DataTableBindingDefinition', viewId: 'default'}]})
    if (active) {clearCreation(); activeProperty.value = ''; remotePreview.value = null; emit('select', undefined)}
  })
}
async function add(): Promise<void> {
  if (blocked.value || activeProperty.value || filterPending.value) return
  return run(async () => {
    const tableName = binding.value || newTable.value
    const viewId = newName.value
    if (!viewId.trim() || viewId.trim() !== viewId || viewId.includes('@') || viewId.startsWith('#')) throw new Error('视图名称无效')
    const session = props.session
    const state = session.viewState
    const tables = state?.config['tables']
    if (bindings.value.length && !bindings.value.includes(binding.value)) throw new Error('请选择已有模型绑定，在其中新增视图')
    if (!binding.value && isRecord(tables) && Object.hasOwn(tables, tableName)) throw new Error('绑定表名已存在，请选择已有绑定或使用新名称')
    if (view.value?.rows.some(item => item['tableName'] === tableName && item['viewId'] === viewId)) throw new Error('模型绑定内已有同名视图')
    if (props.fileResource ? tableName !== props.fileResource.tableName || !bindings.value.includes(tableName) : !props.modelId || !props.modelName) throw new Error('当前模型身份无法确认')
    await view.value?.addRow({dataSetId: session.targetId, ...props.fileResource ? {} : {dataModelId: props.modelId, dataModelName: props.modelName}, tableName, viewId})
    if (!active) return
    const added = view.value?.rows.find(item => item['tableName'] === tableName && item['viewId'] === viewId)
    const key = added && view.value?.getPkKey(added)
    clearCreation(); setControl('binding', tableName); emit('select', key)
  })
}
async function remove(): Promise<void> {
  if (blocked.value || activeProperty.value || filterPending.value || !row.value || row.value['viewId'] === 'default' || props.rowKey === undefined) return
  const key = props.rowKey
  return run(async () => {emit('select', undefined); await view.value?.removeRow(key)})
}
async function previewBindingRemoval(): Promise<void> {
  if (blocked.value || viewInputDirty.value || !bindings.value.includes(binding.value)) return
  const file = state.value.file, tables = file?.config['tables']
  const table = isRecord(tables) ? tables[binding.value] : undefined
  const views = isRecord(table) ? table['views'] : undefined
  if (!file || !isRecord(views)) return
  const viewIds = Object.keys(views)
  const identity = props.fileResource ? {resourceId: props.fileResource.resourceId}
    : props.modelId && props.modelName ? {modelId: props.modelId, modelName: props.modelName} : undefined
  if (!identity) return
  return run(async () => {
    const config = new ScenarioViewConfig(props.session.targetId, file.text)
    bindingRemoval.value = {tableName: binding.value, ...identity, expectedText: file.text,
      viewIds, references: config.getTableRemovalReferences(binding.value)}
    remotePreview.value = null
  })
}
async function confirmBindingRemoval(): Promise<void> {
  const preview = bindingRemoval.value
  if (!preview || busy.value || props.disabled) return
  return run(async () => {
    emit('select', undefined)
    await props.session.removeModelBinding(preview)
    if (!active) return
    bindingRemoval.value = null; clearCreation(); setControl('binding', '')
    message.value = `已记录解除绑定 ${preview.tableName}；${props.fileResource ? '文件资源内容' : '数据库模型与字段'}保留，请保存视图配置。`
  })
}
defineExpose({previewBindingRemoval})
onBeforeUnmount(() => {
  active = false; unsubscribeFields?.(); view.value?.events.off('editingFieldChanged', definitionChanged); emit('pending', false)
  for (const item of readbackViews) item.events.off('requestStateChanged', changed)
  if (dataSet.destroyed) return
  dataSet.removeCascade({cascadeId: bindingOptions.tableName})
  dataSet.removeTable(bindingOptions.tableName); dataSet.removeTable(controlTable.tableName)
})
</script>

<style scoped>
.view-editor {border-top: 1px solid var(--el-border-color); padding-top: 1rem; margin-top: 1rem;}
.actions,.create-view {display:flex; gap:.5rem; flex-wrap:wrap; margin:1rem 0;}
.create-view h3 {width:100%;}.create-view .el-input,.create-view .el-select {max-width:16rem;}
.property {display:grid; grid-template-columns:8rem minmax(0,1fr) auto; align-items:center; gap:.7rem; margin:.7rem 0; width:100%;}
.property-name {display:flex; flex-direction:column; color:var(--el-text-color-secondary);}.complex-value {min-width:0;}code {overflow-wrap:anywhere;}
.complex-editor,.remote-preview {border:1px solid var(--el-border-color); padding:1rem; margin:1rem 0;}
pre {max-height:20rem; overflow:auto;}[role="alert"] {color:var(--el-color-danger); white-space:pre-wrap;}
@media(max-width:760px) {.property {grid-template-columns:1fr;}}
</style>
