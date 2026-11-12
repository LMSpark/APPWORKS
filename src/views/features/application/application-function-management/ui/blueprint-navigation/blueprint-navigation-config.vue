<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-navigation-config
职责：项目蓝图“导航配置”页签：导航属性标准字段。
边界：字段绑定 owner 的 Base_NavigationInfo DataView 当前行，可读、可写由正式查询的字段权限决定；只写编辑覆盖并通知页面，
  保存与取消走页面统一入口；候选来自正式字典视图。
AI用途：调整导航属性表单时只改本组件绑定，候选视图键由 use-blueprint-navigation 提供。
-->
<template>
  <section class="blueprint-navigation-config">
    <DisplayAlert v-if="navigation.dictionaryError.value" :description="navigation.dictionaryError.value" alert-type="warning" />
    <RendererForm v-bind="binding" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false"
      :grid-columns="2" label-width="120px">
      <FieldNumber v-bind="binding" data-member="currentRow" data-field="FunOrderValue" label="排序" :min="0" @update:model-value="changed" />
      <FieldText v-bind="binding" data-member="currentRow" data-field="NavigationImageWxz" label="图标" @update:model-value="changed" />
      <FieldText v-bind="binding" data-member="currentRow" data-field="NavigationUrl" label="导航地址"
        placeholder="填写由正式开发工具生成并进入当前 APP 构建的精确 vue:/... 资源；模块节点可留空" @update:model-value="changed" />
      <FieldText v-bind="binding" data-member="currentRow" data-field="MobileUrl" label="移动端地址" @update:model-value="changed" />
      <FieldCheckbox v-bind="binding" data-member="currentRow" data-field="IsShowAtNav" label="是否显示到导航" checkbox-text="是否显示到导航"
        :true-value="1" :false-value="0" @update:model-value="changed" />
      <FieldCheckbox v-bind="binding" data-member="currentRow" data-field="IsShowChildItem" label="是否显示子项" checkbox-text="是否显示子项"
        :true-value="1" :false-value="0" @update:model-value="changed" />
      <FieldSelect v-if="navigation.isModule.value" v-bind="binding" data-member="currentRow" data-field="ChildItemLocation" label="子项位置"
        :option-data-view-key="navigation.placementOptionsKey" :clearable="true" @update:model-value="changed" />
      <template v-else>
        <FieldSelect v-bind="binding" data-member="currentRow" data-field="NavigationType" label="跳转方式"
          :option-data-view-key="navigation.openModeOptionsKey" :clearable="true" @update:model-value="changed" />
        <FieldSelect v-bind="binding" data-member="currentRow" data-field="NavigationShowType" label="显示方式"
          :option-data-view-key="navigation.showTypeOptionsKey" @update:model-value="changed" />
        <FieldSelect v-bind="binding" data-member="currentRow" data-field="HorizontalAlignment" label="水平对齐"
          :option-data-view-key="navigation.alignmentOptionsKey" @update:model-value="changed" />
      </template>
    </RendererForm>
  </section>
</template>

<script setup lang="ts">
import * as SparkComponent from '@spark-appworks/spark-component'
import type {useBlueprintNavigation} from './use-blueprint-navigation'

const {DisplayAlert, FieldCheckbox, FieldNumber, FieldSelect, FieldText, RendererForm} = SparkComponent
defineProps<{
  navigation: ReturnType<typeof useBlueprintNavigation>
  binding: Readonly<{dataViewKey?: string}>
  changed: () => void
}>()
</script>
