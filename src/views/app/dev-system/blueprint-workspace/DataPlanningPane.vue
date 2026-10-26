<!--
@module app:views/app/dev-system/blueprint-workspace/DataPlanningPane
职责：编辑正式场景绑定并挂载共享场景视图设计器。
边界：场景dirty时禁止改绑定；模型定义由后端提供，不写conType。
AI用途：在数据规划阶段编辑场景共享视图并处理缺文件显式新建。
-->
<template>
  <section class="stage-pane">
    <el-form label-width="110px">
      <el-form-item v-if="fieldAccess.read" label="业务场景"><el-input v-model="form.formKey" :disabled="state.pageDataDirty.value || !fieldAccess.write" placeholder="输入现有场景 ID（conid）" /></el-form-item>
    </el-form>
    <el-alert v-if="!fieldAccess.read" title="当前查询没有返回场景字段或读取权限" type="warning" :closable="false" />
    <div class="stage-actions"><el-button type="primary" :loading="saving" :disabled="state.pageDataDirty.value || !fieldAccess.write" @click="$emit('save')">保存节点修改</el-button></div>
    <DevDataSetDesigner v-if="form.formKey.trim() === (state.selectedNode.value?.dataSpace?.scenarioId ?? '')" :state="state" />
    <el-alert v-else title="保存场景绑定后加载该场景的共享视图配置" type="info" :closable="false" />
  </section>
</template>
<script setup lang="ts">
import type { DevState } from '../useDevState'
import DevDataSetDesigner from '../DevDataSetDesigner.vue'
defineProps<{ form: { formKey: string }; state: DevState; saving: boolean; fieldAccess: {read: boolean; write: boolean} }>()
defineEmits<{ save: [] }>()
</script>
