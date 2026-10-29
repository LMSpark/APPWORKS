<!--
@module app:views/app/dev-system/blueprint-workspace/ReleasePane
职责：编辑导航发布可见性和类型并展示运行资源摘要。
边界：运行资源只读投影，发布写入由父工作台真实API确认。
AI用途：设置正式节点导航发布参数并查看cfg或vue资源表面。
-->
<template>
  <section class="stage-pane">
    <RendererForm v-bind="binding" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="110px">
      <FieldSwitch v-if="visibilityAccess.read && visibilityBoolean" data-member="currentRow" data-field="IsShowAtNav" label="导航可见" :readonly="!visibilityAccess.write" @update:model-value="$emit('changed')" />
      <FieldRadio v-else-if="visibilityAccess.read" data-member="currentRow" data-field="IsShowAtNav" label="导航可见" :options="visibilityOptions" :button-style="true" :readonly="!visibilityAccess.write" @update:model-value="$emit('changed')" />
      <FieldSelect v-if="navigationAccess.read" data-member="currentRow" data-field="NavigationType" label="导航类型" :options="navigationOptions" :readonly="!navigationAccess.write" :clearable="false" @update:model-value="$emit('changed')" />
      <FieldText v-if="runtimeAccess.read" data-member="currentRow" data-field="NavigationUrl" label="运行资源" readonly empty-text="未配置" :display-formatter="formatRuntimeResource" />
      <DisplayAlert v-if="!visibilityAccess.read && !navigationAccess.read" title="当前查询未返回发布字段或读取权限" alert-type="warning" />
    </RendererForm>
    <div class="stage-actions"><RendererButton label="保存节点修改" button-type="primary" :loading="saving" :disabled="!visibilityAccess.write && !navigationAccess.write" @click="$emit('save')" /></div>
  </section>
</template>

<script setup lang="ts">
import {DisplayAlert,FieldRadio,FieldSelect,FieldSwitch,FieldText,RendererButton,RendererForm} from '@spark-appworks/spark-component'
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
type Option={label:string;value:string|number}
defineProps<{binding:BlueprintWorkspaceDataView['standardComponentBinding'];saving:boolean;visibilityAccess:{read:boolean;write:boolean};navigationAccess:{read:boolean;write:boolean};runtimeAccess:{read:boolean;write:boolean};visibilityBoolean:boolean;visibilityOptions:Option[];navigationOptions:Option[]} >()
defineEmits<{save:[];changed:[]}>()
function formatRuntimeResource(value:unknown):string {
  const target=String(value??'')
  return target.startsWith('cfg:')?'配置页面资源':target.startsWith('vue:')?'Vue 页面资源':'未配置'
}
</script>
