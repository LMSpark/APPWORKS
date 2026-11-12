<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-navigation-config
职责：项目蓝图“导航配置”页签：导航属性标准字段。
边界：字段绑定 owner 的 Base_NavigationInfo DataView 当前行，只写编辑覆盖并通知页面；保存与取消走页面统一入口。
AI用途：调整导航属性表单时只改本组件绑定，候选与校验由 use-blueprint-navigation 提供。
-->
<template>
  <section class="blueprint-navigation-config">
    <DisplayAlert v-if="dictionaryError" :description="dictionaryError" alert-type="warning" />
    <RendererForm v-bind="binding" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="2" label-width="120px">
      <FieldNumber v-if="access('FunOrderValue').read" v-bind="binding" data-member="currentRow" data-field="FunOrderValue" label="排序"
        :min="0" :readonly="!access('FunOrderValue').write" @update:model-value="changed" />
      <FieldText v-if="access('NavigationImageWxz').read" v-bind="binding" data-member="currentRow" data-field="NavigationImageWxz" label="图标"
        :readonly="!access('NavigationImageWxz').write" @update:model-value="changed" />
      <FieldText v-if="access('NavigationUrl').read" v-bind="binding" data-member="currentRow" data-field="NavigationUrl" label="导航地址"
        placeholder="填写由正式开发工具生成并进入当前 APP 构建的精确 vue:/... 资源；模块节点可留空"
        :readonly="!access('NavigationUrl').write" @update:model-value="changed" />
      <FieldText v-if="access('MobileUrl').read" v-bind="binding" data-member="currentRow" data-field="MobileUrl" label="移动端地址"
        :readonly="!access('MobileUrl').write" @update:model-value="changed" />
      <FieldCheckbox v-for="flag in flags" :key="flag.field" v-bind="{...binding, ...flagValues(flag.field)}" data-member="currentRow"
        :data-field="flag.field" :label="flag.label" :checkbox-text="flag.label" :readonly="!access(flag.field).write"
        @update:model-value="changed" />
      <FieldSelect v-if="isModule && access('ChildItemLocation').read" v-bind="binding" data-member="currentRow" data-field="ChildItemLocation"
        label="子项位置" :options="placementOptions" :clearable="true" :readonly="!access('ChildItemLocation').write" @update:model-value="changed" />
      <template v-if="!isModule">
        <FieldSelect v-if="access('NavigationType').read" v-bind="binding" data-member="currentRow" data-field="NavigationType" label="跳转方式"
          :options="openModeOptions" :clearable="true" :readonly="!access('NavigationType').write" @update:model-value="changed" />
        <FieldSelect v-if="access('NavigationShowType').read" v-bind="binding" data-member="currentRow" data-field="NavigationShowType" label="显示方式"
          :option-data-view-key="showTypeOptionsKey" option-value-field="val" option-label-field="txt"
          :readonly="!dictionaryReady || !access('NavigationShowType').write" @update:model-value="changed" />
        <FieldSelect v-if="access('HorizontalAlignment').read" v-bind="binding" data-member="currentRow" data-field="HorizontalAlignment" label="水平对齐"
          :option-data-view-key="alignmentOptionsKey" option-value-field="val" option-label-field="txt"
          :readonly="!dictionaryReady || !access('HorizontalAlignment').write" @update:model-value="changed" />
      </template>
    </RendererForm>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {useBlueprintNavigation} from './use-blueprint-navigation'

const {DisplayAlert, FieldCheckbox, FieldNumber, FieldSelect, FieldText, RendererForm} = SparkComponent
const props = defineProps<{
  navigation: ReturnType<typeof useBlueprintNavigation>
  binding: Readonly<{dataViewKey?: string}>
  access: (field: string) => Readonly<{read: boolean; write: boolean}>
  changed: () => void
}>()
const flags = computed(() => [
  {field: 'IsShowAtNav', label: '是否显示到导航'},
  {field: 'IsShowChildItem', label: '是否显示子项'},
  {field: 'BeginGroup', label: '是否分组'},
].filter(flag => props.access(flag.field).read))
const {dictionaryReady, dictionaryError, showTypeOptionsKey, alignmentOptionsKey, isModule, openModeOptions, placementOptions, flagValues} = props.navigation
</script>
