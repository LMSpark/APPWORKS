<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-desktop-dialog
职责：“新增桌面”对话框与“取消桌面显示”确认框。
边界：向子组件提供桌面独立 PageRuntime；字段绑定 Base_Desktop_System@byNode 当前新增行，字典字段消费同运行时字典视图；
  只有显式“确定”才删除，结果未知时不能关闭或放弃。
AI用途：调整桌面字段分组或标签时只改 SECTIONS。
-->
<template>
  <RendererDialog v-if="desktop.dialogOpen.value && viewKey && layout" :model-value="true" title="新增桌面" width="900px"
    :append-to-body="true" :close-disabled="desktop.busy.value || desktop.unknown.value" @update:model-value="desktop.cancelCreate">
    <DisplayAlert v-for="warning in layout.warnings" :key="warning" :description="warning" alert-type="warning" />
    <DisplayAlert v-if="desktop.dialogError.value" :description="desktop.dialogError.value" alert-type="error" />
    <RendererForm :data-view-key="viewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="2" label-width="110px">
      <template v-for="section in sections" :key="section.title">
        <RendererDivider class="blueprint-desktop__divider" content-position="left" :content="section.title" />
        <template v-for="spec in section.fields" :key="spec.column">
          <FieldNumber v-if="spec.kind === 'number'" :data-view-key="viewKey" data-member="currentRow" :data-field="spec.column" :label="spec.label" :min="0" />
          <FieldCheckbox v-else-if="spec.kind === 'flag'" :data-view-key="viewKey" data-member="currentRow" :data-field="spec.column" :label="spec.label"
            :checkbox-text="spec.label" :true-value="flag(spec.field, true)" :false-value="flag(spec.field, false)" />
          <FieldSelect v-else-if="spec.option" :data-view-key="viewKey" data-member="currentRow" :data-field="spec.column" :label="spec.label"
            :option-data-view-key="spec.option.viewKey" :option-value-field="spec.option.valueField" :option-label-field="spec.option.labelField" :clearable="true" />
          <FieldText v-else :data-view-key="viewKey" data-member="currentRow" :data-field="spec.column" :label="spec.label" />
        </template>
      </template>
    </RendererForm>
    <template #footer>
      <RendererButton label="取消" :disabled="desktop.busy.value || desktop.unknown.value" @click="desktop.cancelCreate()" />
      <RendererButton :label="desktop.unknown.value ? '核验保存结果' : '保存'" button-type="primary" :loading="desktop.busy.value" @click="desktop.saveCreate" />
    </template>
  </RendererDialog>

  <RendererDialog v-if="desktop.confirmOpen.value" :model-value="true" title="取消桌面显示" width="420px" :append-to-body="true"
    :close-disabled="desktop.busy.value || desktop.unknown.value" @update:model-value="desktop.cancelRemove">
    <DisplayAlert description="确定要取消当前节点的桌面显示吗？" alert-type="warning" />
    <DisplayAlert v-if="desktop.dialogError.value" :description="desktop.dialogError.value" alert-type="error" />
    <template #footer>
      <RendererButton label="取消" :disabled="desktop.busy.value || desktop.unknown.value" @click="desktop.cancelRemove()" />
      <RendererButton :label="desktop.unknown.value ? '核验删除结果' : '确定'" button-type="danger" :loading="desktop.busy.value" @click="desktop.confirmRemove" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {useBlueprintDesktop} from './use-blueprint-desktop'

const {DisplayAlert, FieldCheckbox, FieldNumber, FieldSelect, FieldText, PAGE_RUNTIME, RendererButton, RendererDialog, RendererDivider, RendererForm, useSparkComponent} = SparkComponent
const props = defineProps<{desktop: ReturnType<typeof useBlueprintDesktop>}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'blueprint-desktop-dialog'})
watch(() => props.desktop.runtime.value, runtime => {
  if (runtime) sparkProvide(PAGE_RUNTIME, runtime)
  else sparkRemove(PAGE_RUNTIME)
}, {immediate: true, flush: 'sync'})

type FieldKind = 'text' | 'number' | 'flag'
const SECTIONS: ReadonlyArray<Readonly<{title: string; fields: ReadonlyArray<readonly [string, string, FieldKind]>}>> = Object.freeze([
  {title: '系统基本信息', fields: [['AppName', '名称', 'text'], ['ShortCNName', '中文简称', 'text'], ['AppOrdidx', '排序', 'number'],
    ['AppUrl', 'PC端地址', 'text'], ['MobileUrl', '移动端地址', 'text']]},
  {title: '系统属性', fields: [['AppPopupMode', '弹出方式', 'text'], ['AppType', '分类', 'text'], ['IsDesktopShow', '是否显示', 'flag'],
    ['IsReqLogin', '是否需要验证', 'flag']]},
  {title: '系统图标设置', fields: [['AppSmallIconUrl', '图标', 'text'], ['BgColor', '背景颜色', 'text'], ['FontColor', '字体颜色', 'text'],
    ['IconStyle', '图标风格', 'text']]},
])
const viewKey = computed(() => props.desktop.viewKey.value)
const layout = computed(() => props.desktop.layout.value)
const sections = computed(() => {
  const current = layout.value
  if (!current) return []
  return SECTIONS.map(section => ({title: section.title, fields: section.fields.flatMap(([field, label, kind]) => {
    const column = current.fields[field]
    if (!column) return []
    const option = current.options[field]
    return [{field, column, label, kind, option: option ? {...option, viewKey: props.desktop.optionViewKey(option.tableName)} : undefined}]
  })})).filter(section => section.fields.length > 0)
})
function flag(field: string, on: boolean): boolean | number | string {
  return props.desktop.record.value?.flag(field, on) ?? (on ? 1 : 0)
}
</script>

<style scoped>
.blueprint-desktop__divider {grid-column: 1 / -1}
</style>
