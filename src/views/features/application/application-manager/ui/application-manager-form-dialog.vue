<!--
@module app:views/features/application/application-manager/ui/application-manager-form-dialog
职责：新增或编辑应用系统：名称、简称、负责人、站点运行地址、状态、租户门户、项目/SAAS/小程序开关、图标、小程序地址与图片、描述、默认数据库。
边界：主表字段绑定 Base_AppSystemList@form 固定行，负责人经负责人视图当前行读写，默认数据库写入关联视图待新增行；保存由应用记录分阶段编排。
租户门户即企业默认应用（ent_config），仅编辑时按其写权限呈现，在应用保存确认后单独保存。小程序图片上传区未获批，只读展示原值。
-->
<template>
  <RendererDialog :model-value="true" :title="record.created ? '新增应用系统' : '编辑应用系统'" width="min(980px, 94vw)"
    :append-to-body="true" :close-disabled="busy" @update:model-value="cancel">
    <p v-if="message" role="alert">{{ message }}</p>
    <RendererForm :data-view-key="mainKey" :context-row-id="record.appId" :children="children" :auto-columns="false"
      :show-data-view-meta="false" :grid-gap="16" :form-props="{labelPosition: 'top'}" />
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="cancel" />
      <RendererButton label="保存" button-type="primary" :disabled="busy" @click="submit" />
    </template>
  </RendererDialog>
  <ApplicationDatabaseDialog v-if="choosing" @close="choosing = false" @choose="chooseDatabase" />
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, RendererButton, RendererDialog, RendererForm, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import type {EnterpriseDefaultApplication} from '@/services/project/enterprise-landing'
import {APPLICATION_MANAGER_SCENARIO, PERSON_SCENARIO, type ApplicationManagerRecord} from '../model/application-manager-model'
import ApplicationDatabaseDialog from './application-database-dialog.vue'

const {sparkConsume} = useSparkComponent({type: 'application-manager-form-dialog'})
const pageService = consumeRequiredPageService(sparkConsume, 'application-manager-form-dialog')
const props = defineProps<{record: ApplicationManagerRecord; portal: EnterpriseDefaultApplication | null}>()
const emit = defineEmits<{close: []; saved: []}>()
const mainKey = buildDataViewKey('Base_AppSystemList', 'form', APPLICATION_MANAGER_SCENARIO)
const ownerKey = buildDataViewKey('Base_MainBody_RoleUser', 'default', APPLICATION_MANAGER_SCENARIO)
const statusKey = buildDataViewKey('应用系统状态', 'default', APPLICATION_MANAGER_SCENARIO)
const userKey = buildDataViewKey('Base_UserInfo', 'default', PERSON_SCENARIO)
const busy = ref(false), choosing = ref(false), message = ref(''), revision = ref(0)
const portalInitial = !props.record.created && props.portal?.applicationId === props.record.appId
const portalChecked = ref(portalInitial)
const portalEditable = !props.record.created && Boolean(props.portal?.writable)

const HALF = 12, FULL = 24
const text = (field: string, label: string, extra: Record<string, unknown> = {}): SparkNode =>
  ({type: 'r-text', props: {field, label, colSpan: HALF, ...extra}})
const switcher = (field: string, label: string): SparkNode => ({type: 'r-switch', props: {field, label, colSpan: HALF}})
const children = computed<SparkNode[]>(() => {
  revision.value
  const nodes: SparkNode[] = [
    text('AppName', '应用系统名称', {maxlength: 100}),
    text('AppDesc', '应用系统简称', {maxlength: 100}),
    {type: 'r-user-picker', props: {field: 'UserIdField', label: '负责人', dataViewKey: ownerKey, placeholder: '请选择负责人',
      optionDataViewKey: userKey, optionLabelField: 'UserName', optionValueField: 'rowid', multiple: false, colSpan: HALF}},
    text('WebUrl', '站点运行地址', {maxlength: 512, placeholder: '例如 /products/example/'}),
    {type: 'r-select', props: {field: 'AppType', label: '应用系统状态', placeholder: '请选择状态', optionDataViewKey: statusKey,
      optionValueField: 'val', optionLabelField: 'txt', colSpan: HALF}},
  ]
  if (!props.record.created) {
    nodes.push({type: 'r-switch', props: {label: '租户门户', modelValue: portalChecked.value, disabled: busy.value || !portalEditable,
      colSpan: HALF, 'onUpdate:modelValue': (value: boolean | null) => { portalChecked.value = value === true }}})
  }
  nodes.push(
    switcher('IsProjectRelation', '是否软件项目'), switcher('isSass', '是否 SAAS 应用'), switcher('isWeChat', '是否为微信小程序'),
    {type: 'r-icon', props: {field: 'Icon', label: '系统图标', placeholder: '请选择系统图标', colSpan: HALF}},
    text('WeChatUrl', '微信小程序地址', {maxlength: 255}),
    {type: 'r-image', props: {field: 'WeChartimg', label: '微信小程序图片', action: '#', accept: 'image/*', colSpan: FULL}},
    {type: 'r-textarea', props: {field: 'Memo', label: '系统描述', maxlength: 500, rows: 4, showWordLimit: true, colSpan: FULL}},
    {type: 'r-text', props: {label: '默认数据库', modelValue: props.record.databaseSummary, readonly: true, colSpan: 20,
      emptyText: props.record.created ? '请选择默认数据库' : '未配置默认数据库'}},
    {type: 'r-button', props: {label: '选择', disabled: busy.value || !props.record.created, colSpan: 4,
      onClick: () => { choosing.value = true }}},
  )
  return nodes
})

const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

async function chooseDatabase(row: Readonly<DataRow>): Promise<void> {
  try {
    await props.record.chooseDatabase(row)
    choosing.value = false
    revision.value++
  } catch (cause) { message.value = failure(cause) }
}

function cancel(): void {
  if (busy.value) return
  props.record.cancel()
  emit('close')
}

async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {
    const outcome = await props.record.save()
    if (!outcome.success) {
      message.value = outcome.message
      if (outcome.mainSaved) emit('saved')
      return
    }
    if (portalEditable && props.portal && portalChecked.value !== portalInitial) {
      try { await props.portal.save(portalChecked.value ? props.record.appId : null) } catch (cause) {
        message.value = `应用已保存，租户门户未确认：${failure(cause)}`
        emit('saved')
        return
      }
    }
    pageService.showMessage(outcome.message, 'success')
    emit('saved')
    emit('close')
  } finally { busy.value = false; revision.value++ }
}
</script>
