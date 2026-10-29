<!--
@module app:views/app/dev-system/blueprint-workspace/DataPlanningPane
职责：编辑正式场景绑定并挂载共享场景视图设计器。
边界：场景dirty时禁止改绑定；模型定义由后端提供，不写conType。
AI用途：在数据规划阶段编辑场景共享视图并处理缺文件显式新建。
-->
<template>
  <section class="stage-pane">
    <RendererForm v-if="fieldAccess.read" :auto-columns="false" :show-data-view-meta="false" label-width="110px">
      <DisplayText label="已保存场景" :model-value="state.persistedDataSpaceId.value || '未绑定'" tag="span" />
    </RendererForm>
    <DisplayAlert v-if="!fieldAccess.read" title="当前查询没有返回场景字段或读取权限" alert-type="warning" />
    <DisplayAlert v-if="state.sceneBindingPending.value" title="场景绑定尚未通过顶栏保存并正式回读；请先保存或取消节点修改，再加载设计器。" alert-type="warning" />
    <DevDataSetDesigner v-else-if="state.persistedDataSpaceId.value" :key="state.persistedDataSpaceId.value" :state="state" />
    <DisplayAlert v-else title="请先在当前数据空间中选择并保存一个正式场景。" alert-type="info" />
  </section>
</template>
<script setup lang="ts">
import type { DevState } from '../useDevState'
import DevDataSetDesigner from '../DevDataSetDesigner.vue'
import {DisplayAlert,DisplayText,RendererForm} from '@spark-appworks/spark-component'
defineProps<{ state: DevState; fieldAccess: {read: boolean; write: boolean} }>()
</script>
