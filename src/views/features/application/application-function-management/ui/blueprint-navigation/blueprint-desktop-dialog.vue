<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-desktop-dialog
职责：“新增桌面”对话框与“取消桌面显示”确认框。
边界：字段绑定页面运行时中 7AB 场景 Base_Desktop_System@byNode 的当前新增行；弹出方式、分类与图标风格消费数据字典场景的命名视图；
  字段可读、可写由正式查询的字段权限决定；只有显式“确定”才删除，结果未知时不能关闭或放弃。
AI用途：调整桌面字段分组或标签时只改模板。
-->
<template>
  <RendererDialog v-if="desktop.dialogOpen.value && viewKey" :model-value="true" title="新增桌面" width="900px"
    :append-to-body="true" :close-disabled="desktop.busy.value || desktop.unknown.value" @update:model-value="desktop.cancelCreate">
    <DisplayAlert v-if="desktop.dialogError.value" :description="desktop.dialogError.value" alert-type="error" />
    <RendererForm :data-view-key="viewKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="2" label-width="110px">
      <RendererDivider class="blueprint-desktop__divider" content-position="left" content="系统基本信息" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="AppName" label="名称" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="ShortCNName" label="中文简称" />
      <FieldNumber :data-view-key="viewKey" data-member="currentRow" data-field="AppOrdidx" label="排序" :min="0" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="AppUrl" label="PC端地址" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="MobileUrl" label="移动端地址" />
      <RendererDivider class="blueprint-desktop__divider" content-position="left" content="系统属性" />
      <FieldSelect :data-view-key="viewKey" data-member="currentRow" data-field="AppPopupMode" label="弹出方式" :option-data-view-key="dictionary('Dict_Page_Popup')" :clearable="true" />
      <FieldSelect :data-view-key="viewKey" data-member="currentRow" data-field="AppType" label="分类" :option-data-view-key="dictionary('Dict_Desktop_AppType')" :clearable="true" />
      <FieldCheckbox :data-view-key="viewKey" data-member="currentRow" data-field="IsDesktopShow" label="是否显示" checkbox-text="是否显示" :true-value="1" :false-value="0" />
      <FieldCheckbox :data-view-key="viewKey" data-member="currentRow" data-field="IsReqLogin" label="是否需要验证" checkbox-text="是否需要验证" :true-value="1" :false-value="0" />
      <RendererDivider class="blueprint-desktop__divider" content-position="left" content="系统图标设置" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="AppSmallIconUrl" label="图标" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="BgColor" label="背景颜色" />
      <FieldText :data-view-key="viewKey" data-member="currentRow" data-field="FontColor" label="字体颜色" />
      <FieldSelect :data-view-key="viewKey" data-member="currentRow" data-field="IconStyle" label="图标风格" :option-data-view-key="dictionary('DesktopStyle')" :clearable="true" />
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
import {computed} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import type {useBlueprintDesktop} from './use-blueprint-desktop'

const {DisplayAlert, FieldCheckbox, FieldNumber, FieldSelect, FieldText, RendererButton, RendererDialog, RendererDivider, RendererForm} = SparkComponent
const props = defineProps<{desktop: ReturnType<typeof useBlueprintDesktop>}>()
const viewKey = computed(() => props.desktop.viewKey.value)
const dictionary = (viewId: string): string => buildDataViewKey('_Base_DictData', viewId, LowcodeDictionary.editorScenarioId)
</script>

<style scoped>
.blueprint-desktop__divider {grid-column: 1 / -1}
</style>
